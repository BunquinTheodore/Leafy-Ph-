"""Alembic environment (async). The URL comes from config.attributes['url'] or DATABASE_URL."""

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor

import app.db.models  # noqa: F401  (registers every table on Base.metadata)
from alembic import context
from app.db.base import Base
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

config = context.config
target_metadata = Base.metadata


def _database_url() -> str:
    url = config.attributes.get("url") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return str(url)


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def _run_sync(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(_database_url(), poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(_run_sync)
    await engine.dispose()


def _run_online_in_fresh_loop() -> None:
    """asyncio.run needs a thread without a running loop (callers may be inside one)."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(run_migrations_online())
        return
    with ThreadPoolExecutor(max_workers=1) as pool:
        pool.submit(asyncio.run, run_migrations_online()).result()


if context.is_offline_mode():
    run_migrations_offline()
else:
    _run_online_in_fresh_loop()
