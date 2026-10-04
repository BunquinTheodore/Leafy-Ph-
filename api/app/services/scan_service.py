"""Scan use cases: create, read, list, stats, delete, retry and result feedback."""

import asyncio
import uuid
from datetime import timedelta

from app.core.background import BackgroundRunner
from app.core.clock import Clock
from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.core.logging import get_logger
from app.db.models import Scan, ScanFeedback, ScanStage, ScanStatus, ScanVerdict, User
from app.db.uow import UnitOfWork
from app.repositories.scan_repository import ScanRecord, StatsRow
from app.schemas.catalog import PlantRefOut
from app.schemas.scan import (
    ScanCreatedOut,
    ScanDeletedOut,
    ScanDetailOut,
    ScanDiseaseOut,
    ScanFeedbackIn,
    ScanFeedbackOut,
    ScanListOut,
    ScanStatsOut,
    ScanSummaryOut,
    TopDiseaseOut,
    VerdictCountsOut,
)
from app.services.catalog_service import CatalogService, UrlBuilder
from app.services.image_validator import CONTENT_TYPE, sanitize_image
from app.services.infra.storage_service import StorageError, StorageService
from app.services.purge_service import PurgeService
from app.services.scan_worker import ScanJob, ScanQueue

STATS_WINDOW_DAYS = 30
HEALTHY_SLUG = "healthy"

_log = get_logger("leafy.scans")


def image_key_for(user_id: uuid.UUID, scan_id: uuid.UUID) -> str:
    """Server generated, never derived from anything the client sent."""
    return f"{user_id}/{scan_id}.jpg"


def _invalid_field(field: str, rule: str) -> AppError:
    return AppError(ErrorCode.VALIDATION_ERROR, details=[{"field": field, "type": rule}])


class ScanService:
    def __init__(
        self,
        *,
        uow: UnitOfWork,
        storage: StorageService,
        queue: ScanQueue,
        runner: BackgroundRunner,
        purge: PurgeService,
        public_url: UrlBuilder,
        settings: Settings,
        clock: Clock,
    ) -> None:
        self._uow = uow
        self._storage = storage
        self._queue = queue
        self._runner = runner
        self._purge = purge
        self._catalog = CatalogService(uow, public_url)
        self._settings = settings
        self._clock = clock

    # ---- create and retry ----------------------------------------------------------------

    async def create(self, user: User, raw: bytes) -> ScanCreatedOut:
        user_id = user.id
        await self._ensure_quota(user_id)
        image = await asyncio.to_thread(
            sanitize_image, raw, max_bytes=self._settings.max_upload_bytes
        )
        scan_id = uuid.uuid4()
        key = image_key_for(user_id, scan_id)
        try:
            await self._storage.put_object(
                self._settings.s3_scans_bucket, key, image.data, CONTENT_TYPE
            )
        except StorageError as exc:
            _log.error("scan_upload_failed", user_id=str(user_id))
            raise AppError(ErrorCode.STORAGE_UNAVAILABLE) from exc
        try:
            await self._uow.scans.lock_user(user_id)
            await self._ensure_quota(user_id)
            await self._uow.scans.create(scan_id=scan_id, user_id=user_id, image_key=key)
            await self._uow.commit()
        except BaseException:
            await self._uow.rollback()
            await self._discard_object(key)
            raise
        await self._queue.enqueue(ScanJob(scan_id=scan_id, user_id=user_id, image_key=key))
        return ScanCreatedOut(id=scan_id, status=ScanStatus.PROCESSING, stage=ScanStage.VALIDATING)

    async def retry(self, user_id: uuid.UUID, scan_id: uuid.UUID) -> ScanCreatedOut:
        scan = await self._owned(user_id, scan_id)
        if scan.status is not ScanStatus.FAILED:
            raise AppError(ErrorCode.SCAN_NOT_FAILED)
        image_key = scan.image_key
        attempt = await self._uow.scans.restart_failed(scan_id)
        if attempt is None:
            raise AppError(ErrorCode.SCAN_NOT_FAILED)
        await self._uow.commit()
        await self._queue.enqueue(
            ScanJob(scan_id=scan_id, user_id=user_id, image_key=image_key, attempt=attempt)
        )
        return ScanCreatedOut(id=scan_id, status=ScanStatus.PROCESSING, stage=ScanStage.ANALYZING)

    async def _ensure_quota(self, user_id: uuid.UUID) -> None:
        if await self._uow.scans.count_for_user(user_id) >= self._settings.scan_quota:
            raise AppError(ErrorCode.SCAN_QUOTA_EXCEEDED)

    async def _discard_object(self, key: str) -> None:
        """Compensation: do not leave an orphaned image when the row could not be saved."""
        try:
            failed = await self._storage.delete_objects(self._settings.s3_scans_bucket, [key])
        except StorageError:
            failed = [key]
        if failed:
            await self._uow.storage_outbox.enqueue(
                bucket=self._settings.s3_scans_bucket, keys=failed, due_at=self._clock.now()
            )
            await self._uow.commit()

    # ---- reads ---------------------------------------------------------------------------

    async def get(self, user_id: uuid.UUID, scan_id: uuid.UUID) -> ScanDetailOut:
        record = await self._uow.scans.get_owned_record(user_id=user_id, scan_id=scan_id)
        if record is None:
            raise AppError(ErrorCode.NOT_FOUND)
        summary = await self._summary(record)
        detail = None
        if record.plant is not None and record.disease is not None:
            detail = await self._catalog.disease_detail(record.plant.slug, record.disease.slug)
        feedback = await self._uow.scans.get_feedback(scan_id)
        return ScanDetailOut(
            **summary.model_dump(),
            disease_detail=detail,
            feedback=_feedback_out(feedback) if feedback else None,
        )

    async def list_scans(
        self,
        user_id: uuid.UUID,
        *,
        limit: int,
        cursor: str | None,
        status: ScanStatus | None,
        verdict: ScanVerdict | None,
        plant: str | None,
    ) -> ScanListOut:
        page = await self._uow.scans.list_page(
            user_id=user_id,
            limit=limit,
            cursor=cursor,
            status=status,
            verdict=verdict,
            plant_slug=plant,
        )
        items = await asyncio.gather(*(self._summary(record) for record in page.items))
        return ScanListOut(items=list(items), next_cursor=page.next_cursor)

    async def stats(self, user_id: uuid.UUID) -> ScanStatsOut:
        since = self._clock.now() - timedelta(days=STATS_WINDOW_DAYS)
        return _stats_out(await self._uow.scans.stats(user_id=user_id, since=since))

    async def _summary(self, record: ScanRecord) -> ScanSummaryOut:
        scan = record.scan
        ttl = self._settings.s3_presign_ttl_seconds
        try:
            url = await self._storage.presign_get(
                self._settings.s3_scans_bucket, scan.image_key, ttl
            )
        except StorageError as exc:
            raise AppError(ErrorCode.STORAGE_UNAVAILABLE) from exc
        plant, disease = record.plant, record.disease
        return ScanSummaryOut(
            id=scan.id,
            status=scan.status,
            stage=scan.stage,
            failure_code=scan.failure_code,
            verdict=scan.verdict,
            confidence=scan.confidence,
            plant=PlantRefOut(slug=plant.slug, name=plant.common_name) if plant else None,
            disease=(
                ScanDiseaseOut(
                    slug=disease.slug,
                    name=disease.name,
                    display_name=disease.display_name or disease.name,
                    severity=disease.severity,
                )
                if disease
                else None
            ),
            image_url=url,
            image_expires_at=self._clock.now() + timedelta(seconds=ttl),
            created_at=scan.created_at,
            updated_at=scan.updated_at,
        )

    # ---- delete --------------------------------------------------------------------------

    async def delete(self, user_id: uuid.UUID, scan_id: uuid.UUID) -> ScanDeletedOut:
        scan = await self._owned(user_id, scan_id)
        await self._uow.storage_outbox.enqueue(
            bucket=self._settings.s3_scans_bucket, keys=[scan.image_key], due_at=self._clock.now()
        )
        await self._uow.scans.delete_by_id(scan_id)
        await self._uow.commit()
        self._runner.spawn(self._drain_quietly())
        return ScanDeletedOut(deleted=True)

    async def _drain_quietly(self) -> None:
        await self._purge.drain_all()

    # ---- feedback ------------------------------------------------------------------------

    async def put_feedback(
        self, user_id: uuid.UUID, scan_id: uuid.UUID, payload: ScanFeedbackIn
    ) -> ScanFeedbackOut:
        scan = await self._owned(user_id, scan_id)
        if scan.status is not ScanStatus.COMPLETED:
            raise AppError(ErrorCode.SCAN_NOT_COMPLETED)
        plant_slug = disease_slug = None
        if not payload.is_correct:
            plant_slug, disease_slug = await self._validated_correction(payload)
        saved = await self._uow.scans.upsert_feedback(
            scan_id,
            is_correct=payload.is_correct,
            correct_plant_slug=plant_slug,
            correct_disease_slug=disease_slug,
            comment=payload.comment,
        )
        await self._uow.commit()
        return _feedback_out(saved)

    async def delete_feedback(self, user_id: uuid.UUID, scan_id: uuid.UUID) -> ScanDeletedOut:
        await self._owned(user_id, scan_id)
        await self._uow.scans.delete_feedback(scan_id)
        await self._uow.commit()
        return ScanDeletedOut(deleted=True)

    async def _validated_correction(self, payload: ScanFeedbackIn) -> tuple[str | None, str | None]:
        plant_slug, disease_slug = payload.correct_plant, payload.correct_disease
        if plant_slug is None:
            if disease_slug is not None:
                raise _invalid_field("correct_plant", "required_with_disease")
            return None, None
        if await self._uow.catalog.get_plant(plant_slug) is None:
            raise _invalid_field("correct_plant", "unknown_plant")
        if disease_slug is None or disease_slug == HEALTHY_SLUG:
            return plant_slug, disease_slug
        if await self._uow.catalog.get_disease(plant_slug, disease_slug) is None:
            raise _invalid_field("correct_disease", "unknown_disease")
        return plant_slug, disease_slug

    async def _owned(self, user_id: uuid.UUID, scan_id: uuid.UUID) -> Scan:
        scan = await self._uow.scans.get_owned(user_id=user_id, scan_id=scan_id)
        if scan is None:
            raise AppError(ErrorCode.NOT_FOUND)
        return scan


def _feedback_out(feedback: ScanFeedback) -> ScanFeedbackOut:
    return ScanFeedbackOut(
        is_correct=feedback.is_correct,
        correct_plant=feedback.correct_plant_slug,
        correct_disease=feedback.correct_disease_slug,
        comment=feedback.comment,
        updated_at=feedback.updated_at,
    )


def _stats_out(row: StatsRow) -> ScanStatsOut:
    return ScanStatsOut(
        total=row.total,
        last_30_days=row.last_30_days,
        by_verdict=VerdictCountsOut(**row.by_verdict),
        top_diseases=[
            TopDiseaseOut(
                plant_slug=item.plant_slug,
                plant_name=item.plant_name,
                disease_slug=item.disease_slug,
                disease_name=item.disease_name,
                display_name=item.display_name,
                count=item.count,
            )
            for item in row.top_diseases
        ],
    )
