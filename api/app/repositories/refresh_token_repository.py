"""Refresh token persistence. SQL only; the service owns rotation rules."""

import uuid
from datetime import datetime

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RefreshToken


class RefreshTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(
        self,
        *,
        token_id: uuid.UUID,
        user_id: uuid.UUID,
        family_id: uuid.UUID,
        token_hash: str,
        created_at: datetime,
        expires_at: datetime,
        family_expires_at: datetime,
        ip: str | None,
        user_agent: str | None,
        auth_method: str = "password",
        auth_at: datetime | None = None,
    ) -> RefreshToken:
        row = RefreshToken(
            id=token_id,
            user_id=user_id,
            family_id=family_id,
            token_hash=token_hash,
            created_at=created_at,
            expires_at=expires_at,
            family_expires_at=family_expires_at,
            ip=ip,
            user_agent=user_agent,
            auth_method=auth_method,
            auth_at=auth_at,
        )
        self._session.add(row)
        await self._session.flush()
        return row

    async def get_by_hash_for_update(self, token_hash: str) -> RefreshToken | None:
        """Lock the row so concurrent refreshes of one token serialize."""
        result = await self._session.execute(
            select(RefreshToken)
            .where(RefreshToken.token_hash == token_hash)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        result = await self._session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def mark_rotated(
        self, token_id: uuid.UUID, *, rotated_at: datetime, replaced_by: uuid.UUID
    ) -> None:
        await self._session.execute(
            update(RefreshToken)
            .where(RefreshToken.id == token_id)
            .values(rotated_at=rotated_at, replaced_by=replaced_by)
        )

    async def revoke_family(self, family_id: uuid.UUID, *, at: datetime, reason: str) -> int:
        result = await self._session.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=at, revoked_reason=reason)
        )
        return int(result.rowcount or 0)  # type: ignore[attr-defined]

    async def revoke_all_for_user(self, user_id: uuid.UUID, *, at: datetime, reason: str) -> int:
        result = await self._session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=at, revoked_reason=reason)
        )
        return int(result.rowcount or 0)  # type: ignore[attr-defined]

    async def latest_family_started_at(self, user_id: uuid.UUID) -> datetime | None:
        """Start time of the newest sign in (token family) that has not been revoked."""
        started = (
            select(func.min(RefreshToken.created_at).label("started"))
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .group_by(RefreshToken.family_id)
            .subquery()
        )
        result = await self._session.execute(select(func.max(started.c.started)))
        latest: datetime | None = result.scalar_one_or_none()
        return latest

    async def delete_expired(self, *, now: datetime) -> int:
        """Remove rows whose whole family is past its cap, or that were revoked long ago."""
        result = await self._session.execute(
            delete(RefreshToken).where(
                or_(RefreshToken.family_expires_at <= now, RefreshToken.expires_at <= now)
            )
        )
        return int(result.rowcount or 0)  # type: ignore[attr-defined]
