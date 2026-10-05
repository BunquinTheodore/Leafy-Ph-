"""HttpGoogleBackend (certificate cache), the verifier, the mock endpoint and the prod rails."""

import asyncio
from typing import Any

import httpx
import pytest
from app.core.clock import FixedClock
from app.core.config import Settings
from app.main import create_app
from app.services.google_auth_service import FirebaseIdTokenVerifier
from app.services.infra.google_client import (
    FIREBASE_CERTS_URL,
    GoogleBackendError,
    HttpGoogleBackend,
    certs_ttl_seconds,
)
from app.services.infra.google_mock import (
    MOCK_PROJECT_ID,
    MockFirebaseBackend,
    MockGoogleProvider,
)
from cryptography.hazmat.primitives.asymmetric import rsa
from pydantic import ValidationError

from tests.conftest import make_settings

_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class Recorder:
    """An httpx transport that records requests and answers with a script."""

    def __init__(self, provider: MockGoogleProvider, *, cache_control: str | None = None) -> None:
        self.requests: list[httpx.Request] = []
        self.provider = provider
        self.cache_control = cache_control
        self.status = 200
        self.certs: Any = None

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        assert str(request.url) == FIREBASE_CERTS_URL
        headers = {"cache-control": self.cache_control} if self.cache_control else {}
        body = self.certs
        if body is None:
            body = {self.provider.kid: self.provider.certificate_pem()}
        return httpx.Response(self.status, json=body, headers=headers)

    @property
    def fetches(self) -> int:
        return len(self.requests)


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock()


@pytest.fixture
def provider(clock: FixedClock) -> MockGoogleProvider:
    return MockGoogleProvider(clock, private_key=_KEY)


def _backend(recorder: Recorder, clock: FixedClock) -> tuple[HttpGoogleBackend, httpx.AsyncClient]:
    client = httpx.AsyncClient(transport=httpx.MockTransport(recorder.handler))
    return HttpGoogleBackend(clock, client), client


async def test_certificates_are_fetched_from_the_securetoken_endpoint_without_credentials(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider)
    backend, client = _backend(recorder, clock)
    async with client:
        keys = await backend.signing_keys()
    assert list(keys) == [provider.kid]
    request = recorder.requests[0]
    assert request.method == "GET"
    assert "authorization" not in request.headers
    assert request.url.query == b""


async def test_certificates_are_cached_for_the_max_age_then_refetched(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider, cache_control="public, max-age=600, must-revalidate")
    backend, client = _backend(recorder, clock)
    async with client:
        await backend.signing_keys()
        clock.advance(seconds=599)
        await backend.signing_keys()
        assert recorder.fetches == 1
        clock.advance(seconds=2)
        await backend.signing_keys()
        assert recorder.fetches == 2


async def test_forced_refresh_is_rate_limited(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider)
    backend, client = _backend(recorder, clock)
    async with client:
        await backend.signing_keys()
        await backend.signing_keys(force_refresh=True)
        await backend.signing_keys(force_refresh=True)
        assert recorder.fetches == 2  # the second forced call was throttled
        clock.advance(seconds=31)
        await backend.signing_keys(force_refresh=True)
        assert recorder.fetches == 3


async def test_stale_certificates_are_used_when_a_refresh_fails(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider, cache_control="max-age=60")
    backend, client = _backend(recorder, clock)
    async with client:
        first = await backend.signing_keys()
        recorder.status = 503
        clock.advance(seconds=120)
        assert await backend.signing_keys() == first


async def test_first_fetch_failure_is_an_error(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider)
    recorder.status = 500
    backend, client = _backend(recorder, clock)
    async with client:
        with pytest.raises(GoogleBackendError):
            await backend.signing_keys()


async def test_a_network_error_on_first_fetch_is_a_backend_error(clock: FixedClock) -> None:
    def boom(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("unreachable")

    client = httpx.AsyncClient(transport=httpx.MockTransport(boom))
    async with client:
        with pytest.raises(GoogleBackendError):
            await HttpGoogleBackend(clock, client).signing_keys()


@pytest.mark.parametrize("body", [{}, [], {"kid": "not a certificate"}, {"kid": 5}])
async def test_a_response_without_usable_certificates_is_an_error(
    provider: MockGoogleProvider, clock: FixedClock, body: Any
) -> None:
    recorder = Recorder(provider)
    recorder.certs = body
    backend, client = _backend(recorder, clock)
    async with client:
        with pytest.raises(GoogleBackendError):
            await backend.signing_keys()


async def test_unreadable_certificates_are_skipped_but_good_ones_kept(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider)
    recorder.certs = {"bad": "garbage", provider.kid: provider.certificate_pem()}
    backend, client = _backend(recorder, clock)
    async with client:
        assert list(await backend.signing_keys()) == [provider.kid]


async def test_verifier_with_the_real_backend_accepts_a_good_token(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    backend, client = _backend(Recorder(provider), clock)
    async with client:
        verifier = FirebaseIdTokenVerifier(backend, project_id=MOCK_PROJECT_ID, clock=clock)
        claims = await verifier.verify(provider.issue_id_token(email="A@Example.com"))
    assert claims.email == "a@example.com"
    assert claims.sub.startswith("mock-")


async def test_a_new_kid_after_key_rotation_triggers_a_forced_refresh(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider)
    backend, client = _backend(recorder, clock)
    async with client:
        verifier = FirebaseIdTokenVerifier(backend, project_id=MOCK_PROJECT_ID, clock=clock)
        await verifier.verify(provider.issue_id_token(email="a@example.com"))
        assert recorder.fetches == 1
        rotated = MockGoogleProvider(clock, kid="rotated-key", private_key=_OTHER_KEY)
        recorder.certs = {
            provider.kid: provider.certificate_pem(),
            rotated.kid: rotated.certificate_pem(),
        }
        clock.advance(seconds=31)
        claims = await verifier.verify(rotated.issue_id_token(email="b@example.com"))
    assert claims.email == "b@example.com"
    assert recorder.fetches == 2


async def test_a_token_with_a_kid_nobody_publishes_is_refused_after_one_refresh(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    from app.core.errors import AppError

    recorder = Recorder(provider)
    backend, client = _backend(recorder, clock)
    async with client:
        verifier = FirebaseIdTokenVerifier(backend, project_id=MOCK_PROJECT_ID, clock=clock)
        with pytest.raises(AppError) as caught:
            await verifier.verify(provider.issue_id_token(email="a@example.com", kid="ghost"))
    assert caught.value.code.value == "google_auth_failed"
    assert recorder.fetches == 2  # the first lookup, then one forced refresh


async def test_certificates_that_cannot_be_fetched_refuse_the_token(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    from app.core.errors import AppError

    recorder = Recorder(provider)
    recorder.status = 500
    backend, client = _backend(recorder, clock)
    async with client:
        verifier = FirebaseIdTokenVerifier(backend, project_id=MOCK_PROJECT_ID, clock=clock)
        with pytest.raises(AppError) as caught:
            await verifier.verify(provider.issue_id_token(email="a@example.com"))
    assert caught.value.code.value == "service_unavailable"
    assert caught.value.status_code == 503


async def test_a_failed_refresh_is_not_retried_on_every_call(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider, cache_control="max-age=60")
    backend, client = _backend(recorder, clock)
    async with client:
        await backend.signing_keys()
        recorder.status = 503
        clock.advance(seconds=120)
        for _ in range(5):
            await backend.signing_keys()
            await backend.signing_keys(force_refresh=True)
        assert recorder.fetches == 2  # one good fetch, one failed refresh, then a back off
        clock.advance(seconds=61)
        await backend.signing_keys()
        assert recorder.fetches == 3


async def test_a_failed_first_fetch_backs_off_too(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider)
    recorder.status = 500
    backend, client = _backend(recorder, clock)
    async with client:
        for _ in range(3):
            with pytest.raises(GoogleBackendError):
                await backend.signing_keys()
        assert recorder.fetches == 1
        recorder.status = 200
        clock.advance(seconds=61)
        assert list(await backend.signing_keys()) == [provider.kid]


async def test_certificates_are_dropped_after_the_maximum_stale_age(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider, cache_control="max-age=60")
    backend, client = _backend(recorder, clock)
    async with client:
        await backend.signing_keys()
        recorder.status = 503
        clock.advance(hours=23)
        assert list(await backend.signing_keys()) == [provider.kid]
        clock.advance(hours=2)
        with pytest.raises(GoogleBackendError):
            await backend.signing_keys()


async def test_concurrent_lookups_share_one_fetch(
    provider: MockGoogleProvider, clock: FixedClock
) -> None:
    recorder = Recorder(provider)
    backend, client = _backend(recorder, clock)
    async with client:
        await asyncio.gather(*(backend.signing_keys() for _ in range(8)))
    assert recorder.fetches == 1


def test_certificate_ttl_is_read_from_cache_control_and_clamped() -> None:
    assert certs_ttl_seconds("public, max-age=19000, must-revalidate") == 19000
    assert certs_ttl_seconds(None) == 3600
    assert certs_ttl_seconds("no-store") == 3600
    assert certs_ttl_seconds("max-age=1") == 60
    assert certs_ttl_seconds("max-age=99999999") == 86_400


# ---- the mock provider's HTTP face and the safety rails ----------------------------------------


async def test_mock_audience_follows_the_configured_firebase_project() -> None:
    app = create_app(make_settings(google_mock=True, firebase_project_id="leafy-8ecd6"))
    assert app.state.google_backend.project_id == "leafy-8ecd6"
    default = create_app(make_settings(google_mock=True))
    assert default.state.google_backend.project_id == MOCK_PROJECT_ID


async def test_mock_endpoints_do_not_exist_unless_the_mock_is_enabled() -> None:
    app = create_app(make_settings())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        assert (await client.post("/api/v1/mock-google/id-token", json={})).status_code == 404


def test_the_mock_cannot_be_enabled_in_prod() -> None:
    with pytest.raises(ValidationError, match="GOOGLE_MOCK"):
        make_settings(env="prod", google_mock=True)


def test_a_mock_backend_cannot_be_injected_in_prod(clock: FixedClock) -> None:
    with pytest.raises(ValueError, match="mock Google provider"):
        create_app(make_settings(env="prod"), google_backend=MockGoogleProvider(clock))
    with pytest.raises(ValueError, match="mock Google provider"):
        create_app(make_settings(env="prod"), google_backend=MockFirebaseBackend())


def test_the_firebase_project_id_is_trimmed_and_defaults_to_disabled() -> None:
    assert make_settings().firebase_project_id == ""
    assert make_settings(firebase_project_id="  leafy-8ecd6 ").firebase_project_id == "leafy-8ecd6"


def test_the_mock_needs_an_explicit_insecure_mocks_opt_in() -> None:
    with pytest.raises(ValidationError, match="ALLOW_INSECURE_MOCKS"):
        make_settings(google_mock=True, allow_insecure_mocks=False)
    with pytest.raises(ValidationError, match="ALLOW_INSECURE_MOCKS"):
        make_settings(env="dev", google_mock=True, allow_insecure_mocks=False)


def test_the_mock_is_refused_outside_dev_and_test_even_with_the_opt_in() -> None:
    with pytest.raises(ValidationError):
        make_settings(env="prod", google_mock=True, allow_insecure_mocks=True)
    with pytest.raises(ValidationError):
        Settings.model_validate({**make_settings().model_dump(), "env": "staging"})


def test_a_mock_backend_cannot_be_injected_without_the_opt_in(clock: FixedClock) -> None:
    with pytest.raises(ValueError, match="mock Google provider"):
        create_app(
            make_settings(allow_insecure_mocks=False), google_backend=MockGoogleProvider(clock)
        )


def test_the_fresh_session_window_cannot_exceed_ten_minutes() -> None:
    assert make_settings(fresh_session_seconds=600).fresh_session_seconds == 600
    with pytest.raises(ValidationError):
        make_settings(fresh_session_seconds=601)
