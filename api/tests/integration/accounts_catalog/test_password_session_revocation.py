"""Changing or recovering a password ends every other session and old access tokens."""

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
ME_URL = "/api/v1/users/me"
EMAIL = "gina@example.com"
NEW_PASSWORD = "a brand new meadow"


async def _login(client: httpx.AsyncClient, email: str, password: str) -> dict[str, str]:
    response = await client.post(LOGIN_URL, json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    data: dict[str, str] = response.json()["data"]
    return data


async def test_changing_the_password_revokes_other_refresh_tokens(
    client: httpx.AsyncClient, clock: FixedClock
) -> None:
    first = await register(client, email=EMAIL)
    clock.advance(seconds=30)
    other = await _login(client, EMAIL, PASSWORD)
    response = await client.post(
        PASSWORD_URL,
        headers=bearer(first["access_token"]),
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert response.status_code == 200
    for stolen in (first, other):
        refused = await client.post(REFRESH_URL, json={"refresh_token": stolen["refresh_token"]})
        assert refused.status_code == 401


async def test_access_tokens_issued_before_the_change_stop_working(
    client: httpx.AsyncClient, clock: FixedClock
) -> None:
    first = await register(client, email=EMAIL)
    clock.advance(seconds=30)
    other = await _login(client, EMAIL, PASSWORD)
    clock.advance(seconds=30)
    await client.post(
        PASSWORD_URL,
        headers=bearer(first["access_token"]),
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert (await client.get(ME_URL, headers=bearer(other["access_token"]))).status_code == 401


async def test_the_caller_gets_a_fresh_working_session_back(
    client: httpx.AsyncClient, clock: FixedClock
) -> None:
    first = await register(client, email=EMAIL)
    clock.advance(seconds=30)
    response = await client.post(
        PASSWORD_URL,
        headers=bearer(first["access_token"]),
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
    )
    data = response.json()["data"]
    assert data["changed"] is True
    assert (await client.get(ME_URL, headers=bearer(data["access_token"]))).status_code == 200
    refreshed = await client.post(REFRESH_URL, json={"refresh_token": data["refresh_token"]})
    assert refreshed.status_code == 200


async def test_a_google_recovery_ends_an_attackers_older_session(
    client: httpx.AsyncClient, google: MockGoogleProvider, clock: FixedClock
) -> None:
    owner = await register(client, email=EMAIL)
    clock.advance(minutes=1)
    attacker = await _login(client, EMAIL, PASSWORD)
    clock.advance(minutes=1)
    fresh = (await google_login(client, google, email=EMAIL)).json()["data"]
    response = await client.post(
        PASSWORD_URL, headers=bearer(fresh["access_token"]), json={"new_password": NEW_PASSWORD}
    )
    assert response.status_code == 200
    stolen = await client.post(REFRESH_URL, json={"refresh_token": attacker["refresh_token"]})
    assert stolen.status_code == 401
    assert (await client.get(ME_URL, headers=bearer(owner["access_token"]))).status_code == 401


async def test_first_password_on_a_google_only_account_needs_a_recent_sign_in(
    client: httpx.AsyncClient, google: MockGoogleProvider, clock: FixedClock
) -> None:
    session = (await google_login(client, google, email=EMAIL)).json()["data"]
    clock.advance(minutes=11)
    response = await client.post(
        PASSWORD_URL, headers=bearer(session["access_token"]), json={"new_password": NEW_PASSWORD}
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "reauth_required"
    login = await client.post(LOGIN_URL, json={"email": EMAIL, "password": NEW_PASSWORD})
    assert login.status_code != 200
