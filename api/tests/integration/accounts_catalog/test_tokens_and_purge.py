"""Atomic single use of email tokens and safe concurrent draining of the storage outbox."""

import asyncio
import uuid

import pytest
from app.core.clock import FixedClock
from app.core.config import Settings
from app.core.errors import AppError
from app.db.models import AuthTokenType
from app.db.uow import UnitOfWork
from app.services.email_token_service import EmailTokenService
from app.services.purge_service import PurgeService
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from tests.integration.conftest import insert_user
from tests.support.fakes import FakeStorage

pytestmark = pytest.mark.integration

Factory = async_sessionmaker[AsyncSession]


async def test_a_token_can_be_consumed_exactly_once_under_concurrency(
    session_factory: Factory, db_settings: Settings, clock: FixedClock
) -> None:
    user = await insert_user(session_factory)
    async with UnitOfWork(session_factory) as uow:
        raw = await EmailTokenService(uow, db_settings, clock).issue(
            user.id, AuthTokenType.RESET_PASSWORD
        )
        await uow.commit()

    async def attempt() -> uuid.UUID | None:
        async with UnitOfWork(session_factory) as uow:
            try:
                user_id = await EmailTokenService(uow, db_settings, clock).consume(
                    raw, AuthTokenType.RESET_PASSWORD
                )
            except AppError:
                return None
            await uow.commit()
            return user_id

    results = await asyncio.gather(*(attempt() for _ in range(6)))
    assert [r for r in results if r is not None] == [user.id]


async def test_a_rolled_back_consume_leaves_the_token_usable(
    session_factory: Factory, db_settings: Settings, clock: FixedClock
) -> None:
    user = await insert_user(session_factory)
    async with UnitOfWork(session_factory) as uow:
        service = EmailTokenService(uow, db_settings, clock)
        raw = await service.issue(user.id, AuthTokenType.VERIFY_EMAIL)
        await uow.commit()
    async with UnitOfWork(session_factory) as uow:
        await EmailTokenService(uow, db_settings, clock).consume(raw, AuthTokenType.VERIFY_EMAIL)
        await uow.rollback()
    async with UnitOfWork(session_factory) as uow:
        found = await EmailTokenService(uow, db_settings, clock).consume(
            raw, AuthTokenType.VERIFY_EMAIL
        )
        assert found == user.id


async def test_oversized_and_empty_tokens_are_rejected_without_a_query(
    session_factory: Factory, db_settings: Settings, clock: FixedClock
) -> None:
    async with UnitOfWork(session_factory) as uow:
        service = EmailTokenService(uow, db_settings, clock)
        for bad in ("", "x" * 513):
            with pytest.raises(AppError) as raised:
                await service.consume(bad, AuthTokenType.VERIFY_EMAIL)
            assert raised.value.code.value == "token_invalid_or_expired"


async def test_concurrent_drains_never_delete_the_same_row_twice(
    session_factory: Factory, engine: AsyncEngine, clock: FixedClock
) -> None:
    storage = FakeStorage()
    keys = [f"u/{i}.jpg" for i in range(40)]
    for key in keys:
        storage.objects[("leafy-scans", key)] = b"x"
    async with UnitOfWork(session_factory) as uow:
        await uow.storage_outbox.enqueue(bucket="leafy-scans", keys=keys, due_at=clock.now())
        await uow.commit()

    purge = PurgeService(session_factory, storage, clock)
    results = await asyncio.gather(*(purge.drain(batch_size=10) for _ in range(6)))
    total = sum(r.deleted for r in results)
    # Whatever the interleaving, nothing is deleted twice and the rest is picked up next.
    assert total + (await purge.drain_all(batch_size=10)).deleted == 40
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT count(*) FROM storage_deletion"))).scalar_one() == 0
    assert storage.objects == {}


async def test_rows_not_yet_due_are_left_alone(session_factory: Factory, clock: FixedClock) -> None:
    storage = FakeStorage()
    async with UnitOfWork(session_factory) as uow:
        future = clock.now().replace(year=2027)
        await uow.storage_outbox.enqueue(bucket="leafy-scans", keys=["later.jpg"], due_at=future)
        await uow.commit()
    result = await PurgeService(session_factory, storage, clock).drain()
    assert (result.deleted, result.failed) == (0, 0)
    assert storage.delete_calls == 0


async def test_a_partial_s3_failure_retries_only_the_failed_keys(
    session_factory: Factory, engine: AsyncEngine, clock: FixedClock
) -> None:
    class PartialStorage(FakeStorage):
        async def delete_objects(self, bucket: str, keys: list[str]) -> list[str]:  # type: ignore[override]
            self.delete_calls += 1
            return [key for key in keys if key == "stuck.jpg"]

    storage = PartialStorage()
    async with UnitOfWork(session_factory) as uow:
        await uow.storage_outbox.enqueue(
            bucket="leafy-scans", keys=["ok.jpg", "stuck.jpg"], due_at=clock.now()
        )
        await uow.commit()
    result = await PurgeService(session_factory, storage, clock).drain()
    assert (result.deleted, result.failed) == (1, 1)
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text("SELECT object_key, attempts, last_error FROM storage_deletion")
            )
        ).all()
    assert rows == [("stuck.jpg", 1, "storage delete failed")]
