"""Verify, resend, forgot and reset over HTTP with a fake email sender and a real Postgres."""

import httpx
import pytest
from app.core.clock import FixedClock
from app.services.infra.google_mock import MockGoogleProvider
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.integration.accounts_catalog.conftest import (
    PASSWORD,
    Settle,
    bearer,
    google_login,
    register,
)
from tests.support.fakes import FakeEmailSender

pytestmark = pytest.mark.integration

EMAIL = "leaf@example.com"
NEW_PASSWORD = "a brand new meadow"


async def _verify(client: httpx.AsyncClient, token: str) -> httpx.Response:
    return await client.post("/api/v1/auth/verify-email", json={"token": token})


async def test_register_sends_a_verification_email(
    client: httpx.AsyncClient, outbox: FakeEmailSender, settle: Settle
) -> None:
    await register(client)
    await settle()
    [message] = outbox.to(EMAIL)
    assert message.subject == "Verify your Leafy email"
    assert "https://leafy.test/verify-email?token=" in message.text
    assert "https://leafy.test/verify-email?token=" in message.html
    assert "Hello Leaf" in message.text


async def test_register_still_succeeds_when_email_delivery_fails(
    client: httpx.AsyncClient, outbox: FakeEmailSender, settle: Settle
) -> None:
    outbox.fail = True
    session = await register(client)
    await settle()
    assert session["user"]["email_verified"] is False


async def test_verify_email_marks_the_user_verified(
    client: httpx.AsyncClient, outbox: FakeEmailSender, settle: Settle
) -> None:
    session = await register(client)
    await settle()
    response = await _verify(client, outbox.last_token(EMAIL))
    assert response.status_code == 200
    assert response.json()["data"] == {"verified": True}
    me = await client.get("/api/v1/users/me", headers=bearer(session["access_token"]))
    assert me.json()["data"]["email_verified"] is True


async def test_verify_token_is_single_use_with_a_uniform_error(
    client: httpx.AsyncClient, outbox: FakeEmailSender, settle: Settle
) -> None:
    await register(client)
    await settle()
    token = outbox.last_token(EMAIL)
    assert (await _verify(client, token)).status_code == 200
    replay = await _verify(client, token)
    unknown = await _verify(client, "does-not-exist")
    for response in (replay, unknown):
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "token_invalid_or_expired"
    assert replay.json()["error"]["message"] == unknown.json()["error"]["message"]


async def test_verify_token_expires_after_24_hours(
    client: httpx.AsyncClient, outbox: FakeEmailSender, clock: FixedClock, settle: Settle
) -> None:
    await register(client)
    await settle()
    token = outbox.last_token(EMAIL)
    clock.advance(hours=24, seconds=1)
    response = await _verify(client, token)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "token_invalid_or_expired"


async def test_verify_token_is_still_valid_just_before_expiry(
    client: httpx.AsyncClient, outbox: FakeEmailSender, clock: FixedClock, settle: Settle
) -> None:
    await register(client)
    await settle()
    token = outbox.last_token(EMAIL)
    clock.advance(hours=23, minutes=59)
    assert (await _verify(client, token)).status_code == 200


async def test_a_reset_token_cannot_verify_an_email(
    client: httpx.AsyncClient, outbox: FakeEmailSender, settle: Settle
) -> None:
    await register(client)
    await client.post("/api/v1/auth/forgot-password", json={"email": EMAIL})
    await settle()
    reset_token = outbox.last_token(EMAIL)
    response = await _verify(client, reset_token)
    assert response.status_code == 400


async def test_resend_requires_authentication(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/auth/resend-verification")
    assert response.status_code == 401


async def test_resend_is_blocked_during_the_cooldown_then_allowed(
    client: httpx.AsyncClient, outbox: FakeEmailSender, clock: FixedClock, settle: Settle
) -> None:
    session = await register(client)
    headers = bearer(session["access_token"])
    await settle()
    blocked = await client.post("/api/v1/auth/resend-verification", headers=headers)
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limited"
    assert 1 <= int(blocked.headers["Retry-After"]) <= 60

    clock.advance(seconds=61)
    allowed = await client.post("/api/v1/auth/resend-verification", headers=headers)
    assert allowed.status_code == 200
    await settle()
    assert len(outbox.to(EMAIL)) == 2


async def test_resend_invalidates_the_previous_link(
    client: httpx.AsyncClient, outbox: FakeEmailSender, clock: FixedClock, settle: Settle
) -> None:
    session = await register(client)
    await settle()
    first = outbox.last_token(EMAIL)
    clock.advance(seconds=61)
    await client.post("/api/v1/auth/resend-verification", headers=bearer(session["access_token"]))
    await settle()
    assert (await _verify(client, first)).status_code == 400
    assert (await _verify(client, outbox.last_token(EMAIL))).status_code == 200


async def test_resend_for_a_verified_user_is_409_already_verified(
    client: httpx.AsyncClient, outbox: FakeEmailSender, settle: Settle
) -> None:
    session = await register(client)
    await settle()
    await _verify(client, outbox.last_token(EMAIL))
    response = await client.post(
        "/api/v1/auth/resend-verification", headers=bearer(session["access_token"])
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "already_verified"


async def test_forgot_password_answers_the_same_for_known_and_unknown_emails(
    client: httpx.AsyncClient, outbox: FakeEmailSender, settle: Settle
) -> None:
    await register(client)
    await settle()
    outbox.sent.clear()
    known = await client.post("/api/v1/auth/forgot-password", json={"email": EMAIL})
    unknown = await client.post(
        "/api/v1/auth/forgot-password", json={"email": "nobody@example.com"}
    )
    await settle()
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert len(outbox.to(EMAIL)) == 1
    assert outbox.to("nobody@example.com") == []
    assert outbox.to(EMAIL)[0].subject == "Reset your Leafy password"


async def test_forgot_password_rejects_a_malformed_email_with_422(
    client: httpx.AsyncClient,
) -> None:
    response = await client.post("/api/v1/auth/forgot-password", json={"email": "not-an-email"})
    assert response.status_code == 422


async def test_reset_password_sets_the_password_and_revokes_every_session(
    client: httpx.AsyncClient, outbox: FakeEmailSender, settle: Settle
) -> None:
    session = await register(client)
    second = await client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
    other_refresh = second.json()["data"]["refresh_token"]
    await client.post("/api/v1/auth/forgot-password", json={"email": EMAIL})
    await settle()
    token = outbox.last_token(EMAIL)

    response = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}
    )
    assert response.status_code == 200
    await settle()

    for refresh in (session["refresh_token"], other_refresh):
        again = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
        assert again.status_code == 401
        assert again.json()["error"]["code"] == "refresh_invalid"
    old = await client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert old.status_code == 401
    new = await client.post("/api/v1/auth/login", json={"email": EMAIL, "password": NEW_PASSWORD})
    assert new.status_code == 200
    notice = [m for m in outbox.to(EMAIL) if m.subject == "Your Leafy password was changed"]
    assert len(notice) == 1


async def test_reset_token_is_single_use(
    client: httpx.AsyncClient, outbox: FakeEmailSender, settle: Settle
) -> None:
    await register(client)
    await client.post("/api/v1/auth/forgot-password", json={"email": EMAIL})
    await settle()
    token = outbox.last_token(EMAIL)
    body = {"token": token, "new_password": NEW_PASSWORD}
    assert (await client.post("/api/v1/auth/reset-password", json=body)).status_code == 200
    again = await client.post("/api/v1/auth/reset-password", json=body)
    assert again.status_code == 400
    assert again.json()["error"]["code"] == "token_invalid_or_expired"


async def test_reset_token_expires_after_one_hour(
    client: httpx.AsyncClient, outbox: FakeEmailSender, clock: FixedClock, settle: Settle
) -> None:
    await register(client)
    await client.post("/api/v1/auth/forgot-password", json={"email": EMAIL})
    await settle()
    token = outbox.last_token(EMAIL)
    clock.advance(hours=1, seconds=1)
    response = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}
    )
    assert response.status_code == 400


async def test_a_weak_password_does_not_burn_the_reset_token(
    client: httpx.AsyncClient, outbox: FakeEmailSender, settle: Settle
) -> None:
    await register(client)
    await client.post("/api/v1/auth/forgot-password", json={"email": EMAIL})
    await settle()
    token = outbox.last_token(EMAIL)
    weak = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": "password123"}
    )
    assert weak.status_code == 422
    assert "password123" not in weak.text
    # The email as a password passes the schema but fails in the service; the token survives.
    same_as_email = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": EMAIL}
    )
    assert same_as_email.status_code == 422
    ok = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}
    )
    assert ok.status_code == 200


async def test_requesting_a_second_reset_link_retires_the_first(
    client: httpx.AsyncClient, outbox: FakeEmailSender, settle: Settle
) -> None:
    await register(client)
    await client.post("/api/v1/auth/forgot-password", json={"email": EMAIL})
    await settle()
    first = outbox.last_token(EMAIL)
    await client.post("/api/v1/auth/forgot-password", json={"email": EMAIL})
    await settle()
    body = {"new_password": NEW_PASSWORD}
    stale = await client.post("/api/v1/auth/reset-password", json={"token": first, **body})
    assert stale.status_code == 400
    fresh = await client.post(
        "/api/v1/auth/reset-password", json={"token": outbox.last_token(EMAIL), **body}
    )
    assert fresh.status_code == 200


async def test_only_the_hash_of_a_token_is_stored(
    client: httpx.AsyncClient, outbox: FakeEmailSender, engine: AsyncEngine, settle: Settle
) -> None:
    await register(client)
    await settle()
    token = outbox.last_token(EMAIL)
    async with engine.connect() as conn:
        hashes = [row[0] for row in await conn.execute(text("SELECT token_hash FROM auth_token"))]
    assert hashes
    assert token not in hashes
    assert all(len(value) == 64 for value in hashes)


async def test_forgot_password_is_rate_limited_per_email(
    app: FastAPI, client: httpx.AsyncClient
) -> None:
    app.state.rate_limiter._enabled = True
    codes = [
        (
            await client.post("/api/v1/auth/forgot-password", json={"email": "nobody@example.com"})
        ).status_code
        for _ in range(4)
    ]
    assert codes == [200, 200, 200, 429]


async def test_a_google_only_user_can_add_a_password_through_reset(
    client: httpx.AsyncClient, outbox: FakeEmailSender, google: MockGoogleProvider, settle: Settle
) -> None:
    login = await google_login(client, google, email="gina@example.com")
    assert login.status_code == 200
    assert login.json()["data"]["user"]["auth_methods"] == ["google"]
    await client.post("/api/v1/auth/forgot-password", json={"email": "gina@example.com"})
    await settle()
    token = outbox.last_token("gina@example.com")
    reset = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}
    )
    assert reset.status_code == 200
    signed_in = await client.post(
        "/api/v1/auth/login", json={"email": "gina@example.com", "password": NEW_PASSWORD}
    )
    assert signed_in.status_code == 200
    assert signed_in.json()["data"]["user"]["auth_methods"] == ["password", "google"]
