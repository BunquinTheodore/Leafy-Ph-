import asyncio
import uuid
from datetime import timedelta

import pytest
from app.core.clock import FixedClock
from app.core.config import Settings
from app.core.context import RequestContext
from app.core.errors import AppError, ErrorCode
from app.core.security import sha256_hex
from app.db.models import RefreshToken
from app.db.uow import UnitOfWork
from app.services.token_service import IssuedSession, RefreshResult, TokenService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.integration.conftest import insert_user

pytestmark = pytest.mark.integration

CTX = RequestContext(request_id="req-1", ip="203.0.113.9", user_agent="pytest")
SessionFactory = async_sessionmaker[AsyncSession]


class Harness:
    def __init__(self, factory: SessionFactory, settings: Settings, clock: FixedClock) -> None:
        self.factory = factory
        self.settings = settings
        self.clock = clock

    async def issue(self, user_id: uuid.UUID) -> IssuedSession:
        async with UnitOfWork(self.factory) as uow:
            session = await TokenService(uow, self.settings, self.clock).issue_session(user_id, CTX)
            await uow.commit()
            return session

    async def refresh(self, raw: str) -> RefreshResult:
        async with UnitOfWork(self.factory) as uow:
            return await TokenService(uow, self.settings, self.clock).refresh(raw, CTX)

    async def logout(self, raw: str) -> None:
        async with UnitOfWork(self.factory) as uow:
            await TokenService(uow, self.settings, self.clock).revoke_by_token(raw)

    async def rows(self) -> list[RefreshToken]:
        async with self.factory() as session:
            result = await session.execute(select(RefreshToken).order_by(RefreshToken.created_at))
            return list(result.scalars().all())


@pytest.fixture
async def harness(
    session_factory: SessionFactory, db_settings: Settings, clock: FixedClock
) -> Harness:
    return Harness(session_factory, db_settings, clock)


@pytest.fixture
async def user_id(session_factory: SessionFactory) -> uuid.UUID:
    return (await insert_user(session_factory)).id


async def test_issue_stores_only_the_hash(harness: Harness, user_id: uuid.UUID) -> None:
    issued = await harness.issue(user_id)
    (row,) = await harness.rows()
    assert row.token_hash == sha256_hex(issued.refresh_token)
    assert issued.refresh_token not in row.token_hash
    assert row.ip == "203.0.113.9"
    assert row.family_expires_at - harness.clock.now() == timedelta(days=90)
    assert issued.refresh_expires_at == harness.clock.now() + timedelta(days=30)


async def test_rotation_happy_path(harness: Harness, user_id: uuid.UUID) -> None:
    issued = await harness.issue(user_id)
    harness.clock.advance(hours=1)
    result = await harness.refresh(issued.refresh_token)

    assert result.refresh_token is not None
    assert result.refresh_token != issued.refresh_token
    assert result.access_token
    old, new = await harness.rows()
    assert old.rotated_at is not None
    assert old.replaced_by == new.id
    assert new.family_id == old.family_id
    assert new.rotated_at is None and new.revoked_at is None

    again = await harness.refresh(result.refresh_token)  # the new token works
    assert again.refresh_token is not None


async def test_refresh_expiry_is_capped_by_the_family_expiry(
    harness: Harness, user_id: uuid.UUID
) -> None:
    token = (await harness.issue(user_id)).refresh_token
    for _ in range(3):  # day 29, 58, 87
        harness.clock.advance(days=29)
        result = await harness.refresh(token)
        assert result.refresh_token is not None
        token = result.refresh_token
    last = (await harness.rows())[-1]
    assert last.expires_at == last.family_expires_at
    assert result.refresh_expires_at == last.family_expires_at


async def test_second_use_inside_grace_returns_access_only(
    harness: Harness, user_id: uuid.UUID
) -> None:
    issued = await harness.issue(user_id)
    await harness.refresh(issued.refresh_token)
    harness.clock.advance(seconds=5)
    grace = await harness.refresh(issued.refresh_token)

    assert grace.access_token
    assert grace.refresh_token is None
    assert grace.refresh_expires_at is None
    assert all(row.revoked_at is None for row in await harness.rows())
    assert len(await harness.rows()) == 2  # no extra token was minted


async def test_reuse_after_grace_revokes_family_and_the_revocation_persists(
    harness: Harness, user_id: uuid.UUID
) -> None:
    issued = await harness.issue(user_id)
    newest = await harness.refresh(issued.refresh_token)
    assert newest.refresh_token is not None
    harness.clock.advance(seconds=11)

    with pytest.raises(AppError) as caught:
        await harness.refresh(issued.refresh_token)
    assert caught.value.code is ErrorCode.REFRESH_REUSE_DETECTED

    rows = await harness.rows()  # read through a brand new session: it must be committed
    assert len(rows) == 2
    assert all(row.revoked_at is not None for row in rows)
    assert {row.revoked_reason for row in rows} == {"reuse_detected"}
    with pytest.raises(AppError) as legit:
        await harness.refresh(newest.refresh_token)
    assert legit.value.code is ErrorCode.REFRESH_INVALID


async def test_reuse_only_revokes_the_affected_family(harness: Harness, user_id: uuid.UUID) -> None:
    first = await harness.issue(user_id)
    other_device = await harness.issue(user_id)
    await harness.refresh(first.refresh_token)
    harness.clock.advance(seconds=30)
    with pytest.raises(AppError):
        await harness.refresh(first.refresh_token)
    assert (await harness.refresh(other_device.refresh_token)).refresh_token is not None


@pytest.mark.parametrize("kind", ["unknown", "expired", "family_expired", "revoked"])
async def test_invalid_refresh_tokens_are_rejected(
    harness: Harness, user_id: uuid.UUID, kind: str
) -> None:
    issued = await harness.issue(user_id)
    token = "unknown-token-value-that-is-long-enough"
    if kind == "expired":
        harness.clock.advance(days=31)
        token = issued.refresh_token
    elif kind == "family_expired":
        harness.clock.advance(days=91)
        token = issued.refresh_token
    elif kind == "revoked":
        await harness.logout(issued.refresh_token)
        token = issued.refresh_token
    with pytest.raises(AppError) as caught:
        await harness.refresh(token)
    assert caught.value.code is ErrorCode.REFRESH_INVALID


async def test_logout_revokes_the_whole_family_and_is_idempotent(
    harness: Harness, user_id: uuid.UUID
) -> None:
    issued = await harness.issue(user_id)
    rotated = await harness.refresh(issued.refresh_token)
    assert rotated.refresh_token is not None

    await harness.logout(rotated.refresh_token)
    await harness.logout(rotated.refresh_token)  # second call: no error
    await harness.logout("never-issued-token-value-long-enough")  # unknown: no error

    assert all(row.revoked_at is not None for row in await harness.rows())
    with pytest.raises(AppError) as caught:
        await harness.refresh(rotated.refresh_token)
    assert caught.value.code is ErrorCode.REFRESH_INVALID


async def test_revoke_all_for_user_revokes_every_family_when_committed(
    harness: Harness, session_factory: SessionFactory, user_id: uuid.UUID
) -> None:
    await harness.issue(user_id)
    await harness.issue(user_id)
    async with UnitOfWork(session_factory) as uow:
        revoked = await TokenService(uow, harness.settings, harness.clock).revoke_all_for_user(
            user_id, "password_change"
        )
        await uow.commit()
    assert revoked == 2
    assert all(row.revoked_reason == "password_change" for row in await harness.rows())


async def test_concurrent_refresh_of_one_token_rotates_once(
    harness: Harness, user_id: uuid.UUID
) -> None:
    issued = await harness.issue(user_id)
    results = await asyncio.gather(
        harness.refresh(issued.refresh_token), harness.refresh(issued.refresh_token)
    )
    with_new_token = [r for r in results if r.refresh_token is not None]
    access_only = [r for r in results if r.refresh_token is None]
    assert len(with_new_token) == 1 and len(access_only) == 1
    assert len(await harness.rows()) == 2
    assert all(row.revoked_at is None for row in await harness.rows())
