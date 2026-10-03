"""UnitOfWork: one session and one transaction per request, explicit commit."""

from types import TracebackType
from typing import Self

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.repositories.auth_token_repository import AuthTokenRepository
from app.repositories.catalog_repository import CatalogRepository
from app.repositories.oauth_identity_repository import OAuthIdentityRepository
from app.repositories.refresh_token_repository import RefreshTokenRepository
from app.repositories.scan_repository import ScanRepository
from app.repositories.storage_outbox_repository import StorageOutboxRepository
from app.repositories.user_repository import UserRepository


class UnitOfWork:
    session: AsyncSession
    users: UserRepository
    oauth_identities: OAuthIdentityRepository
    refresh_tokens: RefreshTokenRepository
    auth_tokens: AuthTokenRepository
    scans: ScanRepository
    catalog: CatalogRepository
    storage_outbox: StorageOutboxRepository

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def __aenter__(self) -> Self:
        self.session = self._session_factory()
        self.users = UserRepository(self.session)
        self.oauth_identities = OAuthIdentityRepository(self.session)
        self.refresh_tokens = RefreshTokenRepository(self.session)
        self.auth_tokens = AuthTokenRepository(self.session)
        self.scans = ScanRepository(self.session)
        self.catalog = CatalogRepository(self.session)
        self.storage_outbox = StorageOutboxRepository(self.session)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        try:
            # Anything not committed explicitly is discarded, success path included.
            await self.session.rollback()
        finally:
            await self.session.close()

    async def commit(self) -> None:
        await self.session.commit()

    async def rollback(self) -> None:
        await self.session.rollback()
