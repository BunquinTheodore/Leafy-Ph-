"""Drain the storage deletion outbox, and clean expired tokens on a slower beat.

python -m app.jobs.purge_storage            drain once and exit
python -m app.jobs.purge_storage --loop     keep running (the compose `purge` service)
"""

import argparse
import asyncio
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import Clock, SystemClock
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.db.session import create_engine, create_session_factory
from app.jobs.cleanup_tokens import cleanup_tokens
from app.services.infra.storage_service import S3StorageService
from app.services.purge_service import DrainResult, PurgeService

DRAIN_INTERVAL_SECONDS = 30
CLEANUP_EVERY_TICKS = 120  # about hourly at the default interval

_log = get_logger("leafy.jobs")


async def run_once(
    session_factory: async_sessionmaker[AsyncSession], purge: PurgeService
) -> DrainResult:
    return await purge.drain_all()


async def run_loop(
    session_factory: async_sessionmaker[AsyncSession],
    purge: PurgeService,
    *,
    interval_seconds: float = DRAIN_INTERVAL_SECONDS,
    max_ticks: int | None = None,
    clock: Clock | None = None,
) -> None:
    """Drain every interval and clean tokens every CLEANUP_EVERY_TICKS ticks.

    Failures are logged and the loop continues: one bad tick must not stop the worker.
    `max_ticks` exists for tests; the service runs until it is stopped.
    """
    tick = 0
    while max_ticks is None or tick < max_ticks:
        try:
            await purge.drain_all()
            if tick % CLEANUP_EVERY_TICKS == 0:
                await cleanup_tokens(session_factory, clock or SystemClock())
        except Exception as exc:
            _log.error("purge_tick_failed", error_type=type(exc).__name__)
        tick += 1
        if max_ticks is None or tick < max_ticks:
            await asyncio.sleep(interval_seconds)


async def _main(loop: bool) -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    engine = create_engine(settings.database_url, null_pool=True)
    factory = create_session_factory(engine)
    purge = PurgeService(factory, S3StorageService(settings), SystemClock())
    try:
        if loop:
            await run_loop(factory, purge)
        else:
            result = await run_once(factory, purge)
            _log.info("purge_done", deleted=result.deleted, failed=result.failed)
    finally:
        await engine.dispose()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.jobs.purge_storage")
    parser.add_argument("--loop", action="store_true", help="run until stopped")
    asyncio.run(_main(parser.parse_args(argv).loop))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
