"""History listing, stats, delete, retry."""

import threading
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.integration.scans.conftest import (
    SCANS,
    Settle,
    get_scan,
    upload,
    upload_and_settle,
)
from tests.support.fakes import FakeStorage
from tests.support.ml_fakes import ScriptedML

pytestmark = pytest.mark.integration

DISEASE = {"plant": "tomato", "disease": "early-blight", "confidence": "0.8"}


async def _make(
    client: httpx.AsyncClient,
    auth: dict[str, str],
    settle: Settle,
    ml: ScriptedML,
    result: dict[str, str] | None = None,
    error: BaseException | None = None,
) -> str:
    ml.result = result or DISEASE
    ml.error = error
    colour = bytes([len(ml.calls) % 250])
    from tests.support.images import make_image

    return await upload_and_settle(client, auth, settle, make_image(colour=(colour[0], 120, 30)))


# ---- list ---------------------------------------------------------------------------------


async def test_list_is_newest_first_and_paginates_with_a_keyset_cursor(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, ml: ScriptedML
) -> None:
    ids = [await _make(client, auth, settle, ml) for _ in range(5)]
    first = (await client.get(SCANS, headers=auth, params={"limit": 2})).json()["data"]
    assert [i["id"] for i in first["items"]] == ids[::-1][:2]
    assert first["next_cursor"]
    second = (
        await client.get(SCANS, headers=auth, params={"limit": 2, "cursor": first["next_cursor"]})
    ).json()["data"]
    assert [i["id"] for i in second["items"]] == ids[::-1][2:4]
    third = (
        await client.get(SCANS, headers=auth, params={"limit": 2, "cursor": second["next_cursor"]})
    ).json()["data"]
    assert [i["id"] for i in third["items"]] == ids[::-1][4:]
    assert third["next_cursor"] is None
    item = first["items"][0]
    assert item["verdict"] == "disease"
    assert item["plant"]["slug"] == "tomato"
    assert item["image_url"]
    assert "disease_detail" not in item


@pytest.mark.parametrize("limit", [0, 51, -1, "abc"])
async def test_limit_bounds(client: httpx.AsyncClient, auth: dict[str, str], limit: Any) -> None:
    response = await client.get(SCANS, headers=auth, params={"limit": limit})
    assert response.status_code == 422


async def test_invalid_cursor(client: httpx.AsyncClient, auth: dict[str, str]) -> None:
    response = await client.get(SCANS, headers=auth, params={"cursor": "garbage"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_cursor"


async def test_filters_and_scoping(
    client: httpx.AsyncClient,
    auth: dict[str, str],
    other_auth: dict[str, str],
    settle: Settle,
    ml: ScriptedML,
) -> None:
    disease_id = await _make(client, auth, settle, ml)
    healthy_id = await _make(client, auth, settle, ml, {"plant": "potato", "disease": "healthy"})
    failed_id = await _make(client, auth, settle, ml, error=RuntimeError("x"))
    await _make(client, other_auth, settle, ml)

    async def ids(**params: str) -> set[str]:
        response = await client.get(SCANS, headers=auth, params=params)
        assert response.status_code == 200, response.text
        return {i["id"] for i in response.json()["data"]["items"]}

    assert await ids() == {disease_id, healthy_id, failed_id}
    assert await ids(status="failed") == {failed_id}
    assert await ids(status="completed") == {disease_id, healthy_id}
    assert await ids(verdict="healthy") == {healthy_id}
    assert await ids(verdict="disease") == {disease_id}
    assert await ids(plant="potato") == {healthy_id}
    assert await ids(plant="nope") == set()
    assert await ids(plant="tomato", verdict="disease") == {disease_id}
    bad = await client.get(SCANS, headers=auth, params={"status": "weird"})
    assert bad.status_code == 422


async def test_list_requires_auth(client: httpx.AsyncClient) -> None:
    assert (await client.get(SCANS)).status_code == 401


async def test_processing_scans_show_in_the_list(
    client: httpx.AsyncClient, auth: dict[str, str], ml: ScriptedML
) -> None:
    ml.gate = threading.Event()
    await upload(client, auth)
    items = (await client.get(SCANS, headers=auth)).json()["data"]["items"]
    assert items[0]["status"] == "processing"
    assert items[0]["stage"] in {"validating", "analyzing"}
    ml.gate.set()


# ---- stats ---------------------------------------------------------------------------------


async def test_stats_counts_completed_only(
    client: httpx.AsyncClient,
    auth: dict[str, str],
    other_auth: dict[str, str],
    settle: Settle,
    ml: ScriptedML,
    engine: AsyncEngine,
) -> None:
    for _ in range(3):
        await _make(client, auth, settle, ml)
    await _make(client, auth, settle, ml, {"plant": "potato", "disease": "late-blight"})
    await _make(client, auth, settle, ml, {"plant": "potato", "disease": "healthy"})
    await _make(client, auth, settle, ml, {"plant": "banana", "disease": "x"})
    await _make(client, auth, settle, ml, error=RuntimeError("x"))
    await _make(client, other_auth, settle, ml)
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "UPDATE scan SET created_at = timestamptz '2025-01-01' WHERE id = ("
                "SELECT id FROM scan WHERE verdict = 'healthy' LIMIT 1)"
            )
        )
    response = await client.get(f"{SCANS}/stats", headers=auth)
    assert response.status_code == 200
    stats = response.json()["data"]
    assert stats["total"] == 6
    assert stats["last_30_days"] == 5
    assert stats["by_verdict"] == {"disease": 4, "healthy": 1, "unknown": 1}
    top = stats["top_diseases"]
    assert top[0]["disease_slug"] == "early-blight"
    assert top[0]["count"] == 3
    assert top[0]["plant_slug"] == "tomato"
    assert top[1]["disease_slug"] == "late-blight"
    assert len(top) == 2


async def test_stats_for_a_new_user_are_zero(
    client: httpx.AsyncClient, auth: dict[str, str]
) -> None:
    stats = (await client.get(f"{SCANS}/stats", headers=auth)).json()["data"]
    assert stats == {
        "total": 0,
        "last_30_days": 0,
        "by_verdict": {"disease": 0, "healthy": 0, "unknown": 0},
        "top_diseases": [],
    }


# ---- delete --------------------------------------------------------------------------------


async def test_delete_queues_the_image_and_purges_it(
    client: httpx.AsyncClient,
    auth: dict[str, str],
    settle: Settle,
    ml: ScriptedML,
    storage: FakeStorage,
    engine: AsyncEngine,
) -> None:
    scan_id = await _make(client, auth, settle, ml)
    assert len(storage.objects) == 1
    response = await client.delete(f"{SCANS}/{scan_id}", headers=auth)
    assert response.status_code == 200
    assert response.json()["data"] == {"deleted": True}
    await settle()
    assert storage.objects == {}
    assert (await client.get(f"{SCANS}/{scan_id}", headers=auth)).status_code == 404
    async with engine.connect() as conn:
        queued = (await conn.execute(text("SELECT count(*) FROM storage_deletion"))).scalar_one()
    assert queued == 0


async def test_delete_keeps_the_outbox_row_when_storage_is_down(
    client: httpx.AsyncClient,
    auth: dict[str, str],
    settle: Settle,
    ml: ScriptedML,
    storage: FakeStorage,
    engine: AsyncEngine,
) -> None:
    scan_id = await _make(client, auth, settle, ml)
    storage.down = True
    assert (await client.delete(f"{SCANS}/{scan_id}", headers=auth)).status_code == 200
    await settle()
    async with engine.connect() as conn:
        queued = (await conn.execute(text("SELECT count(*) FROM storage_deletion"))).scalar_one()
    assert queued == 1
    assert (await client.get(f"{SCANS}/{scan_id}", headers=auth)).status_code == 404


async def test_delete_cancels_a_processing_scan(
    client: httpx.AsyncClient,
    auth: dict[str, str],
    settle: Settle,
    ml: ScriptedML,
    storage: FakeStorage,
) -> None:
    ml.gate = threading.Event()
    scan_id = (await upload(client, auth)).json()["data"]["id"]
    assert (await client.delete(f"{SCANS}/{scan_id}", headers=auth)).status_code == 200
    ml.gate.set()
    await settle()
    assert (await client.get(f"{SCANS}/{scan_id}", headers=auth)).status_code == 404
    assert (await client.get(SCANS, headers=auth)).json()["data"]["items"] == []
    assert storage.objects == {}


# ---- retry ---------------------------------------------------------------------------------


async def test_retry_reuses_the_stored_image(
    client: httpx.AsyncClient,
    auth: dict[str, str],
    settle: Settle,
    ml: ScriptedML,
    storage: FakeStorage,
) -> None:
    scan_id = await _make(client, auth, settle, ml, error=NotImplementedError())
    assert (await get_scan(client, auth, scan_id))["failure_code"] == "ml_unavailable"
    ml.error = None
    ml.result = DISEASE
    stored = dict(storage.objects)
    response = await client.post(f"{SCANS}/{scan_id}/retry", headers=auth)
    assert response.status_code == 202
    assert response.json()["data"] == {"id": scan_id, "status": "processing", "stage": "analyzing"}
    await settle()
    done = await get_scan(client, auth, scan_id)
    assert done["status"] == "completed"
    assert done["failure_code"] is None
    assert storage.objects == stored
    assert len(ml.calls) == 2


async def test_retry_only_for_failed_scans(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, ml: ScriptedML
) -> None:
    scan_id = await _make(client, auth, settle, ml)
    response = await client.post(f"{SCANS}/{scan_id}/retry", headers=auth)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "scan_not_failed"


async def test_retry_can_fail_again(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, ml: ScriptedML
) -> None:
    scan_id = await _make(client, auth, settle, ml, error=RuntimeError("x"))
    await client.post(f"{SCANS}/{scan_id}/retry", headers=auth)
    await settle()
    assert (await get_scan(client, auth, scan_id))["failure_code"] == "prediction_failed"


async def test_double_retry_is_rejected_while_processing(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, ml: ScriptedML
) -> None:
    scan_id = await _make(client, auth, settle, ml, error=RuntimeError("x"))
    ml.error = None
    ml.gate = threading.Event()
    assert (await client.post(f"{SCANS}/{scan_id}/retry", headers=auth)).status_code == 202
    again = await client.post(f"{SCANS}/{scan_id}/retry", headers=auth)
    assert again.status_code == 409
    ml.gate.set()
    await settle()
