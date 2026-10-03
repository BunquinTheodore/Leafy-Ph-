"""Storage deletion outbox. SQL only; the purge service owns retry rules."""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Scan, StorageDeletion

INSERT_CHUNK = 500


@dataclass(frozen=True)
class OutboxItem:
    id: int
    bucket: str
    object_key: str
    attempts: int


class StorageOutboxRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def scan_image_keys(self, user_id: uuid.UUID) -> list[str]:
        result = await self._session.execute(select(Scan.image_key).where(Scan.user_id == user_id))
        return list(result.scalars().all())

    async def enqueue(self, *, bucket: str, keys: Sequence[str], due_at: datetime) -> int:
        """Queue object keys for deletion. Duplicates are harmless: deletes are idempotent."""
        for start in range(0, len(keys), INSERT_CHUNK):
            chunk = keys[start : start + INSERT_CHUNK]
            await self._session.execute(
                insert(StorageDeletion),
                [{"bucket": bucket, "object_key": key, "next_attempt_at": due_at} for key in chunk],
            )
        return len(keys)

    async def lease_due(
        self, *, now: datetime, lease_until: datetime, limit: int
    ) -> list[OutboxItem]:
        """Claim due rows by pushing their next attempt into the future (safe with many workers)."""
        due = (
            select(StorageDeletion.id)
            .where(StorageDeletion.next_attempt_at <= now)
            .order_by(StorageDeletion.next_attempt_at, StorageDeletion.id)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        result = await self._session.execute(
            update(StorageDeletion)
            .where(StorageDeletion.id.in_(due))
            .values(next_attempt_at=lease_until)
            .returning(
                StorageDeletion.id,
                StorageDeletion.bucket,
                StorageDeletion.object_key,
                StorageDeletion.attempts,
            )
        )
        return [OutboxItem(*row) for row in result.all()]

    async def delete_done(self, ids: Sequence[int]) -> None:
        if ids:
            await self._session.execute(delete(StorageDeletion).where(StorageDeletion.id.in_(ids)))

    async def record_failure(
        self, item_id: int, *, attempts: int, next_attempt_at: datetime, error: str
    ) -> None:
        await self._session.execute(
            update(StorageDeletion)
            .where(StorageDeletion.id == item_id)
            .values(attempts=attempts, next_attempt_at=next_attempt_at, last_error=error[:300])
        )

    async def count(self) -> int:
        result = await self._session.execute(select(func.count()).select_from(StorageDeletion))
        return int(result.scalar_one())
