import uuid
from datetime import UTC, datetime

import pytest
from app.db.models import Scan, ScanStage, ScanStatus
from app.db.uow import UnitOfWork
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.integration.conftest import insert_user

pytestmark = pytest.mark.integration

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
SessionFactory = async_sessionmaker[AsyncSession]


async def test_scans_are_only_visible_to_their_owner(session_factory: SessionFactory) -> None:
    owner = await insert_user(session_factory, email="owner@example.com")
    other = await insert_user(session_factory, email="other@example.com")
    scan_id = uuid.uuid4()
    async with session_factory() as session:
        session.add(
            Scan(
                id=scan_id,
                user_id=owner.id,
                image_key=f"{owner.id}/{scan_id}.jpg",
                status=ScanStatus.PROCESSING,
                stage=ScanStage.VALIDATING,
            )
        )
        await session.commit()

    async with UnitOfWork(session_factory) as uow:
        assert await uow.scans.get_owned(user_id=owner.id, scan_id=scan_id) is not None
        assert await uow.scans.get_owned(user_id=other.id, scan_id=scan_id) is None
