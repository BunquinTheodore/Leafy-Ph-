"""Result feedback, the stuck scan janitor and the CSV export."""

import asyncio
import csv
import io
import threading
import uuid
from datetime import timedelta
from typing import Any

import httpx
import pytest
from app.core.clock import FixedClock
from app.tools.export_feedback import export_feedback
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from tests.integration.scans.conftest import (
    SCANS,
    Settle,
    get_scan,
    upload,
    upload_and_settle,
)
from tests.support.ml_fakes import ScriptedML

pytestmark = pytest.mark.integration


async def _put(
    client: httpx.AsyncClient, headers: dict[str, str], scan_id: str, body: dict[str, Any]
) -> httpx.Response:
    return await client.put(f"{SCANS}/{scan_id}/feedback", headers=headers, json=body)


# ---- feedback ------------------------------------------------------------------------------


async def test_feedback_upsert_and_delete(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle
) -> None:
    scan_id = await upload_and_settle(client, auth, settle)
    response = await _put(client, auth, scan_id, {"is_correct": True})
    assert response.status_code == 200
    assert response.json()["data"]["is_correct"] is True
    assert (await get_scan(client, auth, scan_id))["feedback"]["is_correct"] is True

    changed = await _put(
        client,
        auth,
        scan_id,
        {
            "is_correct": False,
            "correct_plant": "potato",
            "correct_disease": "late-blight",
            "comment": "  Looks like late blight to me.  ",
        },
    )
    assert changed.status_code == 200
    feedback = changed.json()["data"]
    assert feedback["correct_plant"] == "potato"
    assert feedback["correct_disease"] == "late-blight"
    assert feedback["comment"] == "Looks like late blight to me."

    removed = await client.delete(f"{SCANS}/{scan_id}/feedback", headers=auth)
    assert removed.status_code == 200
    assert removed.json()["data"] == {"deleted": True}
    assert (await get_scan(client, auth, scan_id))["feedback"] is None
    assert (await client.delete(f"{SCANS}/{scan_id}/feedback", headers=auth)).status_code == 200


async def test_correct_flag_drops_corrections(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle
) -> None:
    scan_id = await upload_and_settle(client, auth, settle)
    response = await _put(
        client, auth, scan_id, {"is_correct": True, "correct_plant": "potato", "comment": "ok"}
    )
    assert response.json()["data"]["correct_plant"] is None


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"is_correct": "maybe"},
        {"is_correct": False, "comment": "x" * 301},
        {"is_correct": False, "correct_plant": "banana"},
        {"is_correct": False, "correct_plant": "tomato", "correct_disease": "late-blight"},
        {"is_correct": False, "correct_disease": "early-blight"},
        {"is_correct": False, "correct_plant": "tomato", "correct_disease": "nope"},
    ],
)
async def test_feedback_validation(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, body: dict[str, Any]
) -> None:
    scan_id = await upload_and_settle(client, auth, settle)
    response = await _put(client, auth, scan_id, body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_healthy_is_a_valid_correction(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle
) -> None:
    scan_id = await upload_and_settle(client, auth, settle)
    response = await _put(
        client,
        auth,
        scan_id,
        {"is_correct": False, "correct_plant": "tomato", "correct_disease": "healthy"},
    )
    assert response.status_code == 200


async def test_feedback_only_on_completed_scans(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, ml: ScriptedML
) -> None:
    ml.gate = threading.Event()
    scan_id = (await upload(client, auth)).json()["data"]["id"]
    response = await _put(client, auth, scan_id, {"is_correct": True})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "scan_not_completed"
    ml.gate.set()
    await settle()
    failing = await upload_and_settle(client, auth, settle)
    assert failing


async def test_feedback_not_allowed_on_failed_scan(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, ml: ScriptedML
) -> None:
    ml.error = RuntimeError("x")
    scan_id = await upload_and_settle(client, auth, settle)
    response = await _put(client, auth, scan_id, {"is_correct": True})
    assert response.status_code == 409


async def test_deleting_a_scan_removes_its_feedback(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, engine: AsyncEngine
) -> None:
    scan_id = await upload_and_settle(client, auth, settle)
    await _put(client, auth, scan_id, {"is_correct": True})
    await client.delete(f"{SCANS}/{scan_id}", headers=auth)
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT count(*) FROM scan_feedback"))).scalar_one() == 0


# ---- janitor -------------------------------------------------------------------------------


async def test_janitor_fails_only_stuck_processing_scans(
    client: httpx.AsyncClient,
    auth: dict[str, str],
    settle: Settle,
    app: FastAPI,
    clock: FixedClock,
    engine: AsyncEngine,
    ml: ScriptedML,
) -> None:
    from app.services.scan_janitor import ScanJanitor

    done_id = await upload_and_settle(client, auth, settle)
    ml.gate = threading.Event()
    stuck = (await upload(client, auth)).json()["data"]["id"]
    fresh = (await upload(client, auth)).json()["data"]["id"]
    # Both workers must be parked inside predict() (past their last stage write, which bumps
    # updated_at) before the test backdates rows, otherwise the backdate can be overwritten.
    for _ in range(200):
        if len(ml.calls) >= 3:
            break
        await asyncio.sleep(0.05)
    assert len(ml.calls) >= 3
    long_ago = clock.now() - timedelta(hours=2)
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE scan SET updated_at = :t WHERE id = :i"), {"t": long_ago, "i": stuck}
        )
        await conn.execute(
            text("UPDATE scan SET updated_at = :t WHERE id = :i"),
            {"t": clock.now(), "i": fresh},
        )
    janitor = ScanJanitor(app.state.session_factory, clock, stuck_after_seconds=300)
    assert await janitor.sweep() == 1
    assert await janitor.sweep() == 0
    failed = await get_scan(client, auth, stuck)
    assert failed["status"] == "failed"
    assert failed["failure_code"] == "prediction_failed"
    assert (await get_scan(client, auth, fresh))["status"] == "processing"
    assert (await get_scan(client, auth, done_id))["status"] == "completed"
    ml.gate.set()
    await settle()
    # the worker must not resurrect the scan the janitor already failed
    assert (await get_scan(client, auth, stuck))["status"] == "failed"


# ---- export --------------------------------------------------------------------------------


async def test_export_feedback_csv(
    client: httpx.AsyncClient,
    auth: dict[str, str],
    settle: Settle,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    first = await upload_and_settle(client, auth, settle)
    await _put(
        client,
        auth,
        first,
        {
            "is_correct": False,
            "correct_plant": "potato",
            "correct_disease": "late-blight",
            "comment": '=HYPERLINK("http://evil")',
        },
    )
    second = await upload_and_settle(client, auth, settle)
    await _put(client, auth, second, {"is_correct": True})
    await upload_and_settle(client, auth, settle)  # no feedback: not exported

    buffer = io.StringIO()
    count = await export_feedback(session_factory, buffer)
    assert count == 2
    rows = list(csv.DictReader(io.StringIO(buffer.getvalue())))
    by_id = {row["scan_id"]: row for row in rows}
    assert set(by_id) == {first, second}
    wrong = by_id[first]
    assert wrong["predicted_plant"] == "tomato"
    assert wrong["predicted_disease"] == "early-blight"
    assert wrong["verdict"] == "disease"
    assert wrong["is_correct"] == "false"
    assert wrong["correct_plant"] == "potato"
    assert wrong["correct_disease"] == "late-blight"
    assert wrong["comment"].startswith("'=")
    assert wrong["image_key"].endswith(f"{first}.jpg")
    assert "user" not in ",".join(rows[0].keys())
    assert uuid.UUID(wrong["scan_id"])
    assert by_id[second]["is_correct"] == "true"


async def test_export_cli_writes_a_file(
    db_settings: Any, monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    from app.tools import export_feedback as tool

    monkeypatch.setattr(tool, "get_settings", lambda: db_settings)
    target = tmp_path / "feedback.csv"
    assert await tool._main(target) == 0
    assert target.read_text(encoding="utf-8").startswith("scan_id,created_at")
