"""Fail scans stuck in processing (crashed worker, restart, lost job) so users can retry."""

import asyncio
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import Clock
from app.core.errors import ErrorCode
from app.core.logging import get_logger
from app.db.uow import UnitOfWork

_log = get_logger("leafy.scan_janitor")


class ScanJanitor:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        clock: Clock,
        *,
        stuck_after_seconds: int,
    ) -> None:
        self._session_factory = session_factory
        self._clock = clock
        self._stuck_after = timedelta(seconds=stuck_after_seconds)

    async def sweep(self) -> int:
        """Fail every processing scan untouched for too long and return how many."""
        cutoff = self._clock.now() - self._stuck_after
        async with UnitOfWork(self._session_factory) as uow:
            failed = await uow.scans.fail_stuck(
                older_than=cutoff, failure_code=ErrorCode.PREDICTION_FAILED.value
            )
            await uow.commit()
        if failed:
            _log.warning("stuck_scans_failed", count=failed)
        return failed

    async def run_forever(self, interval_seconds: float) -> None:
        """Sweep on a timer. A failed sweep is logged and the loop carries on."""
        while True:
            try:
                await self.sweep()
            except Exception as exc:
                _log.error("scan_janitor_sweep_failed", error=type(exc).__name__)
            await asyncio.sleep(interval_seconds)
