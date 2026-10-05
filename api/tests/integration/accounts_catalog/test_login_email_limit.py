"""Spreading wrong guesses across many IPs does not get around the per account login limit."""

import httpx
import pytest
from app.controllers.auth_controller import LOGIN_EMAIL_LIMIT
from app.core.config import Settings

from tests.conftest import make_settings
from tests.integration.accounts_catalog.conftest import register

pytestmark = pytest.mark.integration

LOGIN_URL = "/api/v1/auth/login"


@pytest.fixture
def rate_limit_enabled() -> bool:
    return True


@pytest.fixture
def app_settings(db_settings: Settings, firebase_project_id: str) -> Settings:
    return make_settings(
        database_url=db_settings.database_url,
        rate_limit_enabled=True,
        trusted_proxy_hops=1,
        firebase_project_id=firebase_project_id,
    )


async def _guess(client: httpx.AsyncClient, ip: str, email: str) -> httpx.Response:
    return await client.post(
        LOGIN_URL,
        json={"email": email, "password": "wrong guess entirely"},
        headers={"x-forwarded-for": ip},
    )


async def test_guesses_from_many_ips_are_capped_per_email(client: httpx.AsyncClient) -> None:
    await register(client, email="victim@example.com")
    for index in range(LOGIN_EMAIL_LIMIT):
        refused = await _guess(client, f"10.0.{index // 250}.{index % 250}", "victim@example.com")
        assert refused.status_code == 401
    blocked = await _guess(client, "10.9.9.9", "Victim@Example.com")
    assert blocked.status_code == 429


async def test_other_accounts_are_not_affected(client: httpx.AsyncClient) -> None:
    for index in range(LOGIN_EMAIL_LIMIT + 1):
        await _guess(client, f"10.1.0.{index}", "victim@example.com")
    other = await _guess(client, "10.2.0.1", "someone-else@example.com")
    assert other.status_code == 401
