import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import OAuthIdentity, OAuthProvider


class OAuthIdentityRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def providers_for_user(self, user_id: uuid.UUID) -> list[str]:
        result = await self._session.execute(
            select(OAuthIdentity.provider)
            .where(OAuthIdentity.user_id == user_id)
            .order_by(OAuthIdentity.provider)
        )
        return [provider.value for provider in result.scalars().all()]

    async def get_by_subject(self, provider: OAuthProvider, subject: str) -> OAuthIdentity | None:
        result = await self._session.execute(
            select(OAuthIdentity).where(
                OAuthIdentity.provider == provider, OAuthIdentity.provider_sub == subject
            )
        )
        return result.scalar_one_or_none()

    async def add(
        self, *, user_id: uuid.UUID, provider: OAuthProvider, subject: str, email: str
    ) -> OAuthIdentity:
        """Insert a link. A duplicate (provider, sub) raises IntegrityError (use a savepoint)."""
        row = OAuthIdentity(
            id=uuid.uuid4(), user_id=user_id, provider=provider, provider_sub=subject, email=email
        )
        self._session.add(row)
        await self._session.flush()
        return row
