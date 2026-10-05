"""POST /auth/google with Firebase ID tokens signed by the mock key."""

from typing import Any

import httpx
import jwt
import pytest
from app.core.clock import FixedClock
from app.services.infra.google_client import issuer_for
from app.services.infra.google_mock import MOCK_PROJECT_ID, MockGoogleProvider
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.integration.accounts_catalog.conftest import (
    PASSWORD,
    bearer,
    google_login,
    register,
)

pytestmark = pytest.mark.integration

GOOGLE_URL = "/api/v1/auth/google"
FAILED_MESSAGE = "Google sign in did not work. Please try again."


async def _post_claims(
    client: httpx.AsyncClient, google: MockGoogleProvider, **overrides: Any
) -> httpx.Response:
    token = google.issue_id_token(email="gina@example.com", overrides=overrides)
    return await client.post(GOOGLE_URL, json={"id_token": token})


async def _user_count(engine: AsyncEngine) -> int:
    async with engine.connect() as conn:
        return int((await conn.execute(text("SELECT count(*) FROM users"))).scalar_one())


async def test_new_google_user_is_created_verified_and_signed_in(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    response = await google_login(client, google, name="Gina Green")
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
    assert await _user_count(engine) == 1


async def test_identity_is_matched_by_uid_even_when_the_email_changes(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    first = await google_login(client, google, email="old@example.com", sub="stable-uid-1")
    second = await google_login(client, google, email="new@example.com", sub="stable-uid-1")
    assert first.json()["data"]["user"]["id"] == second.json()["data"]["user"]["id"]
    assert second.json()["data"]["user"]["email"] == "old@example.com"


async def test_the_firebase_uid_is_stored_as_the_google_provider_subject(
    client: httpx.AsyncClient, google: MockGoogleProvider, engine: AsyncEngine
) -> None:
    await google_login(client, google, sub="firebase-uid-42")
    async with engine.connect() as conn:
        row = (
            await conn.execute(text("SELECT provider::text, provider_sub FROM oauth_identity"))
        ).one()
    assert tuple(row) == ("google", "firebase-uid-42")


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
    assert await _user_count(engine) == 0


async def test_unverified_email_does_not_link_to_an_existing_account(
    client: httpx.AsyncClient, google: MockGoogleProvider, engine: AsyncEngine
) -> None:
    await register(client, email="gina@example.com")
    response = await google_login(client, google, email="gina@example.com", email_verified=False)
    assert response.json()["error"]["code"] == "google_email_unverified"
    async with engine.connect() as conn:
        links = (await conn.execute(text("SELECT count(*) FROM oauth_identity"))).scalar_one()
    assert links == 0


async def test_email_verified_given_as_the_string_false_is_refused(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    response = await google_login(client, google, email_verified="false")
    assert response.json()["error"]["code"] == "google_email_unverified"


async def test_email_verified_missing_is_refused_as_unverified(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    response = await _post_claims(client, google, email_verified=None)
    assert response.json()["error"]["code"] == "google_email_unverified"


async def test_email_verified_given_as_the_string_true_is_accepted(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    response = await google_login(client, google, email_verified="true")
    assert response.status_code == 200


@pytest.mark.parametrize(
    ("label", "overrides"),
    [
        ("wrong audience", {"aud": "someone-elses-project"}),
        ("wrong issuer", {"iss": "https://securetoken.google.com/someone-elses-project"}),
        ("google accounts issuer", {"iss": "https://accounts.google.com"}),
        ("missing sub", {"sub": None}),
        ("empty sub", {"sub": ""}),
        ("missing email", {"email": None}),
        ("email without at sign", {"email": "nobody"}),
        ("expired", {"exp": 1_700_000_000}),
        ("missing exp", {"exp": None}),
        ("issued in the future", {"iat": 4_000_000_000}),
        ("missing iat", {"iat": None}),
        ("auth time in the future", {"auth_time": 4_000_000_000}),
        ("missing auth time", {"auth_time": None}),
        ("no firebase claim", {"firebase": None}),
        ("email password provider", {"firebase": {"sign_in_provider": "password"}}),
        ("anonymous provider", {"firebase": {"sign_in_provider": "anonymous"}}),
        ("custom token provider", {"firebase": {"sign_in_provider": "custom"}}),
        ("firebase claim not an object", {"firebase": "google.com"}),
    ],
)
async def test_invalid_id_tokens_are_refused_with_a_generic_error(
    client: httpx.AsyncClient,
    google: MockGoogleProvider,
    engine: AsyncEngine,
    label: str,
    overrides: dict[str, Any],
) -> None:
    response = await _post_claims(client, google, **overrides)
    assert response.status_code == 400, label
    assert response.json()["error"]["code"] == "google_auth_failed", label
    assert response.json()["error"]["message"] == FAILED_MESSAGE
    assert await _user_count(engine) == 0


async def test_a_token_that_expires_by_the_injected_clock_is_refused(
    client: httpx.AsyncClient, google: MockGoogleProvider, clock: FixedClock
) -> None:
    token = google.issue_id_token(email="gina@example.com")
    clock.advance(hours=2)
    response = await client.post(GOOGLE_URL, json={"id_token": token})
    assert response.json()["error"]["code"] == "google_auth_failed"


async def test_small_clock_skew_is_tolerated(
    client: httpx.AsyncClient, google: MockGoogleProvider, clock: FixedClock
) -> None:
    now = int(clock.now().timestamp())
    response = await _post_claims(client, google, iat=now + 30, auth_time=now + 30, exp=now - 30)
    assert response.status_code == 200


async def test_a_replayed_token_is_accepted_again_because_verification_is_stateless(
    client: httpx.AsyncClient, google: MockGoogleProvider, engine: AsyncEngine
) -> None:
    token = google.issue_id_token(email="gina@example.com")
    first = await client.post(GOOGLE_URL, json={"id_token": token})
    second = await client.post(GOOGLE_URL, json={"id_token": token})
    assert first.status_code == second.status_code == 200
    assert first.json()["data"]["is_new_user"] is True
    assert second.json()["data"]["is_new_user"] is False
    assert first.json()["data"]["user"]["id"] == second.json()["data"]["user"]["id"]
    assert await _user_count(engine) == 1


async def test_an_id_token_signed_by_another_key_is_refused(
    client: httpx.AsyncClient, google: MockGoogleProvider, clock: FixedClock
) -> None:
    forged = MockGoogleProvider(clock).issue_id_token(email="gina@example.com")
    response = await client.post(GOOGLE_URL, json={"id_token": forged})
    assert response.json()["error"]["code"] == "google_auth_failed"


async def test_a_tampered_payload_fails_the_signature_check(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    header, _, signature = google.issue_id_token(email="gina@example.com").split(".")
    other = jwt.encode({"sub": "attacker"}, "x" * 32, algorithm="HS256").split(".")[1]
    response = await client.post(GOOGLE_URL, json={"id_token": f"{header}.{other}.{signature}"})
    assert response.json()["error"]["code"] == "google_auth_failed"


async def test_an_unsigned_none_algorithm_token_is_refused(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    claims = google.base_claims(email="gina@example.com")
    unsigned = jwt.encode(claims, key="", algorithm="none", headers={"kid": google.kid})
    response = await client.post(GOOGLE_URL, json={"id_token": unsigned})
    assert response.json()["error"]["code"] == "google_auth_failed"


async def test_an_hs256_token_is_refused(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    claims = google.base_claims(email="gina@example.com")
    confused = jwt.encode(claims, "shared-secret-shared-secret-32by", "HS256", {"kid": google.kid})
    response = await client.post(GOOGLE_URL, json={"id_token": confused})
    assert response.json()["error"]["code"] == "google_auth_failed"


async def test_garbage_is_refused(client: httpx.AsyncClient) -> None:
    response = await client.post(GOOGLE_URL, json={"id_token": "not-a-jwt"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "google_auth_failed"


async def test_the_request_body_is_validated(client: httpx.AsyncClient) -> None:
    assert (await client.post(GOOGLE_URL, json={})).status_code == 422
    assert (await client.post(GOOGLE_URL, json={"id_token": ""})).status_code == 422
    assert (await client.post(GOOGLE_URL, json={"id_token": "x" * 9000})).status_code == 422
    legacy = {"code": "c", "code_verifier": "v" * 64, "nonce": "n" * 24, "redirect_uri": "u"}
    assert (await client.post(GOOGLE_URL, json=legacy)).status_code == 422
    extra = {"id_token": "a.b.c", "admin": True}
    assert (await client.post(GOOGLE_URL, json=extra)).status_code == 422


async def test_google_sign_in_is_rate_limited_per_ip(app: Any, client: httpx.AsyncClient) -> None:
    app.state.rate_limiter._enabled = True
    body = {"id_token": "not-a-jwt"}
    codes = [(await client.post(GOOGLE_URL, json=body)).status_code for _ in range(11)]
    assert codes[:10] == [400] * 10
    assert codes[10] == 429


async def test_unknown_signing_key_triggers_one_certificate_refresh_then_fails(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    token = google.issue_id_token(email="gina@example.com", kid="rotated-away")
    response = await client.post(GOOGLE_URL, json={"id_token": token})
    assert response.json()["error"]["code"] == "google_auth_failed"
    assert google.refresh_count == 1


async def test_a_known_key_needs_no_certificate_refresh(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    assert (await google_login(client, google)).status_code == 200
    assert google.refresh_count == 0


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


async def test_names_come_from_given_and_family_name_then_the_full_name_then_the_email(
    client: httpx.AsyncClient, google: MockGoogleProvider
) -> None:
    split = await _post_claims(client, google, given_name="Grace", family_name="Hopper")
    assert split.json()["data"]["user"]["first_name"] == "Grace"
    assert split.json()["data"]["user"]["last_name"] == "Hopper"
    full = await google_login(client, google, email="a@example.com", name="Ada Lovelace")
    assert full.json()["data"]["user"]["first_name"] == "Ada"
    assert full.json()["data"]["user"]["last_name"] == "Lovelace"
    bare = await google_login(client, google, email="bob@example.com", name=None)
    assert bare.json()["data"]["user"]["first_name"] == "bob"


def test_issuer_and_audience_follow_the_firebase_project() -> None:
    assert issuer_for("leafy-8ecd6") == "https://securetoken.google.com/leafy-8ecd6"
    assert MOCK_PROJECT_ID == "leafy-mock"
