"""Email verify and password reset tokens (hashed). SQL only."""

import uuid
from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuthToken, AuthTokenType


class AuthTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(
        self,
        *,
        user_id: uuid.UUID,
        token_type: AuthTokenType,
        token_hash: str,
        expires_at: datetime,
        created_at: datetime | None = None,
    ) -> AuthToken:
        row = AuthToken(
            id=uuid.uuid4(),
            user_id=user_id,
            type=token_type,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        if created_at is not None:
            row.created_at = created_at
        self._session.add(row)
        await self._session.flush()
        return row

    async def consume(
        self, *, token_hash: str, token_type: AuthTokenType, now: datetime
    ) -> uuid.UUID | None:
        """Atomically mark an unused, unexpired token used and return its user id."""
        result = await self._session.execute(
            update(AuthToken)
            .where(
                AuthToken.token_hash == token_hash,
                AuthToken.type == token_type,
                AuthToken.used_at.is_(None),
                AuthToken.expires_at > now,
            )
            .values(used_at=now)
            .returning(AuthToken.user_id)
        )
        return result.scalar_one_or_none()

    async def invalidate_unused(
        self, *, user_id: uuid.UUID, token_type: AuthTokenType, now: datetime
    ) -> int:
        """Mark older unused tokens of one type used, so only the newest link works."""
        result = await self._session.execute(
            update(AuthToken)
            .where(
                AuthToken.user_id == user_id,
                AuthToken.type == token_type,
                AuthToken.used_at.is_(None),
            )
            .values(used_at=now)
        )
        return int(result.rowcount or 0)  # type: ignore[attr-defined]

    async def latest_created_at(
        self, *, user_id: uuid.UUID, token_type: AuthTokenType
    ) -> datetime | None:
        result = await self._session.execute(
            select(func.max(AuthToken.created_at)).where(
                AuthToken.user_id == user_id, AuthToken.type == token_type
            )
        )
        return result.scalar_one_or_none()

    async def delete_expired(self, *, now: datetime) -> int:
        result = await self._session.execute(delete(AuthToken).where(AuthToken.expires_at <= now))
        return int(result.rowcount or 0)  # type: ignore[attr-defined]
