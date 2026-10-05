"""Recovery without email: a recent Google sign in may set a new password without the old one."""

import httpx
import pytest
from app.core.clock import FixedClock
from app.services.infra.google_mock import MockGoogleProvider

from tests.integration.accounts_catalog.conftest import (
    PASSWORD,
    bearer,
    google_login,
    register,
)

pytestmark = pytest.mark.integration

PASSWORD_URL = "/api/v1/users/me/password"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
EMAIL = "gina@example.com"
NEW_PASSWORD = "a brand new meadow"
FORGOTTEN = "a password nobody remembers"


async def _google_user_with_password(client: httpx.AsyncClient, google: MockGoogleProvider) -> None:
    """A Google account that also has a password set."""
    session = (await google_login(client, google, email=EMAIL)).json()["data"]
    response = await client.post(
        PASSWORD_URL, headers=bearer(session["access_token"]), json={"new_password": FORGOTTEN}
    )
    assert response.status_code == 200


async def _login_ok(client: httpx.AsyncClient, password: str) -> bool:
    response = await client.post(LOGIN_URL, json={"email": EMAIL, "password": password})
    return response.status_code == 200


async def test_a_fresh_google_session_can_set_a_new_password_without_the_current_one(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    await _google_user_with_password(client, google)
    fresh = (await google_login(client, google, email=EMAIL)).json()["data"]
    response = await client.post(
        PASSWORD_URL, headers=bearer(fresh["access_token"]), json={"new_password": NEW_PASSWORD}
    )
    assert response.status_code == 200
    assert response.json()["data"]["changed"] is True
    assert await _login_ok(client, NEW_PASSWORD)
    assert not await _login_ok(client, FORGOTTEN)


async def test_a_stale_google_session_needs_the_current_password(
    client: httpx.AsyncClient, google: MockGoogleProvider, clock: FixedClock
) -> None:
    await _google_user_with_password(client, google)
    stale = (await google_login(client, google, email=EMAIL)).json()["data"]
    clock.advance(minutes=11)
    headers = bearer(stale["access_token"])

    missing = await client.post(PASSWORD_URL, json={"new_password": NEW_PASSWORD}, headers=headers)
    assert missing.status_code == 422
    assert missing.json()["error"]["details"] == [{"field": "current_password", "type": "missing"}]

    wrong = await client.post(
        PASSWORD_URL,
        json={"current_password": "not it at all", "new_password": NEW_PASSWORD},
        headers=headers,
    )
    assert wrong.status_code == 403
    assert wrong.json()["error"]["code"] == "password_incorrect"
    assert await _login_ok(client, FORGOTTEN)

    right = await client.post(
        PASSWORD_URL,
        json={"current_password": FORGOTTEN, "new_password": NEW_PASSWORD},
        headers=headers,
    )
    assert right.status_code == 200


async def test_the_recent_window_ends_after_ten_minutes_not_before(
    client: httpx.AsyncClient, google: MockGoogleProvider, clock: FixedClock
) -> None:
    await _google_user_with_password(client, google)
    session = (await google_login(client, google, email=EMAIL)).json()["data"]
    clock.advance(minutes=9, seconds=59)
    inside = await client.post(
        PASSWORD_URL, headers=bearer(session["access_token"]), json={"new_password": NEW_PASSWORD}
    )
    assert inside.status_code == 200


async def test_a_password_only_session_needs_the_current_password(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    await _google_user_with_password(client, google)
    signed_in = await client.post(LOGIN_URL, json={"email": EMAIL, "password": FORGOTTEN})
    headers = bearer(signed_in.json()["data"]["access_token"])
    response = await client.post(PASSWORD_URL, headers=headers, json={"new_password": NEW_PASSWORD})
    assert response.status_code == 422
    assert await _login_ok(client, FORGOTTEN)


async def test_a_registered_password_session_needs_the_current_password(
    client: httpx.AsyncClient,
) -> None:
    session = await register(client, email=EMAIL)
    response = await client.post(
        PASSWORD_URL,
        headers=bearer(session["access_token"]),
        json={"new_password": NEW_PASSWORD},
    )
    assert response.status_code == 422
    ok = await client.post(
        PASSWORD_URL,
        headers=bearer(session["access_token"]),
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert ok.status_code == 200


async def test_refreshing_does_not_make_an_old_google_sign_in_recent_again(
    client: httpx.AsyncClient, google: MockGoogleProvider, clock: FixedClock
) -> None:
    await _google_user_with_password(client, google)
    session = (await google_login(client, google, email=EMAIL)).json()["data"]
    clock.advance(minutes=11)
    refreshed = await client.post(REFRESH_URL, json={"refresh_token": session["refresh_token"]})
    token = refreshed.json()["data"]["access_token"]
    response = await client.post(
        PASSWORD_URL, headers=bearer(token), json={"new_password": NEW_PASSWORD}
    )
    assert response.status_code == 422


async def test_refreshing_keeps_a_recent_google_sign_in_recent(
    client: httpx.AsyncClient, google: MockGoogleProvider, clock: FixedClock
) -> None:
    await _google_user_with_password(client, google)
    session = (await google_login(client, google, email=EMAIL)).json()["data"]
    clock.advance(minutes=3)
    refreshed = await client.post(REFRESH_URL, json={"refresh_token": session["refresh_token"]})
    token = refreshed.json()["data"]["access_token"]
    response = await client.post(
        PASSWORD_URL, headers=bearer(token), json={"new_password": NEW_PASSWORD}
    )
    assert response.status_code == 200


async def test_the_firebase_auth_time_decides_not_the_moment_the_token_was_presented(
    client: httpx.AsyncClient, google: MockGoogleProvider, clock: FixedClock
) -> None:
    await _google_user_with_password(client, google)
    long_ago = int(clock.now().timestamp()) - 1800  # signed in 30 minutes ago, token still valid
    response = await google_login(client, google, email=EMAIL, overrides={"auth_time": long_ago})
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    rejected = await client.post(
        PASSWORD_URL, headers=bearer(token), json={"new_password": NEW_PASSWORD}
    )
    assert rejected.status_code == 422


async def test_the_new_password_still_has_to_meet_the_policy_in_recovery(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    await _google_user_with_password(client, google)
    fresh = (await google_login(client, google, email=EMAIL)).json()["data"]
    response = await client.post(
        PASSWORD_URL, headers=bearer(fresh["access_token"]), json={"new_password": "short"}
    )
    assert response.status_code == 422
    assert await _login_ok(client, FORGOTTEN)
