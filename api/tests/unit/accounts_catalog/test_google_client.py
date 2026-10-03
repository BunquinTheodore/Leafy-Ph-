"""HttpGoogleBackend (code exchange, JWKS cache) and the mock provider's HTTP face."""

from typing import Any

import httpx
import pytest
from app.core.clock import FixedClock
from app.main import create_app
from app.services.google_auth_service import GoogleIdTokenVerifier
from app.services.infra.google_client import (
    GOOGLE_JWKS_URL,
    GOOGLE_TOKEN_URL,
    GoogleBackendError,
    HttpGoogleBackend,
    jwks_ttl_seconds,
)
from app.services.infra.google_mock import MOCK_CLIENT_ID, MockGoogleProvider, pkce_challenge
from cryptography.hazmat.primitives.asymmetric import rsa
from pydantic import ValidationError

from tests.conftest import make_settings

REDIRECT = "http://localhost:3000/api/auth/google/callback"
NONCE = "n" * 24
_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class Recorder:
    """An httpx transport that records requests and answers from a script."""

    def __init__(self, provider: MockGoogleProvider, *, cache_control: str | None = None) -> None:
        self.requests: list[httpx.Request] = []
        self.provider = provider
        self.cache_control = cache_control
        self.token_status = 200
        self.token_body: Any = {"id_token": "the.id.token"}
        self.jwks_status = 200
        self.keys: list[dict[str, Any]] | None = None

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if str(request.url) == GOOGLE_TOKEN_URL:
            return httpx.Response(self.token_status, json=self.token_body)
        assert str(request.url) == GOOGLE_JWKS_URL
        headers = {"cache-control": self.cache_control} if self.cache_control else {}
        keys = self.keys if self.keys is not None else [self.provider.jwk()]
        return httpx.Response(self.jwks_status, json={"keys": keys}, headers=headers)

    def count(self, url: str) -> int:
        return sum(1 for r in self.requests if str(r.url) == url)


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock()


@pytest.fixture
def provider(clock: FixedClock) -> MockGoogleProvider:
    return MockGoogleProvider(clock, private_key=_KEY)


def _backend(
    recorder: Recorder, clock: FixedClock, **settings: Any
) -> tuple[HttpGoogleBackend, httpx.AsyncClient]:
    client = httpx.AsyncClient(transport=httpx.MockTransport(recorder.handler))
    config = make_settings(
        google_client_id=MOCK_CLIENT_ID, google_client_secret="shh-secret", **settings
    )
    return HttpGoogleBackend(config, clock, client), client


async def test_exchange_posts_the_code_pkce_verifier_and_secret_to_google(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider)
    backend, client = _backend(recorder, clock)
    async with client:
        token = await backend.exchange_code(
            code="c0de", code_verifier="v" * 64, redirect_uri=REDIRECT
        )
    assert token == "the.id.token"
    form = dict(httpx.QueryParams(recorder.requests[0].content.decode()))
    assert form == {
        "grant_type": "authorization_code",
        "code": "c0de",
        "code_verifier": "v" * 64,
        "redirect_uri": REDIRECT,
        "client_id": MOCK_CLIENT_ID,
        "client_secret": "shh-secret",
    }


async def test_exchange_requires_a_configured_client(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider)
    client = httpx.AsyncClient(transport=httpx.MockTransport(recorder.handler))
    backend = HttpGoogleBackend(make_settings(), clock, client)
    async with client:
        with pytest.raises(GoogleBackendError):
            await backend.exchange_code(code="c", code_verifier="v" * 64, redirect_uri=REDIRECT)
    assert recorder.requests == []


@pytest.mark.parametrize(
    ("status", "body"),
    [
        (400, {"error": "invalid_grant"}),
        (500, {"error": "server"}),
        (200, {"access_token": "no id token here"}),
        (200, {"id_token": ""}),
        (200, ["not", "an", "object"]),
    ],
)
async def test_exchange_failures_raise_a_backend_error(
    provider: MockGoogleProvider, clock: FixedClock, status: int, body: Any
) -> None:
    recorder = Recorder(provider)
    recorder.token_status, recorder.token_body = status, body
    backend, client = _backend(recorder, clock)
    async with client:
        with pytest.raises(GoogleBackendError):
            await backend.exchange_code(code="c", code_verifier="v" * 64, redirect_uri=REDIRECT)


async def test_a_network_error_during_exchange_becomes_a_backend_error(
    clock: FixedClock,
) -> None:
    def boom(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("unreachable")

    client = httpx.AsyncClient(transport=httpx.MockTransport(boom))
    backend = HttpGoogleBackend(
        make_settings(google_client_id="id", google_client_secret="s"), clock, client
    )
    async with client:
        with pytest.raises(GoogleBackendError):
            await backend.exchange_code(code="c", code_verifier="v" * 64, redirect_uri=REDIRECT)


async def test_jwks_are_cached_until_the_ttl_expires(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider, cache_control="public, max-age=600")
    backend, client = _backend(recorder, clock)
    async with client:
        await backend.signing_keys()
        await backend.signing_keys()
        assert recorder.count(GOOGLE_JWKS_URL) == 1
        clock.advance(seconds=601)
        await backend.signing_keys()
        assert recorder.count(GOOGLE_JWKS_URL) == 2


async def test_forced_refresh_is_rate_limited(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider)
    backend, client = _backend(recorder, clock)
    async with client:
        await backend.signing_keys()
        await backend.signing_keys(force_refresh=True)
        await backend.signing_keys(force_refresh=True)
        assert recorder.count(GOOGLE_JWKS_URL) == 2  # the second forced call was throttled
        clock.advance(seconds=31)
        await backend.signing_keys(force_refresh=True)
        assert recorder.count(GOOGLE_JWKS_URL) == 3


async def test_stale_keys_are_used_when_a_refresh_fails(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider, cache_control="max-age=60")
    backend, client = _backend(recorder, clock)
    async with client:
        first = await backend.signing_keys()
        recorder.jwks_status = 503
        clock.advance(seconds=120)
        assert await backend.signing_keys() == first


async def test_first_fetch_failure_is_an_error(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider)
    recorder.jwks_status = 500
    backend, client = _backend(recorder, clock)
    async with client:
        with pytest.raises(GoogleBackendError):
            await backend.signing_keys()


async def test_an_empty_key_set_is_an_error(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider)
    recorder.keys = []
    backend, client = _backend(recorder, clock)
    async with client:
        with pytest.raises(GoogleBackendError):
            await backend.signing_keys()


async def test_verifier_with_the_real_backend_accepts_a_good_token_and_rotated_keys(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider)
    backend, client = _backend(recorder, clock)
    async with client:
        verifier = GoogleIdTokenVerifier(backend, client_id=MOCK_CLIENT_ID, clock=clock)
        token = provider.issue_id_token(email="a@example.com", nonce=NONCE)
        claims = await verifier.verify(token, nonce=NONCE)
        assert claims.email == "a@example.com"
        # Google rotates: a token signed with a new kid triggers one forced refresh.
        rotated = MockGoogleProvider(clock, kid="rotated-key", private_key=_KEY)
        recorder.keys = [rotated.jwk()]
        clock.advance(seconds=31)
        new_token = rotated.issue_id_token(email="b@example.com", nonce=NONCE)
        assert (await verifier.verify(new_token, nonce=NONCE)).email == "b@example.com"


def test_jwks_ttl_is_read_from_cache_control_and_clamped() -> None:
    assert jwks_ttl_seconds("public, max-age=19000, must-revalidate") == 19000
    assert jwks_ttl_seconds(None) == 3600
    assert jwks_ttl_seconds("no-store") == 3600
    assert jwks_ttl_seconds("max-age=1") == 60
    assert jwks_ttl_seconds("max-age=99999999") == 86_400


# ---- the mock provider's HTTP endpoints and safety rails --------------------------------------


def _mock_app() -> Any:
    settings = make_settings(google_mock=True, google_redirect_uri=REDIRECT)
    return create_app(settings)


async def test_mock_authorize_redirects_back_with_a_code_and_the_state() -> None:
    app = _mock_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/mock-google/authorize",
            params={
                "redirect_uri": REDIRECT,
                "state": "st4te",
                "nonce": NONCE,
                "email": "dev@example.com",
                "code_challenge": pkce_challenge("v" * 64),
            },
        )
        assert response.status_code == 302
        location = httpx.URL(response.headers["location"])
        assert str(location).startswith(REDIRECT + "?")
        assert location.params["state"] == "st4te"
        code = location.params["code"]

        token = await client.post(
            "/api/v1/mock-google/token",
            data={"code": code, "redirect_uri": REDIRECT, "code_verifier": "v" * 64},
        )
        assert token.status_code == 200 and token.json()["id_token"]
        replay = await client.post(
            "/api/v1/mock-google/token",
            data={"code": code, "redirect_uri": REDIRECT, "code_verifier": "v" * 64},
        )
        assert replay.status_code == 400
        assert replay.json() == {"error": "invalid_grant"}

        jwks = await client.get("/api/v1/mock-google/jwks")
        assert jwks.json()["keys"][0]["kid"]


async def test_mock_authorize_refuses_a_redirect_outside_the_allowlist() -> None:
    app = _mock_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        response = await client.get(
            "/api/v1/mock-google/authorize",
            params={"redirect_uri": "https://evil.example.com", "state": "s", "nonce": NONCE},
        )
    assert response.status_code == 400
    assert "location" not in response.headers


async def test_mock_endpoints_do_not_exist_unless_the_mock_is_enabled() -> None:
    app = create_app(make_settings())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        assert (await client.get("/api/v1/mock-google/jwks")).status_code == 404


def test_the_mock_cannot_be_enabled_in_prod() -> None:
    with pytest.raises(ValidationError, match="GOOGLE_MOCK"):
        make_settings(env="prod", google_mock=True)
