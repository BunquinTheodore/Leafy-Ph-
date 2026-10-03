"""HTTP layer behavior that needs no database (the engine never connects)."""

import json
from collections.abc import AsyncIterator

import httpx
import pytest
from app.main import create_app
from fastapi import FastAPI

from tests.conftest import make_settings

SECRET_TEXT = "super secret internal detail"


def _build_app() -> FastAPI:
    app = create_app(make_settings(max_upload_bytes=1000))

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError(SECRET_TEXT)

    return app


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    app = _build_app()
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http
    await app.state.engine.dispose()


async def test_healthz_envelope_and_security_headers(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/healthz")
    assert response.status_code == 200
    assert response.json() == {"success": True, "data": {"status": "ok"}, "error": None}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["cache-control"] == "no-store"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


async def test_request_id_is_generated_and_matches_error_body(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/nope")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert body["error"]["request_id"] == response.headers["x-request-id"]


async def test_valid_inbound_request_id_is_echoed_and_bad_one_replaced(
    client: httpx.AsyncClient,
) -> None:
    ok = await client.get("/api/v1/healthz", headers={"X-Request-Id": "trace-abc-12345"})
    assert ok.headers["x-request-id"] == "trace-abc-12345"
    bad = await client.get("/api/v1/healthz", headers={"X-Request-Id": "bad id with spaces"})
    assert bad.headers["x-request-id"] != "bad id with spaces"
    assert len(bad.headers["x-request-id"]) == 32


async def test_unhandled_exception_never_leaks_text(client: httpx.AsyncClient) -> None:
    response = await client.get("/boom")
    assert response.status_code == 500
    assert SECRET_TEXT not in response.text
    body = response.json()
    assert body["error"]["code"] == "internal_error"
    assert body["error"]["request_id"] == response.headers["x-request-id"]
    assert response.headers["x-content-type-options"] == "nosniff"


async def test_method_not_allowed_uses_envelope(client: httpx.AsyncClient) -> None:
    response = await client.delete("/api/v1/healthz")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "method_not_allowed"


async def test_validation_error_reports_fields_without_values(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/login", json={"email": "not-an-email", "password": "hunter2hunter2"}
    )
    assert response.status_code == 422
    text = response.text
    assert "hunter2hunter2" not in text
    assert "not-an-email" not in text
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert {"field": "email", "type": "value_error"} in error["details"]


async def test_declared_content_length_over_limit_is_rejected(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/auth/login", content=b"x" * 70_000)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


async def test_streamed_body_over_limit_is_rejected(client: httpx.AsyncClient) -> None:
    async def chunks() -> AsyncIterator[bytes]:
        for _ in range(80):
            yield b"x" * 1000

    response = await client.post(
        "/api/v1/auth/login", content=chunks(), headers={"content-type": "application/json"}
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


async def test_openapi_documents_the_envelope(client: httpx.AsyncClient) -> None:
    schema = (await client.get("/openapi.json")).json()
    assert "/api/v1/auth/login" in schema["paths"]
    assert "/api/v1/users/me" in schema["paths"]
    assert json.dumps(schema).count("Envelope_") > 3
