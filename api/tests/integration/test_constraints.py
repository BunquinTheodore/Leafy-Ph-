"""Database level rules: scan state/verdict CHECKs, composite FK, uniqueness, cascades."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from app.db.models import (
    Disease,
    OAuthIdentity,
    OAuthProvider,
    Plant,
    RefreshToken,
    Scan,
    ScanFeedback,
    ScanStage,
    ScanStatus,
    ScanVerdict,
    User,
)
from sqlalchemy import delete, select
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.integration.conftest import insert_catalog, insert_user

pytestmark = pytest.mark.integration

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _scan(user: User, **overrides: Any) -> Scan:
    values: dict[str, Any] = {
        "id": uuid.uuid4(),
        "user_id": user.id,
        "image_key": f"{user.id}/{uuid.uuid4()}.jpg",
        "status": ScanStatus.PROCESSING,
        "stage": ScanStage.VALIDATING,
    }
    values.update(overrides)
    return Scan(**values)


async def _expect_violation(session: AsyncSession, scan: Scan, fragment: str) -> None:
    session.add(scan)
    with pytest.raises(IntegrityError) as caught:
        await session.flush()
    assert fragment in str(caught.value.orig)
    await session.rollback()


@pytest.fixture
async def user(session_factory: async_sessionmaker[AsyncSession]) -> User:
    return await insert_user(session_factory)


@pytest.fixture
async def catalog(session: AsyncSession) -> dict[str, Any]:
    return await insert_catalog(session)


async def test_valid_scan_states_are_accepted(
    session: AsyncSession, user: User, catalog: dict[str, Any]
) -> None:
    session.add_all(
        [
            _scan(user),
            _scan(
                user,
                status=ScanStatus.COMPLETED,
                stage=None,
                verdict=ScanVerdict.DISEASE,
                plant_id=catalog["tomato"].id,
                disease_id=catalog["early_blight"].id,
                raw_prediction={"plant": "tomato", "disease": "early-blight"},
            ),
            _scan(
                user,
                status=ScanStatus.COMPLETED,
                stage=None,
                verdict=ScanVerdict.HEALTHY,
                plant_id=catalog["tomato"].id,
            ),
            _scan(user, status=ScanStatus.COMPLETED, stage=None, verdict=ScanVerdict.UNKNOWN),
            _scan(
                user,
                status=ScanStatus.COMPLETED,
                stage=None,
                verdict=ScanVerdict.UNKNOWN,
                plant_id=catalog["potato"].id,
            ),
            _scan(user, status=ScanStatus.FAILED, stage=None, failure_code="ml_unavailable"),
        ]
    )
    await session.commit()
    assert len((await session.execute(select(Scan))).scalars().all()) == 6


async def test_completed_scan_requires_a_verdict(session: AsyncSession, user: User) -> None:
    scan = _scan(user, status=ScanStatus.COMPLETED, stage=None)
    await _expect_violation(session, scan, "ck_scan_state_consistent")


async def test_processing_scan_cannot_carry_a_verdict(session: AsyncSession, user: User) -> None:
    scan = _scan(user, verdict=ScanVerdict.UNKNOWN)
    await _expect_violation(session, scan, "ck_scan_state_consistent")


async def test_failed_scan_requires_a_failure_code(session: AsyncSession, user: User) -> None:
    scan = _scan(user, status=ScanStatus.FAILED, stage=None)
    await _expect_violation(session, scan, "ck_scan_state_consistent")


async def test_disease_verdict_requires_plant_and_disease(
    session: AsyncSession, user: User, catalog: dict[str, Any]
) -> None:
    scan = _scan(
        user,
        status=ScanStatus.COMPLETED,
        stage=None,
        verdict=ScanVerdict.DISEASE,
        plant_id=catalog["tomato"].id,
    )
    await _expect_violation(session, scan, "ck_scan_verdict_consistent")


async def test_healthy_verdict_cannot_have_a_disease(
    session: AsyncSession, user: User, catalog: dict[str, Any]
) -> None:
    scan = _scan(
        user,
        status=ScanStatus.COMPLETED,
        stage=None,
        verdict=ScanVerdict.HEALTHY,
        plant_id=catalog["tomato"].id,
        disease_id=catalog["early_blight"].id,
    )
    await _expect_violation(session, scan, "ck_scan_verdict_consistent")


async def test_healthy_verdict_requires_a_plant(session: AsyncSession, user: User) -> None:
    scan = _scan(user, status=ScanStatus.COMPLETED, stage=None, verdict=ScanVerdict.HEALTHY)
    await _expect_violation(session, scan, "ck_scan_verdict_consistent")


async def test_composite_fk_rejects_a_disease_paired_with_the_wrong_plant(
    session: AsyncSession, user: User, catalog: dict[str, Any]
) -> None:
    scan = _scan(
        user,
        status=ScanStatus.COMPLETED,
        stage=None,
        verdict=ScanVerdict.DISEASE,
        plant_id=catalog["potato"].id,  # early blight belongs to tomato
        disease_id=catalog["early_blight"].id,
    )
    await _expect_violation(session, scan, "fk_scan_disease_plant")


async def test_scan_image_key_is_unique(session: AsyncSession, user: User) -> None:
    session.add(_scan(user, image_key="same/key.jpg"))
    await session.commit()
    await _expect_violation(session, _scan(user, image_key="same/key.jpg"), "image_key")


async def test_deleting_a_referenced_plant_is_restricted(
    session: AsyncSession, user: User, catalog: dict[str, Any]
) -> None:
    session.add(
        _scan(
            user,
            status=ScanStatus.COMPLETED,
            stage=None,
            verdict=ScanVerdict.HEALTHY,
            plant_id=catalog["tomato"].id,
        )
    )
    await session.commit()
    with pytest.raises(IntegrityError):
        await session.execute(delete(Plant).where(Plant.id == catalog["tomato"].id))
        await session.commit()
    await session.rollback()


async def test_deleting_a_user_cascades_to_scans_feedback_and_tokens(
    session: AsyncSession, user: User, catalog: dict[str, Any]
) -> None:
    scan = _scan(
        user,
        status=ScanStatus.COMPLETED,
        stage=None,
        verdict=ScanVerdict.UNKNOWN,
    )
    session.add(scan)
    await session.flush()
    session.add(ScanFeedback(scan_id=scan.id, is_correct=False, comment="not a tomato"))
    session.add(
        OAuthIdentity(
            user_id=user.id, provider=OAuthProvider.GOOGLE, provider_sub="sub-1", email="a@b.co"
        )
    )
    session.add(
        RefreshToken(
            user_id=user.id,
            family_id=uuid.uuid4(),
            token_hash="r" * 64,
            created_at=NOW,
            expires_at=NOW + timedelta(days=30),
            family_expires_at=NOW + timedelta(days=90),
        )
    )
    await session.commit()

    await session.execute(delete(User).where(User.id == user.id))
    await session.commit()

    for model in (Scan, ScanFeedback, OAuthIdentity, RefreshToken):
        assert (await session.execute(select(model))).first() is None


async def test_user_email_is_unique_ignoring_case(
    session_factory: async_sessionmaker[AsyncSession], user: User
) -> None:
    with pytest.raises(IntegrityError):
        await insert_user(session_factory, email="LEAF@Example.COM")


async def test_oauth_identity_is_unique_per_provider_subject(
    session: AsyncSession, user: User
) -> None:
    other = User(id=uuid.uuid4(), email="other@example.com", first_name="O", last_name="T")
    session.add(other)
    session.add(
        OAuthIdentity(
            user_id=user.id, provider=OAuthProvider.GOOGLE, provider_sub="s", email="a@b.co"
        )
    )
    await session.commit()
    session.add(
        OAuthIdentity(
            user_id=other.id, provider=OAuthProvider.GOOGLE, provider_sub="s", email="c@d.co"
        )
    )
    with pytest.raises(IntegrityError):
        await session.flush()
    await session.rollback()


async def test_disease_slug_is_unique_per_plant_only(
    session: AsyncSession, catalog: dict[str, Any]
) -> None:
    session.add(Disease(plant_id=catalog["potato"].id, slug="early-blight", name="Early Blight"))
    await session.commit()  # same slug on another plant is allowed
    session.add(Disease(plant_id=catalog["tomato"].id, slug="early-blight", name="Duplicate"))
    with pytest.raises(IntegrityError):
        await session.flush()
    await session.rollback()


async def test_feedback_comment_is_limited_to_300_characters(
    session: AsyncSession, user: User
) -> None:
    scan = _scan(user, status=ScanStatus.COMPLETED, stage=None, verdict=ScanVerdict.UNKNOWN)
    session.add(scan)
    await session.flush()
    session.add(ScanFeedback(scan_id=scan.id, is_correct=False, comment="x" * 301))
    with pytest.raises(DBAPIError):
        await session.flush()
    await session.rollback()
