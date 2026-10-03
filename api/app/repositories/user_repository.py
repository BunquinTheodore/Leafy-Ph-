"""User queries. SQL only; no commits."""

import uuid
from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: uuid.UUID) -> User | None:
        return await self._session.get(User, user_id)

    async def get_by_email(self, email: str) -> User | None:
        result = await self._session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        email: str,
        password_hash: str | None,
        first_name: str,
        last_name: str,
        email_verified_at: datetime | None = None,
        password_changed_at: datetime | None = None,
    ) -> User:
        """Insert a user. A duplicate email raises IntegrityError (wrap in a savepoint)."""
        user = User(
            id=uuid.uuid4(),
            email=email,
            password_hash=password_hash,
            first_name=first_name,
            last_name=last_name,
            email_verified_at=email_verified_at,
            password_changed_at=password_changed_at,
        )
        self._session.add(user)
        await self._session.flush()
        return user

    async def replace_hash_only(self, user_id: uuid.UUID, password_hash: str) -> None:
        """Upgrade the stored hash parameters without marking the password as changed."""
        await self._session.execute(
            update(User).where(User.id == user_id).values(password_hash=password_hash)
        )

    async def set_password_hash(
        self, user_id: uuid.UUID, password_hash: str, changed_at: datetime
    ) -> None:
        await self._session.execute(
            update(User)
            .where(User.id == user_id)
            .values(password_hash=password_hash, password_changed_at=changed_at)
        )

    async def update_profile(self, user_id: uuid.UUID, values: dict[str, str]) -> None:
        if values:
            await self._session.execute(update(User).where(User.id == user_id).values(**values))

    async def mark_email_verified(self, user_id: uuid.UUID, at: datetime) -> bool:
        """Set the verified time once. Returns False when it was already verified."""
        result = await self._session.execute(
            update(User)
            .where(User.id == user_id, User.email_verified_at.is_(None))
            .values(email_verified_at=at)
        )
        return bool(result.rowcount)  # type: ignore[attr-defined]

    async def clear_password(self, user_id: uuid.UUID) -> None:
        await self._session.execute(
            update(User).where(User.id == user_id).values(password_hash=None)
        )

    async def delete(self, user_id: uuid.UUID) -> None:
        """Delete the user row. Scans, tokens and identities go with it (FK cascade)."""
        await self._session.execute(delete(User).where(User.id == user_id))
