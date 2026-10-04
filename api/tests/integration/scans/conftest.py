"""Fixtures for the scans API: an app with fake storage and a scriptable ML service."""

from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

import httpx
import pytest
from app.core.clock import FixedClock
from app.core.config import Settings
from app.db.models import Disease, Plant
from app.main import create_app
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from tests.conftest import make_settings
from tests.integration.accounts_catalog.conftest import PASSWORD, bearer
from tests.support.fakes import FakeEmailSender, FakeStorage
from tests.support.images import make_image
from tests.support.ml_fakes import ScriptedML

Settle = Callable[[], Awaitable[None]]
SCANS = "/api/v1/scans"


@pytest.fixture
def scan_quota() -> int:
    return 500


@pytest.fixture
def rate_limit_enabled() -> bool:
    return False


@pytest.fixture
def ml_timeout() -> float:
    return 5.0


@pytest.fixture
def app_settings(
    db_settings: Settings, scan_quota: int, rate_limit_enabled: bool, ml_timeout: float
) -> Settings:
    return make_settings(
        database_url=db_settings.database_url,
        rate_limit_enabled=rate_limit_enabled,
        app_origin="https://leafy.test",
        scan_quota=scan_quota,
        ml_timeout=ml_timeout,
        scan_stuck_seconds=300,
    )


@pytest.fixture
def storage() -> FakeStorage:
    return FakeStorage()


@pytest.fixture
def ml() -> ScriptedML:
    return ScriptedML()


@pytest.fixture
async def app(
    app_settings: Settings, clock: FixedClock, storage: FakeStorage, ml: ScriptedML
) -> AsyncIterator[FastAPI]:
    application = create_app(
        app_settings,
        clock=clock,
        email_sender=FakeEmailSender(),
        storage=storage,
        ml_service=ml,
    )
    yield application
    await application.state.scan_queue.close()
    await application.state.background.drain()
    await application.state.engine.dispose()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


@pytest.fixture
async def settle(app: FastAPI) -> Settle:
    async def _settle() -> None:
        await app.state.scan_queue.drain()
        await app.state.background.drain()

    return _settle


@pytest.fixture
async def catalog(session_factory: async_sessionmaker[AsyncSession]) -> dict[str, Any]:
    async with session_factory() as session:
        tomato = Plant(slug="tomato", common_name="Tomato")
        potato = Plant(slug="potato", common_name="Potato")
        session.add_all([tomato, potato])
        await session.flush()
        early = Disease(plant_id=tomato.id, slug="early-blight", name="Early Blight")
        late = Disease(plant_id=potato.id, slug="late-blight", name="Late Blight")
        session.add_all([early, late])
        await session.commit()
        return {"tomato": tomato.id, "potato": potato.id, "early": early.id, "late": late.id}


async def sign_up(
    client: httpx.AsyncClient, engine: AsyncEngine, email: str, *, verified: bool = True
) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": PASSWORD, "first_name": "Leaf", "last_name": "Fan"},
    )
    assert response.status_code == 201, response.text
    data = response.json()["data"]
    if verified:
        async with engine.begin() as conn:
            await conn.execute(
                text("UPDATE users SET email_verified_at = now() WHERE email = :e"), {"e": email}
            )
    return bearer(data["access_token"])


@pytest.fixture
async def auth(
    client: httpx.AsyncClient, engine: AsyncEngine, catalog: dict[str, Any]
) -> dict[str, str]:
    return await sign_up(client, engine, "leaf@example.com")


@pytest.fixture
async def other_auth(
    client: httpx.AsyncClient, engine: AsyncEngine, catalog: dict[str, Any]
) -> dict[str, str]:
    return await sign_up(client, engine, "other@example.com")


async def upload(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    data: bytes | None = None,
    name: str = "leaf.jpg",
) -> httpx.Response:
    payload = data if data is not None else make_image()
    return await client.post(
        SCANS, headers=headers, files={"image": (name, payload, "application/octet-stream")}
    )


async def upload_and_settle(
    client: httpx.AsyncClient, headers: dict[str, str], settle: Settle, data: bytes | None = None
) -> str:
    response = await upload(client, headers, data)
    assert response.status_code == 202, response.text
    await settle()
    return str(response.json()["data"]["id"])


async def get_scan(client: httpx.AsyncClient, headers: dict[str, str], scan_id: str) -> Any:
    response = await client.get(f"{SCANS}/{scan_id}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]
