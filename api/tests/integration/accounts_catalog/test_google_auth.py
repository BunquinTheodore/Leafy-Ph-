"""POST /auth/google against the mock provider: create, link, rejection cases, replay."""

from typing import Any

import httpx
import pytest
from app.core.clock import FixedClock
from app.services.infra.google_mock import (
    GOOGLE_ISSUER,
    MOCK_CLIENT_ID,
    MockGoogleProvider,
    pkce_challenge,
)
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.integration.accounts_catalog.conftest import (
    GOOGLE_REDIRECT,
    NONCE,
    PASSWORD,
    VERIFIER,
    bearer,
    google_login,
    register,
)

pytestmark = pytest.mark.integration

GOOGLE_URL = "/api/v1/auth/google"


async def _post_token(
    client: httpx.AsyncClient, google: MockGoogleProvider, id_token_claims: dict[str, Any]
) -> httpx.Response:
    """Send a hand built ID token through the real endpoint by wrapping it in a fake code."""
    token = google.sign(id_token_claims)

    async def exchange(**_: Any) -> str:
        return token

    google.exchange_code = exchange  # type: ignore[method-assign]
    return await client.post(
        GOOGLE_URL,
        json={
            "code": "any-code",
            "code_verifier": VERIFIER,
            "nonce": NONCE,
            "redirect_uri": GOOGLE_REDIRECT,
        },
    )


def _claims(google: MockGoogleProvider, **changes: Any) -> dict[str, Any]:
    claims = google.base_claims(email="gina@example.com", nonce=NONCE)
    for key, value in changes.items():
        if value is None:
            claims.pop(key, None)
        else:
            claims[key] = value
    return claims


async def test_new_google_user_is_created_verified_and_signed_in(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    response = await google_login(client, google, given_name="Gina", family_name="Green")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["is_new_user"] is True
    assert data["linked_existing_account"] is False
    assert data["user"]["email"] == "gina@example.com"
    assert data["user"]["first_name"] == "Gina"
    assert data["user"]["last_name"] == "Green"
    assert data["user"]["email_verified"] is True
    assert data["user"]["auth_methods"] == ["google"]
    me = await client.get("/api/v1/users/me", headers=bearer(data["access_token"]))
    assert me.status_code == 200


async def test_returning_google_user_signs_in_without_creating_another_account(
    client: httpx.AsyncClient, google: MockGoogleProvider, engine: AsyncEngine
) -> None:
    first = await google_login(client, google)
    second = await google_login(client, google)
    assert second.status_code == 200
    assert second.json()["data"]["is_new_user"] is False
    assert first.json()["data"]["user"]["id"] == second.json()["data"]["user"]["id"]
    async with engine.connect() as conn:
        users = (await conn.execute(text("SELECT count(*) FROM users"))).scalar_one()
    assert users == 1


async def test_identity_is_matched_by_sub_even_when_the_email_changes(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    first = await google_login(client, google, email="old@example.com", sub="stable-sub-1")
    second = await google_login(client, google, email="new@example.com", sub="stable-sub-1")
    assert first.json()["data"]["user"]["id"] == second.json()["data"]["user"]["id"]
    assert second.json()["data"]["user"]["email"] == "old@example.com"


async def test_google_links_to_an_existing_verified_password_account(
    client: httpx.AsyncClient, google: MockGoogleProvider, engine: AsyncEngine
) -> None:
    await register(client, email="gina@example.com")
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE users SET email_verified_at = now()"))
    response = await google_login(client, google, email="gina@example.com")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["linked_existing_account"] is True
    assert data["is_new_user"] is False
    assert data["user"]["auth_methods"] == ["password", "google"]
    login = await client.post(
        "/api/v1/auth/login", json={"email": "gina@example.com", "password": PASSWORD}
    )
    assert login.status_code == 200


async def test_linking_marks_an_unverified_account_verified(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    await register(client, email="gina@example.com")
    response = await google_login(client, google, email="gina@example.com")
    assert response.json()["data"]["user"]["email_verified"] is True


async def test_linking_an_unverified_account_removes_the_earlier_password_and_sessions(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    """Someone may have registered another person's email before the owner used Google."""
    squatter = await register(client, email="gina@example.com")
    response = await google_login(client, google, email="gina@example.com")
    assert response.status_code == 200
    assert response.json()["data"]["user"]["auth_methods"] == ["google"]
    login = await client.post(
        "/api/v1/auth/login", json={"email": "gina@example.com", "password": PASSWORD}
    )
    assert login.status_code == 401
    refresh = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": squatter["refresh_token"]}
    )
    assert refresh.status_code == 401


async def test_google_email_that_is_not_verified_is_refused(
    client: httpx.AsyncClient, google: MockGoogleProvider, engine: AsyncEngine
) -> None:
    response = await google_login(client, google, email_verified=False)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "google_email_unverified"
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT count(*) FROM users"))).scalar_one() == 0


async def test_email_verified_given_as_the_string_false_is_refused(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    response = await google_login(client, google, email_verified="false")
    assert response.json()["error"]["code"] == "google_email_unverified"


async def test_email_verified_given_as_the_string_true_is_accepted(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    response = await google_login(client, google, email_verified="true")
    assert response.status_code == 200


@pytest.mark.parametrize(
    ("label", "changes"),
    [
        ("wrong audience", {"aud": "someone-elses-client-id"}),
        ("wrong issuer", {"iss": "https://evil.example.com"}),
        ("missing sub", {"sub": None}),
        ("missing email", {"email": None}),
        ("missing nonce", {"nonce": None}),
        ("wrong nonce", {"nonce": "x" * 24}),
        ("expired", {"exp": 1_700_000_000}),
        ("issued in the future", {"iat": 4_000_000_000}),
    ],
)
async def test_invalid_id_tokens_are_refused_with_a_generic_error(
    client: httpx.AsyncClient,
    google: MockGoogleProvider,
    engine: AsyncEngine,
    label: str,
    changes: dict[str, Any],
) -> None:
    response = await _post_token(client, google, _claims(google, **changes))
    assert response.status_code == 400, label
    assert response.json()["error"]["code"] == "google_auth_failed"
    assert response.json()["error"]["message"] == "Google sign in did not work. Please try again."
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT count(*) FROM users"))).scalar_one() == 0


async def test_a_token_that_expired_in_the_past_by_the_injected_clock_is_refused(
    client: httpx.AsyncClient, google: MockGoogleProvider, clock: FixedClock
) -> None:
    claims = _claims(google)
    clock.advance(hours=2)
    response = await _post_token(client, google, claims)
    assert response.json()["error"]["code"] == "google_auth_failed"


async def test_an_id_token_signed_by_another_key_is_refused(
    client: httpx.AsyncClient, google: MockGoogleProvider, clock: FixedClock
) -> None:
    other = MockGoogleProvider(clock)
    forged = other.sign(_claims(google))

    async def exchange(**_: Any) -> str:
        return forged

    google.exchange_code = exchange  # type: ignore[method-assign]
    response = await client.post(
        GOOGLE_URL,
        json={
            "code": "c",
            "code_verifier": VERIFIER,
            "nonce": NONCE,
            "redirect_uri": GOOGLE_REDIRECT,
        },
    )
    assert response.json()["error"]["code"] == "google_auth_failed"


async def test_an_unsigned_none_algorithm_token_is_refused(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    import jwt

    unsigned = jwt.encode(_claims(google), key="", algorithm="none", headers={"kid": google.kid})

    async def exchange(**_: Any) -> str:
        return unsigned

    google.exchange_code = exchange  # type: ignore[method-assign]
    response = await client.post(
        GOOGLE_URL,
        json={
            "code": "c",
            "code_verifier": VERIFIER,
            "nonce": NONCE,
            "redirect_uri": GOOGLE_REDIRECT,
        },
    )
    assert response.json()["error"]["code"] == "google_auth_failed"


async def test_a_replayed_authorization_code_is_refused(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    code = google.create_code(
        email="gina@example.com",
        nonce=NONCE,
        code_challenge=pkce_challenge(VERIFIER),
        redirect_uri=GOOGLE_REDIRECT,
    )
    body = {
        "code": code,
        "code_verifier": VERIFIER,
        "nonce": NONCE,
        "redirect_uri": GOOGLE_REDIRECT,
    }
    assert (await client.post(GOOGLE_URL, json=body)).status_code == 200
    replay = await client.post(GOOGLE_URL, json=body)
    assert replay.status_code == 400
    assert replay.json()["error"]["code"] == "google_auth_failed"


async def test_a_wrong_pkce_verifier_is_refused(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    code = google.create_code(
        email="gina@example.com",
        nonce=NONCE,
        code_challenge=pkce_challenge(VERIFIER),
        redirect_uri=GOOGLE_REDIRECT,
    )
    response = await client.post(
        GOOGLE_URL,
        json={
            "code": code,
            "code_verifier": "w" * 64,
            "nonce": NONCE,
            "redirect_uri": GOOGLE_REDIRECT,
        },
    )
    assert response.json()["error"]["code"] == "google_auth_failed"


async def test_a_redirect_uri_outside_the_allowlist_is_refused_before_any_exchange(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    code = google.create_code(email="gina@example.com", nonce=NONCE)
    response = await client.post(
        GOOGLE_URL,
        json={
            "code": code,
            "code_verifier": VERIFIER,
            "nonce": NONCE,
            "redirect_uri": "https://evil.example.com/callback",
        },
    )
    assert response.json()["error"]["code"] == "google_auth_failed"
    assert google.exchange_count == 0


async def test_the_request_body_is_validated(client: httpx.AsyncClient) -> None:
    short_verifier = {
        "code": "c",
        "code_verifier": "short",
        "nonce": NONCE,
        "redirect_uri": GOOGLE_REDIRECT,
    }
    assert (await client.post(GOOGLE_URL, json=short_verifier)).status_code == 422
    assert (await client.post(GOOGLE_URL, json={})).status_code == 422
    extra = {**short_verifier, "code_verifier": VERIFIER, "admin": True}
    assert (await client.post(GOOGLE_URL, json=extra)).status_code == 422


async def test_google_sign_in_is_rate_limited_per_ip(
    app: Any, client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    app.state.rate_limiter._enabled = True
    body = {
        "code": "unknown",
        "code_verifier": VERIFIER,
        "nonce": NONCE,
        "redirect_uri": GOOGLE_REDIRECT,
    }
    codes = [(await client.post(GOOGLE_URL, json=body)).status_code for _ in range(11)]
    assert codes[:10] == [400] * 10
    assert codes[10] == 429


async def test_unknown_signing_key_triggers_one_refresh_then_fails(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    token = google.issue_id_token(email="gina@example.com", nonce=NONCE, kid="rotated-away")

    async def exchange(**_: Any) -> str:
        return token

    google.exchange_code = exchange  # type: ignore[method-assign]
    response = await client.post(
        GOOGLE_URL,
        json={
            "code": "c",
            "code_verifier": VERIFIER,
            "nonce": NONCE,
            "redirect_uri": GOOGLE_REDIRECT,
        },
    )
    assert response.json()["error"]["code"] == "google_auth_failed"


async def test_google_only_user_cannot_sign_in_with_a_password(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    await google_login(client, google, email="gina@example.com")
    wrong = await client.post(
        "/api/v1/auth/login", json={"email": "gina@example.com", "password": PASSWORD}
    )
    unknown = await client.post(
        "/api/v1/auth/login", json={"email": "nobody@example.com", "password": PASSWORD}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"]["message"] == unknown.json()["error"]["message"]
    assert wrong.json()["error"]["code"] == "invalid_credentials"


async def test_names_fall_back_to_the_full_name_then_the_email(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    first = await google_login(
        client,
        google,
        email="a@example.com",
        given_name=None,
        family_name=None,
        name="Ada Lovelace",
    )
    assert first.json()["data"]["user"]["first_name"] == "Ada"
    assert first.json()["data"]["user"]["last_name"] == "Lovelace"
    second = await google_login(
        client, google, email="bob@example.com", given_name=None, family_name=None, name=None
    )
    assert second.json()["data"]["user"]["first_name"] == "bob"


def test_mock_provider_constants_match_the_real_issuer() -> None:
    assert GOOGLE_ISSUER == "https://accounts.google.com"
    assert MOCK_CLIENT_ID.endswith(".apps.googleusercontent.com")
