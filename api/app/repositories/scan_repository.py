"""Scan persistence skeleton. Every query is scoped by user_id (other users get None)."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Scan


class ScanRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_owned(self, *, user_id: uuid.UUID, scan_id: uuid.UUID) -> Scan | None:
        result = await self._session.execute(
            select(Scan).where(Scan.id == scan_id, Scan.user_id == user_id)
        )
        return result.scalar_one_or_none()
