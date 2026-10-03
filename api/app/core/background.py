"""Fire and forget tasks that are tracked, so shutdown and tests can wait for them."""

import asyncio
from collections.abc import Coroutine
from typing import Any

from app.core.logging import get_logger

_log = get_logger("leafy.background")


class BackgroundRunner:
    def __init__(self) -> None:
        self._tasks: set[asyncio.Task[None]] = set()

    def spawn(self, work: Coroutine[Any, Any, None]) -> None:
        """Run `work` without blocking the request. Failures are logged, never raised."""
        task = asyncio.create_task(self._guard(work))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    @staticmethod
    async def _guard(work: Coroutine[Any, Any, None]) -> None:
        try:
            await work
        except Exception as exc:
            _log.error("background_task_failed", error_type=type(exc).__name__)

    async def drain(self) -> None:
        """Wait for every task started so far."""
        while self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)
