"""Fixtures for the account, Google, catalog and seed tests."""

from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

import httpx
import pytest
from app.core.clock import FixedClock
from app.core.config import Settings
from app.main import create_app
from app.services.infra.google_mock import MOCK_PROJECT_ID, MockGoogleProvider
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI

from tests.conftest import make_settings
from tests.support.fakes import FakeStorage

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
def firebase_project_id() -> str:
    return MOCK_PROJECT_ID


@pytest.fixture
def app_settings(
    db_settings: Settings, rate_limit_enabled: bool, firebase_project_id: str
) -> Settings:
    return make_settings(
        database_url=db_settings.database_url,
        rate_limit_enabled=rate_limit_enabled,
        firebase_project_id=firebase_project_id,
    )


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
    storage: FakeStorage,
    google: MockGoogleProvider,
) -> AsyncIterator[FastAPI]:
    application = create_app(
        app_settings,
        clock=clock,
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
    """Wait for background work (storage purge) started by earlier requests."""
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
    """Sign a Firebase ID token with the mock key, then call POST /auth/google."""
    token = google.issue_id_token(email=email, **claims)
    return await client.post("/api/v1/auth/google", json={"id_token": token})
