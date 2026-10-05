"""The mock sign in contract between web and API, checked from the API side.

With NEXT_PUBLIC_AUTH_MOCK=1 the web builds the ID token itself: HS256, the UTF-8 key below,
header kid "leafy-mock". The API accepts that only when GOOGLE_MOCK=1 and never in prod.
"""

from typing import Any

import httpx
import jwt
import pytest
from app.core.clock import FixedClock
from app.core.errors import AppError
from app.main import create_app
from app.services.google_auth_service import FirebaseIdTokenVerifier
from app.services.infra.google_client import FIREBASE_CERTS_URL, HttpGoogleBackend, issuer_for
from app.services.infra.google_mock import (
    MOCK_KID,
    MOCK_SIGNING_KEY,
    MockFirebaseBackend,
    MockGoogleProvider,
)
from cryptography.hazmat.primitives.asymmetric import rsa
from pydantic import ValidationError

from tests.conftest import make_settings

WEB_SIGNING_KEY = "leafy-mock-firebase-signing-key"
CI_PROJECT = "leafy-ci-placeholder"
_RSA_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def web_mock_token(
    clock: FixedClock,
    *,
    project: str = "leafy-mock",
    email: str = "dev@example.com",
    key: str = WEB_SIGNING_KEY,
    kid: str = "leafy-mock",
    **overrides: Any,
) -> str:
    """Exactly what the web builds, claim for claim (the mock contract)."""
    iat = int(clock.now().timestamp())
    uid = "mock-0123456789abcdef0123"
    claims: dict[str, Any] = {
        "iss": f"https://securetoken.google.com/{project}",
        "aud": project,
        "sub": uid,
        "user_id": uid,
        "iat": iat,
        "auth_time": iat,
        "exp": iat + 3600,
        "email": email,
        "email_verified": True,
        "name": "Mock Googler",
        "firebase": {"sign_in_provider": "google.com", "identities": {}},
    }
    claims.update(overrides)
    return jwt.encode(claims, key, algorithm="HS256", headers={"kid": kid, "typ": "JWT"})


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock()


def _verifier(backend: Any, clock: FixedClock, project: str = "leafy-mock") -> Any:
    return FirebaseIdTokenVerifier(backend, project_id=project, clock=clock)


async def test_the_mock_backend_accepts_the_web_built_token(clock: FixedClock) -> None:
    claims = await _verifier(MockFirebaseBackend(), clock).verify(web_mock_token(clock))
    assert claims.email == "dev@example.com"
    assert claims.sub == "mock-0123456789abcdef0123"
    assert (claims.given_name, claims.family_name) == ("Mock", "Googler")


async def test_the_project_id_is_the_issuer_and_audience(clock: FixedClock) -> None:
    backend = MockFirebaseBackend(CI_PROJECT)
    token = web_mock_token(clock, project=CI_PROJECT)
    assert (await _verifier(backend, clock, CI_PROJECT).verify(token)).email == "dev@example.com"
    assert jwt.decode(token, options={"verify_signature": False})["iss"] == issuer_for(CI_PROJECT)
    with pytest.raises(AppError):
        await _verifier(backend, clock, CI_PROJECT).verify(web_mock_token(clock))  # wrong project


@pytest.mark.parametrize(
    "overrides",
    [
        {"key": "some-other-signing-key-0123456789"},
        {"kid": "mock-key-1"},
        {"kid": "leafy-mock-2"},
    ],
)
async def test_the_mock_backend_refuses_wrong_keys_and_kids(
    clock: FixedClock, overrides: dict[str, Any]
) -> None:
    with pytest.raises(AppError) as caught:
        await _verifier(MockFirebaseBackend(), clock).verify(web_mock_token(clock, **overrides))
    assert caught.value.code.value == "google_auth_failed"


async def test_the_mock_backend_refuses_an_rs256_token_with_the_mock_kid(
    clock: FixedClock,
) -> None:
    forged = jwt.encode(
        MockGoogleProvider(clock, private_key=_RSA_KEY).base_claims(email="dev@example.com"),
        _RSA_KEY,
        algorithm="RS256",
        headers={"kid": "leafy-mock"},
    )
    with pytest.raises(AppError):
        await _verifier(MockFirebaseBackend("mock-key"), clock).verify(forged)


async def test_the_mock_backend_still_checks_expiry(clock: FixedClock) -> None:
    token = web_mock_token(clock)
    clock.advance(hours=2)
    with pytest.raises(AppError):
        await _verifier(MockFirebaseBackend(), clock).verify(token)


async def test_the_real_backend_never_accepts_the_hs256_mock_token(clock: FixedClock) -> None:
    """Without GOOGLE_MOCK the same token is refused, whatever certificates Google serves."""
    provider = MockGoogleProvider(clock, private_key=_RSA_KEY)

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == FIREBASE_CERTS_URL
        return httpx.Response(200, json={"leafy-mock": provider.certificate_pem()})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        backend = HttpGoogleBackend(clock, client)
        with pytest.raises(AppError) as caught:
            await _verifier(backend, clock).verify(web_mock_token(clock))
    assert caught.value.code.value == "google_auth_failed"


def test_google_mock_selects_the_shared_key_backend_and_the_default_does_not() -> None:
    mocked = create_app(make_settings(google_mock=True))
    assert isinstance(mocked.state.google_backend, MockFirebaseBackend)
    assert isinstance(create_app(make_settings()).state.google_backend, HttpGoogleBackend)


def test_google_mock_is_refused_in_prod_by_settings_and_the_app_factory() -> None:
    with pytest.raises(ValidationError, match="GOOGLE_MOCK"):
        make_settings(env="prod", google_mock=True)
    with pytest.raises(ValueError, match="mock Google provider"):
        create_app(make_settings(env="prod"), google_backend=MockFirebaseBackend())


def test_the_mock_signing_key_matches_the_contract() -> None:
    assert (MOCK_KID, MOCK_SIGNING_KEY) == ("leafy-mock", WEB_SIGNING_KEY)
