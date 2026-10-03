"""End to end through HTTP: envelope, auth flows, error uniformity, rate limits."""

import httpx
import pytest
from app.core.clock import FixedClock
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

pytestmark = pytest.mark.integration

PASSWORD = "a calm green forest"
REGISTER = {
    "email": "Leaf@Example.com",
    "password": PASSWORD,
    "first_name": "Leaf",
    "last_name": "Fan",
}


async def _register(client: httpx.AsyncClient, **overrides: str) -> dict[str, object]:
    response = await client.post("/api/v1/auth/register", json={**REGISTER, **overrides})
    assert response.status_code == 201, response.text
    return response.json()["data"]  # type: ignore[no-any-return]


def _bearer(token: object) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_register_returns_session_and_user(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/auth/register", json=REGISTER)
    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True and body["error"] is None
    data = body["data"]
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 900
    assert data["user"]["email"] == "leaf@example.com"
    assert data["user"]["email_verified"] is False
    assert data["user"]["auth_methods"] == ["password"]
    assert PASSWORD not in response.text
    assert "password_hash" not in response.text


async def test_register_existing_email_is_409_email_taken(client: httpx.AsyncClient) -> None:
    await _register(client)
    response = await client.post("/api/v1/auth/register", json=REGISTER)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "email_taken"


async def test_register_rejects_weak_passwords_without_echoing_them(
    client: httpx.AsyncClient,
) -> None:
    response = await client.post(
        "/api/v1/auth/register", json={**REGISTER, "password": "password123"}
    )
    assert response.status_code == 422
    assert "password123" not in response.text
    assert response.json()["error"]["code"] == "validation_error"


async def test_register_is_rate_limited(client: httpx.AsyncClient) -> None:
    for index in range(5):
        await _register(client, email=f"user{index}@example.com")
    response = await client.post(
        "/api/v1/auth/register", json={**REGISTER, "email": "user9@example.com"}
    )
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"
    assert int(response.headers["retry-after"]) > 0


async def test_login_success_and_me(client: httpx.AsyncClient) -> None:
    await _register(client)
    response = await client.post(
        "/api/v1/auth/login", json={"email": "leaf@example.com", "password": PASSWORD}
    )
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    me = await client.get("/api/v1/users/me", headers=_bearer(token))
    assert me.status_code == 200
    assert me.json()["data"]["email"] == "leaf@example.com"
    assert me.json()["data"]["auth_methods"] == ["password"]


async def test_login_failures_are_uniform_invalid_credentials(client: httpx.AsyncClient) -> None:
    await _register(client)
    wrong = await client.post(
        "/api/v1/auth/login", json={"email": "leaf@example.com", "password": "wrong password!"}
    )
    unknown = await client.post(
        "/api/v1/auth/login", json={"email": "ghost@example.com", "password": PASSWORD}
    )
    assert wrong.status_code == unknown.status_code == 401
    wrong_error, unknown_error = wrong.json()["error"], unknown.json()["error"]
    assert wrong_error["code"] == unknown_error["code"] == "invalid_credentials"
    assert wrong_error["message"] == unknown_error["message"]
    assert wrong_error["details"] == unknown_error["details"]


async def test_login_is_rate_limited_per_ip_and_email(client: httpx.AsyncClient) -> None:
    payload = {"email": "leaf@example.com", "password": "wrong password!"}
    for _ in range(10):
        assert (await client.post("/api/v1/auth/login", json=payload)).status_code == 401
    blocked = await client.post("/api/v1/auth/login", json=payload)
    assert blocked.status_code == 429
    other = await client.post(
        "/api/v1/auth/login", json={"email": "someone@example.com", "password": "wrong password!"}
    )
    assert other.status_code == 401


async def test_refresh_rotation_grace_and_reuse_detection(
    client: httpx.AsyncClient, clock: FixedClock
) -> None:
    session = await _register(client)
    first = session["refresh_token"]

    rotated = await client.post("/api/v1/auth/refresh", json={"refresh_token": first})
    assert rotated.status_code == 200
    second = rotated.json()["data"]["refresh_token"]
    assert second and second != first

    clock.advance(seconds=3)
    grace = await client.post("/api/v1/auth/refresh", json={"refresh_token": first})
    assert grace.status_code == 200
    assert grace.json()["data"]["refresh_token"] is None
    assert grace.json()["data"]["access_token"]

    clock.advance(seconds=30)
    reuse = await client.post("/api/v1/auth/refresh", json={"refresh_token": first})
    assert reuse.status_code == 401
    assert reuse.json()["error"]["code"] == "refresh_reuse_detected"

    after = await client.post("/api/v1/auth/refresh", json={"refresh_token": second})
    assert after.status_code == 401
    assert after.json()["error"]["code"] == "refresh_invalid"


async def test_refresh_with_an_unknown_token_is_refresh_invalid(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": "x" * 40})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "refresh_invalid"


async def test_logout_is_idempotent_and_ends_the_session(client: httpx.AsyncClient) -> None:
    session = await _register(client)
    token = session["refresh_token"]
    for _ in range(2):
        response = await client.post("/api/v1/auth/logout", json={"refresh_token": token})
        assert response.status_code == 200
        assert response.json() == {"success": True, "data": {"revoked": True}, "error": None}
    unknown = await client.post("/api/v1/auth/logout", json={"refresh_token": "y" * 40})
    assert unknown.status_code == 200
    refresh = await client.post("/api/v1/auth/refresh", json={"refresh_token": token})
    assert refresh.json()["error"]["code"] == "refresh_invalid"


async def test_me_requires_a_valid_access_token(
    client: httpx.AsyncClient, clock: FixedClock
) -> None:
    missing = await client.get("/api/v1/users/me")
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "not_authenticated"

    garbage = await client.get("/api/v1/users/me", headers=_bearer("garbage"))
    assert garbage.json()["error"]["code"] == "invalid_token"

    session = await _register(client)
    clock.advance(seconds=901)
    expired = await client.get("/api/v1/users/me", headers=_bearer(session["access_token"]))
    assert expired.status_code == 401
    assert expired.json()["error"]["code"] == "token_expired"


async def test_me_reloads_the_user_so_deleted_accounts_are_rejected(
    client: httpx.AsyncClient, engine: AsyncEngine
) -> None:
    session = await _register(client)
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM users"))
    response = await client.get("/api/v1/users/me", headers=_bearer(session["access_token"]))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


async def test_me_lists_google_for_linked_identities(
    client: httpx.AsyncClient, engine: AsyncEngine
) -> None:
    session = await _register(client)
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO oauth_identity (id, user_id, provider, provider_sub, email) "
                "SELECT gen_random_uuid(), id, 'google', 'sub-123', email FROM users"
            )
        )
    response = await client.get("/api/v1/users/me", headers=_bearer(session["access_token"]))
    assert response.json()["data"]["auth_methods"] == ["password", "google"]


async def test_health_and_readiness(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/healthz")).json()["data"] == {"status": "ok"}
    ready = await client.get("/api/v1/readyz")
    assert ready.status_code == 200
    assert ready.json()["data"] == {"status": "ready"}
