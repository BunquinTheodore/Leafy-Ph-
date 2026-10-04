"""Scan controller: verified email gate, rate limits, bounded upload read, then the service."""

import uuid

from fastapi import UploadFile

from app.core.errors import AppError, ErrorCode
from app.core.ratelimit import RateLimiter
from app.db.models import ScanStatus, ScanVerdict, User
from app.schemas.scan import (
    ScanCreatedOut,
    ScanDeletedOut,
    ScanDetailOut,
    ScanFeedbackIn,
    ScanFeedbackOut,
    ScanListOut,
    ScanStatsOut,
)
from app.services.scan_service import ScanService

SCAN_MINUTE_LIMIT = (10, 60)
SCAN_DAY_LIMIT = (100, 86_400)


class ScanController:
    def __init__(self, service: ScanService, limiter: RateLimiter, max_upload_bytes: int) -> None:
        self._service = service
        self._limiter = limiter
        self._max_upload_bytes = max_upload_bytes

    def _limit_scan_runs(self, user: User) -> None:
        for name, (limit, window) in (
            ("minute", SCAN_MINUTE_LIMIT),
            ("day", SCAN_DAY_LIMIT),
        ):
            self._limiter.hit(f"scan:{name}:{user.id}", limit=limit, window_seconds=window)

    async def create(self, user: User, image: UploadFile) -> ScanCreatedOut:
        if user.email_verified_at is None:
            raise AppError(ErrorCode.EMAIL_NOT_VERIFIED)
        self._limit_scan_runs(user)
        # One byte more than the cap is enough to know the file is too large.
        raw = await image.read(self._max_upload_bytes + 1)
        return await self._service.create(user, raw)

    async def retry(self, user: User, scan_id: uuid.UUID) -> ScanCreatedOut:
        self._limit_scan_runs(user)
        return await self._service.retry(user.id, scan_id)

    async def get(self, user: User, scan_id: uuid.UUID) -> ScanDetailOut:
        return await self._service.get(user.id, scan_id)

    async def list(
        self,
        user: User,
        *,
        limit: int,
        cursor: str | None,
        status: ScanStatus | None,
        verdict: ScanVerdict | None,
        plant: str | None,
    ) -> ScanListOut:
        return await self._service.list_scans(
            user.id, limit=limit, cursor=cursor, status=status, verdict=verdict, plant=plant
        )

    async def stats(self, user: User) -> ScanStatsOut:
        return await self._service.stats(user.id)

    async def delete(self, user: User, scan_id: uuid.UUID) -> ScanDeletedOut:
        return await self._service.delete(user.id, scan_id)

    async def put_feedback(
        self, user: User, scan_id: uuid.UUID, payload: ScanFeedbackIn
    ) -> ScanFeedbackOut:
        return await self._service.put_feedback(user.id, scan_id, payload)

    async def delete_feedback(self, user: User, scan_id: uuid.UUID) -> ScanDeletedOut:
        return await self._service.delete_feedback(user.id, scan_id)
