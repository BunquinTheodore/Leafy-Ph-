"""Fixtures for the account, email, Google, catalog and seed tests."""

from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

import httpx
import pytest
from app.core.clock import FixedClock
from app.core.config import Settings
from app.main import create_app
from app.services.infra.google_mock import MOCK_CLIENT_ID, MockGoogleProvider
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI

from tests.conftest import make_settings
from tests.support.fakes import FakeEmailSender, FakeStorage

GOOGLE_REDIRECT = "http://localhost:3000/api/auth/google/callback"
PASSWORD = "a calm green forest"
NONCE = "n" * 24
VERIFIER = "v" * 64

Settle = Callable[[], Awaitable[None]]

_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def rate_limit_enabled() -> bool:
    return False


@pytest.fixture
def app_settings(db_settings: Settings, rate_limit_enabled: bool) -> Settings:
    return make_settings(
        database_url=db_settings.database_url,
        rate_limit_enabled=rate_limit_enabled,
        google_client_id=MOCK_CLIENT_ID,
        google_client_secret="not-a-real-secret",
        google_redirect_uri=GOOGLE_REDIRECT,
        app_origin="https://leafy.test",
    )


@pytest.fixture
def outbox() -> FakeEmailSender:
    return FakeEmailSender()


@pytest.fixture
def storage() -> FakeStorage:
    return FakeStorage()


@pytest.fixture
def google(clock: FixedClock) -> MockGoogleProvider:
    return MockGoogleProvider(clock, private_key=_KEY)


@pytest.fixture
async def app(
    app_settings: Settings,
    clock: FixedClock,
    outbox: FakeEmailSender,
    storage: FakeStorage,
    google: MockGoogleProvider,
) -> AsyncIterator[FastAPI]:
    application = create_app(
        app_settings,
        clock=clock,
        email_sender=outbox,
        storage=storage,
        google_backend=google,
    )
    yield application
    await application.state.background.drain()
    await application.state.engine.dispose()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


@pytest.fixture
def settle(app: FastAPI) -> Settle:
    """Wait for background work (emails, storage purge) started by earlier requests."""
    drain: Settle = app.state.background.drain
    return drain


def bearer(token: object) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def register(
    client: httpx.AsyncClient, email: str = "leaf@example.com", password: str = PASSWORD
) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "first_name": "Leaf", "last_name": "Fan"},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]  # type: ignore[no-any-return]


async def google_login(
    client: httpx.AsyncClient,
    google: MockGoogleProvider,
    email: str = "gina@example.com",
    **claims: Any,
) -> httpx.Response:
    """Run the browser legs against the mock, then call POST /auth/google."""
    from app.services.infra.google_mock import pkce_challenge

    code = google.create_code(
        email=email,
        nonce=NONCE,
        code_challenge=pkce_challenge(VERIFIER),
        redirect_uri=GOOGLE_REDIRECT,
        **claims,
    )
    return await client.post(
        "/api/v1/auth/google",
        json={
            "code": code,
            "code_verifier": VERIFIER,
            "nonce": NONCE,
            "redirect_uri": GOOGLE_REDIRECT,
        },
    )
