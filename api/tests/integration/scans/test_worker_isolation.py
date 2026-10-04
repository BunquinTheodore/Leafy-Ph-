"""A hung model must not starve the worker, and a stale worker must not touch a retried run."""

import asyncio
import threading
from datetime import timedelta
from typing import Any

import httpx
import pytest
from app.core.clock import FixedClock
from app.services.scan_janitor import ScanJanitor
from app.services.scan_worker import MAX_ABANDONED_PREDICTIONS, ScanProcessor
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.integration.scans.conftest import (
    SCANS,
    Settle,
    get_scan,
    upload,
    upload_and_settle,
)
from tests.support.ml_fakes import ScriptedML

pytestmark = pytest.mark.integration


class HangingFirstML(ScriptedML):
    """The first `hang_calls` predictions block until `release` is set, the rest answer."""

    def __init__(self, hang_calls: int) -> None:
        super().__init__()
        self.hang_calls = hang_calls
        self.release = threading.Event()

    def predict(self, image: bytes) -> dict[str, str]:
        self.calls.append(image)
        if len(self.calls) <= self.hang_calls:
            self.release.wait(timeout=30)
        return dict(self.result)


def _processor(app: FastAPI) -> ScanProcessor:
    processor: ScanProcessor = app.state.scan_queue._processor
    return processor


@pytest.mark.parametrize("ml_timeout", [0.2])
async def test_hung_predictions_do_not_starve_later_scans(
    app: FastAPI,
    client: httpx.AsyncClient,
    auth: dict[str, str],
    settle: Settle,
) -> None:
    hanging = HangingFirstML(hang_calls=4)  # more than scan_workers (2)
    _processor(app)._ml = hanging
    try:
        hung = [await upload_and_settle(client, auth, settle) for _ in range(4)]
        for scan_id in hung:
            assert (await get_scan(client, auth, scan_id))["failure_code"] == "prediction_failed"
        healthy = await upload_and_settle(client, auth, settle)
        done = await get_scan(client, auth, healthy)
        assert done["status"] == "completed"
        assert _processor(app)._calls.abandoned == 4
    finally:
        hanging.release.set()
    for _ in range(100):
        if _processor(app)._calls.abandoned == 0:
            break
        await asyncio.sleep(0.05)
    assert _processor(app)._calls.abandoned == 0


@pytest.mark.parametrize("ml_timeout", [0.1])
async def test_abandoned_threads_are_capped(
    app: FastAPI,
    client: httpx.AsyncClient,
    auth: dict[str, str],
    settle: Settle,
) -> None:
    hanging = HangingFirstML(hang_calls=1000)
    _processor(app)._ml = hanging
    try:
        for _ in range(MAX_ABANDONED_PREDICTIONS + 2):
            await upload_and_settle(client, auth, settle)
        assert len(hanging.calls) == MAX_ABANDONED_PREDICTIONS
    finally:
        hanging.release.set()


async def _age(engine: AsyncEngine, scan_id: str, when: Any) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE scan SET updated_at = :t WHERE id = :i"), {"t": when, "i": scan_id}
        )


async def test_stale_worker_cannot_corrupt_a_retried_run(
    app: FastAPI,
    client: httpx.AsyncClient,
    auth: dict[str, str],
    settle: Settle,
    clock: FixedClock,
    engine: AsyncEngine,
    ml: ScriptedML,
) -> None:
    ml.gate = threading.Event()
    first_gate = ml.gate
    scan_id = (await upload(client, auth)).json()["data"]["id"]
    for _ in range(100):  # wait until the first worker is inside predict
        if ml.calls:
            break
        await asyncio.sleep(0.02)
    assert len(ml.calls) == 1

    await _age(engine, scan_id, clock.now() - timedelta(hours=2))
    janitor = ScanJanitor(app.state.session_factory, clock, stuck_after_seconds=300)
    assert await janitor.sweep() == 1

    ml.gate = threading.Event()  # the retried run blocks on its own gate
    retry = await client.post(f"{SCANS}/{scan_id}/retry", headers=auth)
    assert retry.status_code == 202, retry.text
    for _ in range(100):
        if len(ml.calls) == 2:
            break
        await asyncio.sleep(0.02)

    # the stale first run finishes with an answer: it must not complete or fail the new run
    first_gate.set()
    await asyncio.sleep(0.3)
    assert (await get_scan(client, auth, scan_id))["status"] == "processing"

    ml.gate.set()
    await settle()
    done = await get_scan(client, auth, scan_id)
    assert done["status"] == "completed"
    assert done["verdict"] == "disease"


STALE_TIMEOUT = 1.0  # the first run; long enough that the janitor sweep always lands before it
RETRY_TIMEOUT = 2.5  # the retried run starts later and waits longer, so it always times out last


@pytest.mark.parametrize("ml_timeout", [STALE_TIMEOUT])
async def test_stale_worker_timeout_does_not_fail_the_new_run(
    app: FastAPI,
    client: httpx.AsyncClient,
    auth: dict[str, str],
    settle: Settle,
    clock: FixedClock,
    engine: AsyncEngine,
    ml: ScriptedML,
) -> None:
    processor = _processor(app)
    ml.gate = threading.Event()
    first_gate = ml.gate
    scan_id = (await upload(client, auth)).json()["data"]["id"]
    for _ in range(100):
        if ml.calls:
            break
        await asyncio.sleep(0.01)
    janitor = ScanJanitor(app.state.session_factory, clock, stuck_after_seconds=300)
    await _age(engine, scan_id, clock.now() - timedelta(hours=2))
    assert await janitor.sweep() == 1
    ml.gate = threading.Event()
    # separate timeouts: the retried run gets a longer one, so the stale run always expires first
    processor._settings = processor._settings.model_copy(update={"ml_timeout": RETRY_TIMEOUT})
    assert (await client.post(f"{SCANS}/{scan_id}/retry", headers=auth)).status_code == 202
    # wait for the stale run's timeout (observable as its abandoned prediction), not a sleep
    for _ in range(int((STALE_TIMEOUT + 2) / 0.02)):
        if processor._calls.abandoned == 1:
            break
        await asyncio.sleep(0.02)
    assert processor._calls.abandoned == 1
    assert (await get_scan(client, auth, scan_id))["status"] == "processing"
    first_gate.set()
    # the retried run times out too: it is the only run allowed to write its failure
    await settle()
    failed = await get_scan(client, auth, scan_id)
    assert failed["status"] == "failed"
    assert failed["failure_code"] == "prediction_failed"
    ml.gate.set()
