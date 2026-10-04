"""Scan persistence. Every user facing query is scoped by user_id (other users get None).

State changes made by the worker and the janitor are conditional UPDATEs on the current status,
so a scan that was deleted, cancelled or already failed is never resurrected.
"""

import base64
import binascii
import json
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode
from app.db.models import (
    Disease,
    Plant,
    Scan,
    ScanFeedback,
    ScanStage,
    ScanStatus,
    ScanVerdict,
    User,
)

TOP_DISEASE_LIMIT = 5


@dataclass(frozen=True)
class ScanRecord:
    scan: Scan
    plant: Plant | None
    disease: Disease | None


@dataclass(frozen=True)
class ScanPage:
    items: list[ScanRecord]
    next_cursor: str | None


@dataclass(frozen=True)
class TopDisease:
    plant_slug: str
    plant_name: str
    disease_slug: str
    disease_name: str
    display_name: str
    count: int


@dataclass(frozen=True)
class StatsRow:
    total: int
    last_30_days: int
    by_verdict: dict[str, int]
    top_diseases: list[TopDisease]


@dataclass(frozen=True)
class FeedbackExportRow:
    scan_id: uuid.UUID
    created_at: datetime
    verdict: str | None
    predicted_plant: str | None
    predicted_disease: str | None
    confidence: str | None
    is_correct: bool
    correct_plant: str | None
    correct_disease: str | None
    comment: str | None
    image_key: str


def encode_cursor(created_at: datetime, scan_id: uuid.UUID) -> str:
    payload = json.dumps({"t": created_at.astimezone(UTC).isoformat(), "i": str(scan_id)})
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        body = json.loads(base64.urlsafe_b64decode(padded.encode()))
        created_at = datetime.fromisoformat(body["t"])
        scan_id = uuid.UUID(body["i"])
    except (ValueError, KeyError, TypeError, binascii.Error, UnicodeDecodeError) as exc:
        raise AppError(ErrorCode.INVALID_CURSOR) from exc
    if created_at.tzinfo is None:
        raise AppError(ErrorCode.INVALID_CURSOR)
    return created_at, scan_id


def _with_labels() -> Any:
    return (
        select(Scan, Plant, Disease)
        .outerjoin(Plant, Plant.id == Scan.plant_id)
        .outerjoin(Disease, Disease.id == Scan.disease_id)
    )


class ScanRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ---- reads -------------------------------------------------------------------------

    async def get_owned(self, *, user_id: uuid.UUID, scan_id: uuid.UUID) -> Scan | None:
        result = await self._session.execute(
            select(Scan).where(Scan.id == scan_id, Scan.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_owned_record(
        self, *, user_id: uuid.UUID, scan_id: uuid.UUID
    ) -> ScanRecord | None:
        result = await self._session.execute(
            _with_labels().where(Scan.id == scan_id, Scan.user_id == user_id)
        )
        row = result.first()
        return ScanRecord(row[0], row[1], row[2]) if row else None

    async def get_for_worker(self, scan_id: uuid.UUID) -> Scan | None:
        result = await self._session.execute(select(Scan).where(Scan.id == scan_id))
        return result.scalar_one_or_none()

    async def count_for_user(self, user_id: uuid.UUID) -> int:
        result = await self._session.execute(
            select(func.count()).select_from(Scan).where(Scan.user_id == user_id)
        )
        return int(result.scalar_one())

    async def lock_user(self, user_id: uuid.UUID) -> None:
        """Serialize concurrent creates of one user so the quota cannot be overshot."""
        await self._session.execute(select(User.id).where(User.id == user_id).with_for_update())

    async def list_page(
        self,
        *,
        user_id: uuid.UUID,
        limit: int,
        cursor: str | None,
        status: ScanStatus | None,
        verdict: ScanVerdict | None,
        plant_slug: str | None,
    ) -> ScanPage:
        statement = _with_labels().where(Scan.user_id == user_id)
        if status is not None:
            statement = statement.where(Scan.status == status)
        if verdict is not None:
            statement = statement.where(Scan.verdict == verdict)
        if plant_slug:
            statement = statement.where(Plant.slug == plant_slug)
        if cursor:
            after, after_id = decode_cursor(cursor)
            statement = statement.where(
                or_(
                    Scan.created_at < after,
                    and_(Scan.created_at == after, Scan.id < after_id),
                )
            )
        result = await self._session.execute(
            statement.order_by(Scan.created_at.desc(), Scan.id.desc()).limit(limit + 1)
        )
        rows = [ScanRecord(r[0], r[1], r[2]) for r in result.all()]
        page = rows[:limit]
        next_cursor = None
        if len(rows) > limit:
            last = page[-1].scan
            next_cursor = encode_cursor(last.created_at, last.id)
        return ScanPage(items=page, next_cursor=next_cursor)

    async def stats(self, *, user_id: uuid.UUID, since: datetime) -> StatsRow:
        recent = func.count().filter(Scan.created_at >= since)
        grouped = await self._session.execute(
            select(Scan.verdict, func.count(), recent)
            .where(Scan.user_id == user_id, Scan.status == ScanStatus.COMPLETED)
            .group_by(Scan.verdict)
        )
        by_verdict = {verdict.value: 0 for verdict in ScanVerdict}
        total = last_30 = 0
        for verdict, count, recent_count in grouped.all():
            if verdict is None:
                continue
            by_verdict[verdict.value] = int(count)
            total += int(count)
            last_30 += int(recent_count)
        count_column = func.count().label("n")
        top = await self._session.execute(
            select(
                Plant.slug,
                Plant.common_name,
                Disease.slug,
                Disease.name,
                Disease.display_name,
                count_column,
            )
            .select_from(Scan)
            .join(Disease, Disease.id == Scan.disease_id)
            .join(Plant, Plant.id == Disease.plant_id)
            .where(
                Scan.user_id == user_id,
                Scan.status == ScanStatus.COMPLETED,
                Scan.verdict == ScanVerdict.DISEASE,
            )
            .group_by(
                Plant.slug, Plant.common_name, Disease.slug, Disease.name, Disease.display_name
            )
            .order_by(count_column.desc(), Disease.name, Plant.slug)
            .limit(TOP_DISEASE_LIMIT)
        )
        return StatsRow(
            total=total,
            last_30_days=last_30,
            by_verdict=by_verdict,
            top_diseases=[
                TopDisease(r[0], r[1], r[2], r[3], r[4] or r[3], int(r[5])) for r in top.all()
            ],
        )

    # ---- writes ------------------------------------------------------------------------

    async def create(self, *, scan_id: uuid.UUID, user_id: uuid.UUID, image_key: str) -> None:
        self._session.add(
            Scan(
                id=scan_id,
                user_id=user_id,
                image_key=image_key,
                status=ScanStatus.PROCESSING,
                stage=ScanStage.VALIDATING,
            )
        )
        await self._session.flush()

    async def delete_by_id(self, scan_id: uuid.UUID) -> None:
        await self._session.execute(delete(Scan).where(Scan.id == scan_id))

    async def _transition(
        self,
        scan_id: uuid.UUID,
        expected: ScanStatus,
        *,
        attempt: int | None = None,
        **values: Any,
    ) -> bool:
        conditions = [Scan.id == scan_id, Scan.status == expected]
        if attempt is not None:
            conditions.append(Scan.attempt == attempt)
        result = await self._session.execute(
            update(Scan).where(*conditions).values(**values).returning(Scan.id)
        )
        return result.first() is not None

    async def set_stage(self, scan_id: uuid.UUID, stage: ScanStage, *, attempt: int) -> bool:
        return await self._transition(scan_id, ScanStatus.PROCESSING, attempt=attempt, stage=stage)

    async def complete(
        self,
        scan_id: uuid.UUID,
        *,
        attempt: int,
        verdict: ScanVerdict,
        plant_id: int | None,
        disease_id: int | None,
        confidence: str | None,
        raw_prediction: dict[str, Any],
    ) -> bool:
        return await self._transition(
            scan_id,
            ScanStatus.PROCESSING,
            attempt=attempt,
            status=ScanStatus.COMPLETED,
            stage=None,
            failure_code=None,
            verdict=verdict,
            plant_id=plant_id,
            disease_id=disease_id,
            confidence=confidence,
            raw_prediction=raw_prediction,
        )

    async def fail(self, scan_id: uuid.UUID, failure_code: str, *, attempt: int) -> bool:
        return await self._transition(
            scan_id,
            ScanStatus.PROCESSING,
            attempt=attempt,
            status=ScanStatus.FAILED,
            stage=None,
            failure_code=failure_code,
        )

    async def restart_failed(self, scan_id: uuid.UUID) -> int | None:
        """Start a new run of a failed scan and return its attempt number (None if not failed)."""
        result = await self._session.execute(
            update(Scan)
            .where(Scan.id == scan_id, Scan.status == ScanStatus.FAILED)
            .values(
                status=ScanStatus.PROCESSING,
                stage=ScanStage.ANALYZING,
                failure_code=None,
                attempt=Scan.attempt + 1,
            )
            .returning(Scan.attempt)
        )
        row = result.first()
        return int(row[0]) if row else None

    async def fail_stuck(self, *, older_than: datetime, failure_code: str) -> int:
        result = await self._session.execute(
            update(Scan)
            .where(Scan.status == ScanStatus.PROCESSING, Scan.updated_at < older_than)
            .values(status=ScanStatus.FAILED, stage=None, failure_code=failure_code)
            .returning(Scan.id)
        )
        return len(result.all())

    # ---- feedback ----------------------------------------------------------------------

    async def get_feedback(self, scan_id: uuid.UUID) -> ScanFeedback | None:
        result = await self._session.execute(
            select(ScanFeedback).where(ScanFeedback.scan_id == scan_id)
        )
        return result.scalar_one_or_none()

    async def upsert_feedback(
        self,
        scan_id: uuid.UUID,
        *,
        is_correct: bool,
        correct_plant_slug: str | None,
        correct_disease_slug: str | None,
        comment: str | None,
    ) -> ScanFeedback:
        values = {
            "is_correct": is_correct,
            "correct_plant_slug": correct_plant_slug,
            "correct_disease_slug": correct_disease_slug,
            "comment": comment,
        }
        statement = (
            pg_insert(ScanFeedback)
            .values(scan_id=scan_id, **values)
            .on_conflict_do_update(
                index_elements=[ScanFeedback.scan_id],
                set_={**values, "updated_at": func.now()},
            )
            .returning(ScanFeedback)
        )
        result = await self._session.execute(statement.execution_options(populate_existing=True))
        return result.scalar_one()

    async def delete_feedback(self, scan_id: uuid.UUID) -> None:
        await self._session.execute(delete(ScanFeedback).where(ScanFeedback.scan_id == scan_id))

    async def feedback_export_rows(self) -> Sequence[FeedbackExportRow]:
        result = await self._session.execute(
            select(Scan, Plant.slug, Disease.slug, ScanFeedback)
            .join(ScanFeedback, ScanFeedback.scan_id == Scan.id)
            .outerjoin(Plant, Plant.id == Scan.plant_id)
            .outerjoin(Disease, Disease.id == Scan.disease_id)
            .order_by(ScanFeedback.updated_at, Scan.id)
        )
        return [
            FeedbackExportRow(
                scan_id=scan.id,
                created_at=scan.created_at,
                verdict=scan.verdict.value if scan.verdict else None,
                predicted_plant=plant_slug,
                predicted_disease=disease_slug,
                confidence=scan.confidence,
                is_correct=feedback.is_correct,
                correct_plant=feedback.correct_plant_slug,
                correct_disease=feedback.correct_disease_slug,
                comment=feedback.comment,
                image_key=scan.image_key,
            )
            for scan, plant_slug, disease_slug, feedback in result.all()
        ]
