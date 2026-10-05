"""POST /scans, the background worker, GET /scans/{id} and ownership."""

import io
import threading
from typing import Any

import httpx
import pytest
from app.services.ml.stub import StubMLInferenceService
from fastapi import FastAPI
from PIL import Image
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.integration.scans.conftest import (
    SCANS,
    Settle,
    get_scan,
    sign_up,
    upload,
    upload_and_settle,
)
from tests.support.fakes import FakeStorage
from tests.support.images import jpeg_with_gps, make_image
from tests.support.ml_fakes import ScriptedML

pytestmark = pytest.mark.integration


async def test_create_returns_202_and_stores_a_clean_jpeg(
    client: httpx.AsyncClient, auth: dict[str, str], storage: FakeStorage, ml: ScriptedML
) -> None:
    ml.gate = threading.Event()
    response = await upload(client, auth, jpeg_with_gps())
    assert response.status_code == 202
    data = response.json()["data"]
    assert data["status"] == "processing"
    assert data["stage"] == "validating"
    ((bucket, key), body) = next(iter(storage.objects.items()))
    assert bucket == "leafy-scans"
    assert key.endswith(f"/{data['id']}.jpg")
    assert len(Image.open(io.BytesIO(body)).getexif()) == 0
    ml.gate.set()


async def test_worker_walks_the_stages_and_completes(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, ml: ScriptedML
) -> None:
    ml.gate = threading.Event()
    created = await upload(client, auth)
    scan_id = created.json()["data"]["id"]
    for _ in range(100):
        state = await get_scan(client, auth, scan_id)
        if state["stage"] == "analyzing":
            break
        await _tick()
    assert state["status"] == "processing"
    assert state["stage"] == "analyzing"
    assert state["image_url"].startswith("http://storage.test/leafy-scans/")
    ml.gate.set()
    await settle()
    done = await get_scan(client, auth, scan_id)
    assert done["status"] == "completed"
    assert done["stage"] is None
    assert done["verdict"] == "disease"
    assert done["confidence"] == "0.91"
    assert done["plant"]["slug"] == "tomato"
    assert done["disease"]["slug"] == "early-blight"
    assert done["disease_detail"]["slug"] == "early-blight"
    assert done["disease_detail"]["plant"]["slug"] == "tomato"
    assert done["image_expires_at"]
    assert done["failure_code"] is None


async def _tick() -> None:
    import asyncio

    await asyncio.sleep(0.02)


async def test_predict_receives_the_sanitized_jpeg(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, ml: ScriptedML
) -> None:
    await upload_and_settle(client, auth, settle, jpeg_with_gps())
    assert b"SecretCameraMaker" not in ml.calls[0]
    assert ml.calls[0][:3] == b"\xff\xd8\xff"


async def test_healthy_verdict(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, ml: ScriptedML
) -> None:
    ml.result = {"plant": "potato", "disease": "healthy"}
    done = await get_scan(client, auth, await upload_and_settle(client, auth, settle))
    assert done["verdict"] == "healthy"
    assert done["plant"]["slug"] == "potato"
    assert done["disease"] is None
    assert done["disease_detail"] is None
    assert done["confidence"] is None


async def test_unknown_plant_and_raw_prediction_stored(
    client: httpx.AsyncClient,
    auth: dict[str, str],
    settle: Settle,
    ml: ScriptedML,
    engine: AsyncEngine,
) -> None:
    ml.result = {"plant": "banana", "disease": "sigatoka"}
    scan_id = await upload_and_settle(client, auth, settle)
    done = await get_scan(client, auth, scan_id)
    assert done["verdict"] == "unknown"
    assert done["plant"] is None
    async with engine.connect() as conn:
        raw = (
            await conn.execute(
                text("SELECT raw_prediction FROM scan WHERE id = :i"), {"i": scan_id}
            )
        ).scalar_one()
    assert raw == {"plant": "banana", "disease": "sigatoka"}


async def test_unmatched_disease_keeps_the_plant(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, ml: ScriptedML
) -> None:
    ml.result = {"plant": "tomato", "disease": "not-in-catalog"}
    done = await get_scan(client, auth, await upload_and_settle(client, auth, settle))
    assert done["verdict"] == "unknown"
    assert done["plant"]["slug"] == "tomato"
    assert done["disease"] is None


async def test_stub_model_fails_with_ml_unavailable(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, app: FastAPI, ml: ScriptedML
) -> None:
    ml.error = NotImplementedError("no model")
    done = await get_scan(client, auth, await upload_and_settle(client, auth, settle))
    assert done["status"] == "failed"
    assert done["failure_code"] == "ml_unavailable"
    assert done["verdict"] is None
    assert done["image_url"]
    assert "no model" not in str(done)


def test_stub_service_really_raises_not_implemented() -> None:
    with pytest.raises(NotImplementedError):
        StubMLInferenceService().predict(b"x")


async def test_other_errors_fail_with_prediction_failed_and_never_leak(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, ml: ScriptedML
) -> None:
    ml.error = RuntimeError("secret cuda path /srv/model.pt")
    done = await get_scan(client, auth, await upload_and_settle(client, auth, settle))
    assert done["failure_code"] == "prediction_failed"
    assert "secret" not in str(done)


@pytest.mark.parametrize("ml_timeout", [0.2])
async def test_timeout_fails_with_prediction_failed(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, ml: ScriptedML
) -> None:
    ml.gate = threading.Event()
    scan_id = await upload_and_settle(client, auth, settle)
    ml.gate.set()
    assert (await get_scan(client, auth, scan_id))["failure_code"] == "prediction_failed"


async def test_malformed_prediction_fails_cleanly(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, ml: ScriptedML
) -> None:
    ml.result = {"plant": ["not", "a", "string"]}
    done = await get_scan(client, auth, await upload_and_settle(client, auth, settle))
    assert done["status"] == "completed"
    assert done["verdict"] == "unknown"


async def test_missing_stored_image_fails_the_scan(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, storage: FakeStorage
) -> None:
    storage.fail_gets = True
    done = await get_scan(client, auth, await upload_and_settle(client, auth, settle))
    assert done["failure_code"] == "prediction_failed"


# ---- validation and limits -----------------------------------------------------------------


async def test_requires_authentication(client: httpx.AsyncClient) -> None:
    response = await client.post(SCANS, files={"image": ("a.jpg", make_image(), "image/jpeg")})
    assert response.status_code == 401


async def test_a_user_who_never_verified_an_email_can_scan(
    client: httpx.AsyncClient, catalog: dict[str, Any]
) -> None:
    headers = await sign_up(client, "new@example.com")
    me = await client.get("/api/v1/users/me", headers=headers)
    assert me.json()["data"]["email_verified"] is False
    response = await upload(client, headers)
    assert response.status_code == 202
    assert (await client.get(SCANS, headers=headers)).status_code == 200


@pytest.mark.parametrize(
    ("payload", "status", "code"),
    [
        (b"just some text", 415, "unsupported_media_type"),
        (b"\xff\xd8\xff\xe0" + b"junk" * 50, 422, "invalid_image"),
        (b"", 422, "invalid_image"),
    ],
)
async def test_invalid_uploads(
    client: httpx.AsyncClient,
    auth: dict[str, str],
    storage: FakeStorage,
    payload: bytes,
    status: int,
    code: str,
) -> None:
    response = await upload(client, auth, payload)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert storage.objects == {}


async def test_too_large_upload(client: httpx.AsyncClient, auth: dict[str, str]) -> None:
    response = await upload(client, auth, b"\xff\xd8\xff" + b"0" * (8 * 1024 * 1024 + 10))
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


async def test_missing_file_field(client: httpx.AsyncClient, auth: dict[str, str]) -> None:
    response = await client.post(SCANS, headers=auth, data={"note": "x"})
    assert response.status_code == 422


@pytest.mark.parametrize("scan_quota", [2])
async def test_quota_exceeded(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle, storage: FakeStorage
) -> None:
    await upload_and_settle(client, auth, settle)
    await upload_and_settle(client, auth, settle)
    blocked = await upload(client, auth)
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "scan_quota_exceeded"
    assert len(storage.objects) == 2


@pytest.mark.parametrize("rate_limit_enabled", [True])
async def test_minute_rate_limit(
    client: httpx.AsyncClient, auth: dict[str, str], settle: Settle
) -> None:
    for _ in range(10):
        assert (await upload(client, auth)).status_code == 202
    limited = await upload(client, auth)
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"
    assert "retry-after" in limited.headers
    await settle()


async def test_storage_outage_on_upload(
    client: httpx.AsyncClient, auth: dict[str, str], storage: FakeStorage
) -> None:
    storage.fail_puts = True
    response = await upload(client, auth)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "storage_unavailable"
    listing = await client.get(SCANS, headers=auth)
    assert listing.json()["data"]["items"] == []


# ---- ownership --------------------------------------------------------------------------------


async def test_other_users_get_404(
    client: httpx.AsyncClient, auth: dict[str, str], other_auth: dict[str, str], settle: Settle
) -> None:
    scan_id = await upload_and_settle(client, auth, settle)
    url = f"{SCANS}/{scan_id}"
    assert (await client.get(url, headers=other_auth)).status_code == 404
    assert (await client.delete(url, headers=other_auth)).status_code == 404
    assert (await client.post(f"{url}/retry", headers=other_auth)).status_code == 404
    body = {"is_correct": True}
    assert (await client.put(f"{url}/feedback", headers=other_auth, json=body)).status_code == 404
    assert (await client.delete(f"{url}/feedback", headers=other_auth)).status_code == 404
    assert (await client.get(url, headers=auth)).status_code == 200


async def test_unknown_scan_id_is_404_and_bad_id_is_422(
    client: httpx.AsyncClient, auth: dict[str, str]
) -> None:
    missing = "00000000-0000-4000-8000-000000000000"
    assert (await client.get(f"{SCANS}/{missing}", headers=auth)).status_code == 404
    assert (await client.get(f"{SCANS}/not-a-uuid", headers=auth)).status_code == 422
