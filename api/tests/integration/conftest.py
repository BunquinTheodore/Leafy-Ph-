"""Integration fixtures: a temporary Postgres (pytest-postgresql) migrated with Alembic.

Set PG_CTL_PATH to the full path of pg_ctl when it is not discoverable. On Windows it falls back
to the default PostgreSQL 17 install location. CI (Linux) uses the service container or PATH.
"""

import os
from collections.abc import AsyncIterator, Callable, Iterator
from pathlib import Path
from typing import Any

import httpx
import psycopg
import pytest
from alembic import command
from alembic.config import Config
from app.core.clock import FixedClock
from app.core.config import Settings
from app.core.security import PasswordService
from app.db.models import Disease, Plant, User
from app.db.session import create_engine, create_session_factory
from app.db.uow import UnitOfWork
from app.main import create_app
from pytest_postgresql import factories
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from tests.conftest import make_settings

_WINDOWS_DEFAULT = Path(r"C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe")
API_DIR = Path(__file__).resolve().parents[2]
MIGRATED_DB = "leafy_test"


def _pg_ctl_kwargs() -> dict[str, str]:
    explicit = os.environ.get("PG_CTL_PATH")
    if explicit:
        return {"executable": explicit}
    if os.name == "nt" and _WINDOWS_DEFAULT.exists():
        return {"executable": str(_WINDOWS_DEFAULT)}
    return {}


pg_proc = factories.postgresql_proc(
    port=None, password="throwaway-test-password", **_pg_ctl_kwargs()
)
pg = factories.postgresql("pg_proc")


def alembic_config(url: str) -> Config:
    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(API_DIR / "app" / "db" / "migrations"))
    config.set_main_option("path_separator", "os")
    config.attributes["url"] = url
    return config


def create_database(proc: Any, name: str) -> str:
    """Create an empty database on the temporary server and return its asyncpg URL."""
    with psycopg.connect(
        host=proc.host,
        port=proc.port,
        user=proc.user,
        password=proc.password,
        dbname="postgres",
        autocommit=True,
    ) as conn:
        conn.execute(f'CREATE DATABASE "{name}"')
    return f"postgresql+asyncpg://{proc.user}:{proc.password}@{proc.host}:{proc.port}/{name}"


def sync_dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


@pytest.fixture(scope="session")
def migrated_database_url(pg_proc: Any) -> str:
    url = create_database(pg_proc, MIGRATED_DB)
    command.upgrade(alembic_config(url), "head")
    return url


@pytest.fixture(scope="session")
def fresh_database_factory(pg_proc: Any) -> Callable[[str], str]:
    return lambda name: create_database(pg_proc, name)


@pytest.fixture
def database_url(migrated_database_url: str) -> Iterator[str]:
    """The migrated database, emptied before every test."""
    with psycopg.connect(sync_dsn(migrated_database_url), autocommit=True) as conn:
        conn.execute("TRUNCATE users, plant, storage_deletion RESTART IDENTITY CASCADE")
    yield migrated_database_url


@pytest.fixture
def db_settings(database_url: str) -> Settings:
    return make_settings(database_url=database_url)


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock()


@pytest.fixture
async def engine(database_url: str) -> AsyncIterator[AsyncEngine]:
    created = create_engine(database_url, null_pool=True)
    yield created
    await created.dispose()


@pytest.fixture
def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return create_session_factory(engine)


@pytest.fixture
def passwords(db_settings: Settings) -> PasswordService:
    return PasswordService(
        db_settings.argon2_time_cost, db_settings.argon2_memory_kib, db_settings.argon2_parallelism
    )


@pytest.fixture
async def session(session_factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    async with session_factory() as active:
        yield active


@pytest.fixture
async def client(db_settings: Settings, clock: FixedClock) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(db_settings, clock=clock)
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http
    await app.state.engine.dispose()


async def insert_user(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    email: str = "leaf@example.com",
    password_hash: str | None = "hash",  # noqa: S107
) -> User:
    async with UnitOfWork(session_factory) as uow:
        user = await uow.users.create(
            email=email, password_hash=password_hash, first_name="Leaf", last_name="Fan"
        )
        await uow.commit()
        return user


async def insert_catalog(session: AsyncSession) -> dict[str, Any]:
    """Two plants with one disease each, so cross pairing can be tested."""
    tomato = Plant(slug="tomato", common_name="Tomato")
    potato = Plant(slug="potato", common_name="Potato")
    session.add_all([tomato, potato])
    await session.flush()
    early_blight = Disease(plant_id=tomato.id, slug="early-blight", name="Early Blight")
    late_blight = Disease(plant_id=potato.id, slug="late-blight", name="Late Blight")
    session.add_all([early_blight, late_blight])
    await session.commit()
    return {
        "tomato": tomato,
        "potato": potato,
        "early_blight": early_blight,
        "late_blight": late_blight,
    }
