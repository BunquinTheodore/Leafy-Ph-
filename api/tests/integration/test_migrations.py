from collections.abc import Callable

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from app.db.base import Base
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from tests.integration.conftest import alembic_config

pytestmark = pytest.mark.integration

EXPECTED_TABLES = {
    "alembic_version",
    "auth_token",
    "disease",
    "disease_affected_species",
    "disease_entry",
    "disease_image",
    "oauth_identity",
    "plant",
    "refresh_token",
    "scan",
    "scan_feedback",
    "storage_deletion",
    "users",
}


async def _tables(engine: AsyncEngine) -> set[str]:
    async with engine.connect() as conn:
        rows = await conn.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        )
        return {row[0] for row in rows}


async def _enum_types(engine: AsyncEngine) -> set[str]:
    async with engine.connect() as conn:
        rows = await conn.execute(text("SELECT typname FROM pg_type WHERE typtype = 'e'"))
        return {row[0] for row in rows}


async def test_upgrade_then_downgrade_then_upgrade(
    fresh_database_factory: Callable[[str], str],
) -> None:
    url = fresh_database_factory("leafy_migrations")
    config = alembic_config(url)
    engine = create_async_engine(url)
    try:
        command.upgrade(config, "head")
        assert await _tables(engine) == EXPECTED_TABLES
        assert {"scan_status", "scan_verdict", "oauth_provider"} <= await _enum_types(engine)

        command.downgrade(config, "base")
        assert await _tables(engine) == {"alembic_version"}
        assert await _enum_types(engine) == set()

        command.upgrade(config, "head")
        assert await _tables(engine) == EXPECTED_TABLES
    finally:
        await engine.dispose()


async def test_extensions_and_trigram_indexes_exist(engine: AsyncEngine) -> None:
    async with engine.connect() as conn:
        extensions = {
            row[0] for row in await conn.execute(text("SELECT extname FROM pg_extension"))
        }
        indexes = {
            row[0]
            for row in await conn.execute(
                text("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")
            )
        }
    assert {"citext", "pg_trgm"} <= extensions
    assert {
        "ix_plant_common_name_trgm",
        "ix_disease_name_trgm",
        "ix_scan_user_created_id",
    } <= indexes


async def test_migration_matches_models(engine: AsyncEngine) -> None:
    """Autogenerate finds no difference between the migrated schema and the ORM models."""

    def diff(connection: object) -> list[object]:
        context = MigrationContext.configure(connection, opts={"compare_type": True})  # type: ignore[arg-type]
        return list(compare_metadata(context, Base.metadata))

    async with engine.connect() as conn:
        differences = await conn.run_sync(diff)
    assert differences == []
