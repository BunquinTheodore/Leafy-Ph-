"""Drain the storage deletion outbox: delete S3 objects, retry failures with backoff."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import Clock
from app.core.logging import get_logger
from app.db.uow import UnitOfWork
from app.repositories.storage_outbox_repository import OutboxItem
from app.services.infra.storage_service import StorageError, StorageService

LEASE_SECONDS = 300
BASE_BACKOFF_SECONDS = 30
MAX_BACKOFF_SECONDS = 3600
DEFAULT_BATCH = 200

_log = get_logger("leafy.purge")


@dataclass(frozen=True)
class DrainResult:
    deleted: int
    failed: int


def backoff_seconds(attempts: int) -> int:
    """Exponential backoff: 30s, 60s, 120s ... capped at one hour."""
    doublings = min(max(0, attempts - 1), 20)
    return min(MAX_BACKOFF_SECONDS, BASE_BACKOFF_SECONDS << doublings)


class PurgeService:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        storage: StorageService,
        clock: Clock,
    ) -> None:
        self._session_factory = session_factory
        self._storage = storage
        self._clock = clock

    async def drain(self, *, batch_size: int = DEFAULT_BATCH) -> DrainResult:
        """Process one batch of due rows. Safe to run from several workers at once."""
        async with UnitOfWork(self._session_factory) as uow:
            now = self._clock.now()
            items = await uow.storage_outbox.lease_due(
                now=now, lease_until=now + timedelta(seconds=LEASE_SECONDS), limit=batch_size
            )
            await uow.commit()
        if not items:
            return DrainResult(deleted=0, failed=0)

        failed_ids = await self._delete_all(items)
        async with UnitOfWork(self._session_factory) as uow:
            await uow.storage_outbox.delete_done([i.id for i in items if i.id not in failed_ids])
            for item in items:
                if item.id in failed_ids:
                    attempts = item.attempts + 1
                    await uow.storage_outbox.record_failure(
                        item.id,
                        attempts=attempts,
                        next_attempt_at=self._clock.now()
                        + timedelta(seconds=backoff_seconds(attempts)),
                        error="storage delete failed",
                    )
            await uow.commit()
        _log.info(
            "storage_purge_batch", deleted=len(items) - len(failed_ids), failed=len(failed_ids)
        )
        return DrainResult(deleted=len(items) - len(failed_ids), failed=len(failed_ids))

    async def _delete_all(self, items: list[OutboxItem]) -> set[int]:
        by_bucket: dict[str, list[OutboxItem]] = defaultdict(list)
        for item in items:
            by_bucket[item.bucket].append(item)
        failed: set[int] = set()
        for bucket, group in by_bucket.items():
            try:
                bad_keys = set(
                    await self._storage.delete_objects(bucket, [i.object_key for i in group])
                )
            except StorageError:
                bad_keys = {i.object_key for i in group}
            failed.update(i.id for i in group if i.object_key in bad_keys)
        return failed

    async def drain_all(
        self, *, batch_size: int = DEFAULT_BATCH, max_batches: int = 50
    ) -> DrainResult:
        """Keep draining until nothing is due (bounded, so a broken bucket cannot loop forever)."""
        deleted = failed = 0
        for _ in range(max_batches):
            result = await self.drain(batch_size=batch_size)
            deleted += result.deleted
            failed += result.failed
            if result.deleted + result.failed == 0:
                break
        return DrainResult(deleted=deleted, failed=failed)
