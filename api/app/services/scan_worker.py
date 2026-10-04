"""Background scan processing: a swappable queue plus the processor that runs one scan.

The queue is in process (asyncio) for v1. Replace it by implementing `ScanQueue` with a real
broker and calling `ScanProcessor.process` from the consumer.
"""

import asyncio
import contextlib
import threading
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.errors import ErrorCode
from app.core.logging import get_logger
from app.db.models import ScanStage
from app.db.uow import UnitOfWork
from app.services.infra.storage_service import StorageService
from app.services.ml.base import MLInferenceService
from app.services.prediction_resolver import Resolution, resolve_prediction

_log = get_logger("leafy.scan_worker")


@dataclass(frozen=True)
class ScanJob:
    scan_id: uuid.UUID
    user_id: uuid.UUID
    image_key: str
    attempt: int = 0


class ScanQueue(Protocol):
    async def enqueue(self, job: ScanJob) -> None: ...

    async def drain(self) -> None:
        """Wait until every queued job has finished (tests and graceful shutdown)."""
        ...

    async def close(self) -> None: ...


class PredictionFailed(Exception):
    """Internal marker: the model output could not be used. Never leaves the worker."""


# A Python thread cannot be killed, so a timed out prediction keeps running in the background.
# Every call gets its own daemon thread (no shared pool to starve, no block at interpreter exit)
# and the number of such abandoned threads is capped so a hung model cannot grow them forever.
MAX_ABANDONED_PREDICTIONS = 8


class PredictionTimeout(Exception):
    """The model did not answer within ml_timeout."""


class _IsolatedCalls:
    """Run blocking callables on throwaway daemon threads with a timeout and a leak cap."""

    def __init__(self, max_abandoned: int) -> None:
        self._max_abandoned = max_abandoned
        self._abandoned = 0
        self._lock = threading.Lock()

    @property
    def abandoned(self) -> int:
        return self._abandoned

    def _forget(self) -> None:
        with self._lock:
            self._abandoned -= 1

    async def run[T](self, fn: Callable[[], T], limit_seconds: float) -> T:
        with self._lock:
            if self._abandoned >= self._max_abandoned:
                raise PredictionTimeout("too many unresponsive predictions")
        loop = asyncio.get_running_loop()
        future: asyncio.Future[T] = loop.create_future()
        state = {"abandoned": False}

        def deliver(setter: Callable[[Any], None], value: Any) -> None:
            if not future.done():
                setter(value)

        def target() -> None:
            try:
                value = fn()
            except BaseException as exc:
                outcome: tuple[Callable[[Any], None], Any] = (future.set_exception, exc)
            else:
                outcome = (future.set_result, value)
            with self._lock:
                if state["abandoned"]:
                    self._abandoned -= 1
                    return
            with contextlib.suppress(RuntimeError):  # the loop is closed (shutdown)
                loop.call_soon_threadsafe(deliver, *outcome)

        threading.Thread(target=target, name="leafy-ml", daemon=True).start()
        try:
            return await asyncio.wait_for(asyncio.shield(future), timeout=limit_seconds)
        except TimeoutError as exc:
            with self._lock:
                if future.done():  # finished in the same instant: take the answer
                    return future.result()
                state["abandoned"] = True
                self._abandoned += 1
            future.cancel()
            raise PredictionTimeout("prediction timed out") from exc


class ScanProcessor:
    """Runs analyzing, saving and completion for one scan. Never raises."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        storage: StorageService,
        ml: MLInferenceService,
        settings: Settings,
    ) -> None:
        self._session_factory = session_factory
        self._storage = storage
        self._ml = ml
        self._settings = settings
        self._calls = _IsolatedCalls(MAX_ABANDONED_PREDICTIONS)

    def shutdown(self) -> None:
        """Nothing to join: prediction threads are daemons and cannot be stopped anyway."""

    async def process(self, job: ScanJob) -> None:
        try:
            await self._run(job)
        except Exception as exc:
            _log.error(
                "scan_processing_crashed", scan_id=str(job.scan_id), error=type(exc).__name__
            )
            await self._safe_fail(job, ErrorCode.PREDICTION_FAILED)

    async def _run(self, job: ScanJob) -> None:
        if not await self._enter_stage(job, ScanStage.ANALYZING):
            return
        try:
            prediction = await self._predict(job)
        except NotImplementedError:
            await self._safe_fail(job, ErrorCode.ML_UNAVAILABLE)
            return
        except Exception as exc:  # the model, storage and timeouts all end the same way
            _log.warning(
                "scan_prediction_failed", scan_id=str(job.scan_id), error=type(exc).__name__
            )
            await self._safe_fail(job, ErrorCode.PREDICTION_FAILED)
            return
        await self._save(job, prediction)

    async def _enter_stage(self, job: ScanJob, stage: ScanStage) -> bool:
        """False when this run is no longer current (failed, retried or deleted)."""
        async with UnitOfWork(self._session_factory) as uow:
            changed = await uow.scans.set_stage(job.scan_id, stage, attempt=job.attempt)
            await uow.commit()
        return changed

    async def _predict(self, job: ScanJob) -> dict[str, Any]:
        image = await self._storage.get_object(self._settings.s3_scans_bucket, job.image_key)
        result = await self._calls.run(
            lambda: self._ml.predict(image), limit_seconds=self._settings.ml_timeout
        )
        if not isinstance(result, dict):
            raise PredictionFailed("prediction is not a mapping")
        return dict(result)

    async def _save(self, job: ScanJob, prediction: dict[str, Any]) -> None:
        if not await self._enter_stage(job, ScanStage.SAVING):
            return
        async with UnitOfWork(self._session_factory) as uow:
            resolution: Resolution = await resolve_prediction(prediction, uow.catalog)
            await uow.scans.complete(
                job.scan_id,
                attempt=job.attempt,
                verdict=resolution.verdict,
                plant_id=resolution.plant_id,
                disease_id=resolution.disease_id,
                confidence=resolution.confidence,
                raw_prediction=resolution.raw,
            )
            await uow.commit()

    async def _safe_fail(self, job: ScanJob, code: ErrorCode) -> None:
        try:
            async with UnitOfWork(self._session_factory) as uow:
                await uow.scans.fail(job.scan_id, code.value, attempt=job.attempt)
                await uow.commit()
        except Exception as exc:
            _log.error("scan_fail_write_failed", scan_id=str(job.scan_id), error=type(exc).__name__)


class InProcessScanQueue:
    """An asyncio queue drained by a few worker tasks, started on first use."""

    def __init__(self, processor: ScanProcessor, workers: int) -> None:
        self._processor = processor
        self._worker_count = workers
        self._queue: asyncio.Queue[ScanJob] = asyncio.Queue()
        self._tasks: list[asyncio.Task[None]] = []

    def _ensure_workers(self) -> None:
        if self._tasks:
            return
        self._tasks = [
            asyncio.create_task(self._consume(), name=f"scan-worker-{n}")
            for n in range(self._worker_count)
        ]

    async def _consume(self) -> None:
        while True:
            job = await self._queue.get()
            try:
                await self._processor.process(job)
            finally:
                self._queue.task_done()

    async def enqueue(self, job: ScanJob) -> None:
        self._ensure_workers()
        await self._queue.put(job)

    async def drain(self) -> None:
        if self._tasks:
            await self._queue.join()

    async def close(self) -> None:
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks = []
        self._processor.shutdown()
