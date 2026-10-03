"""Delete expired refresh and email tokens. Run periodically: python -m app.jobs.cleanup_tokens"""

import asyncio
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import Clock, SystemClock
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.db.session import create_engine, create_session_factory
from app.db.uow import UnitOfWork


@dataclass(frozen=True)
class CleanupResult:
    refresh_tokens: int
    auth_tokens: int


async def cleanup_tokens(
    session_factory: async_sessionmaker[AsyncSession], clock: Clock | None = None
) -> CleanupResult:
    now = (clock or SystemClock()).now()
    async with UnitOfWork(session_factory) as uow:
        refresh = await uow.refresh_tokens.delete_expired(now=now)
        auth = await uow.auth_tokens.delete_expired(now=now)
        await uow.commit()
    return CleanupResult(refresh_tokens=refresh, auth_tokens=auth)


async def _main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    engine = create_engine(settings.database_url, null_pool=True)
    try:
        result = await cleanup_tokens(create_session_factory(engine))
    finally:
        await engine.dispose()
    get_logger("leafy.jobs").info(
        "tokens_cleaned", refresh=result.refresh_tokens, auth=result.auth_tokens
    )


if __name__ == "__main__":
    asyncio.run(_main())
