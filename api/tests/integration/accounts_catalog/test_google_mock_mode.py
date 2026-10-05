"""POST /auth/google with the token the web builds in mock mode (GOOGLE_MOCK=1)."""

from collections.abc import AsyncIterator

import httpx
import pytest
from app.core.clock import FixedClock
from app.core.config import Settings
from app.main import create_app

from tests.conftest import make_settings
from tests.integration.accounts_catalog.conftest import bearer
from tests.support.fakes import FakeStorage
from tests.unit.accounts_catalog.test_mock_firebase import CI_PROJECT, web_mock_token

pytestmark = pytest.mark.integration

GOOGLE_URL = "/api/v1/auth/google"


async def _serve(settings: Settings, clock: FixedClock) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(settings, clock=clock, storage=FakeStorage())
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http
    await app.state.background.drain()
    await app.state.engine.dispose()


@pytest.fixture
async def mock_client(db_settings: Settings, clock: FixedClock) -> AsyncIterator[httpx.AsyncClient]:
    settings = make_settings(
        database_url=db_settings.database_url,
        rate_limit_enabled=False,
        google_mock=True,
        firebase_project_id=CI_PROJECT,
    )
    async for client in _serve(settings, clock):
        yield client


@pytest.fixture
async def real_client(db_settings: Settings, clock: FixedClock) -> AsyncIterator[httpx.AsyncClient]:
    settings = make_settings(
        database_url=db_settings.database_url,
        rate_limit_enabled=False,
        firebase_project_id=CI_PROJECT,
    )
    async for client in _serve(settings, clock):
        yield client


async def test_the_web_built_mock_token_signs_in_when_google_mock_is_on(
    mock_client: httpx.AsyncClient, clock: FixedClock
) -> None:
    token = web_mock_token(clock, project=CI_PROJECT, email="dev@example.com")
    response = await mock_client.post(GOOGLE_URL, json={"id_token": token})
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["user"]["email"] == "dev@example.com"
    assert data["user"]["auth_methods"] == ["google"]
    me = await mock_client.get("/api/v1/users/me", headers=bearer(data["access_token"]))
    assert me.status_code == 200


async def test_the_same_token_is_refused_without_google_mock(
    real_client: httpx.AsyncClient, clock: FixedClock
) -> None:
    token = web_mock_token(clock, project=CI_PROJECT)
    response = await real_client.post(GOOGLE_URL, json={"id_token": token})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "google_auth_failed"
