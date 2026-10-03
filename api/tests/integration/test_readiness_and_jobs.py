import uuid
from datetime import timedelta

import httpx
import pytest
from app.core.clock import FixedClock
from app.db.models import AuthToken, AuthTokenType, RefreshToken
from app.jobs.cleanup_tokens import cleanup_tokens
from app.main import create_app
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.conftest import make_settings
from tests.integration.conftest import insert_user

pytestmark = pytest.mark.integration


async def test_readyz_is_503_without_leaking_details_when_the_database_is_down() -> None:
    settings = make_settings(database_url="postgresql+asyncpg://nobody:nothing@127.0.0.1:1/missing")
    app = create_app(settings)
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/readyz")
    await app.state.engine.dispose()
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"
    assert "127.0.0.1" not in response.text and "nobody" not in response.text


async def test_cleanup_removes_only_expired_tokens(
    session_factory: async_sessionmaker[AsyncSession], clock: FixedClock
) -> None:
    user = await insert_user(session_factory)
    now = clock.now()

    def refresh_row(label: str, expires: timedelta, family: timedelta) -> RefreshToken:
        return RefreshToken(
            user_id=user.id,
            family_id=uuid.uuid4(),
            token_hash=label * 64,
            created_at=now - timedelta(days=100),
            expires_at=now + expires,
            family_expires_at=now + family,
        )

    async with session_factory() as session:
        session.add_all(
            [
                refresh_row("a", timedelta(days=-1), timedelta(days=10)),
                refresh_row("b", timedelta(days=5), timedelta(days=-1)),
                refresh_row("c", timedelta(days=5), timedelta(days=10)),
                AuthToken(
                    user_id=user.id,
                    type=AuthTokenType.RESET_PASSWORD,
                    token_hash="d" * 64,
                    expires_at=now - timedelta(minutes=1),
                ),
                AuthToken(
                    user_id=user.id,
                    type=AuthTokenType.VERIFY_EMAIL,
                    token_hash="e" * 64,
                    expires_at=now + timedelta(hours=1),
                ),
            ]
        )
        await session.commit()

    result = await cleanup_tokens(session_factory, clock)

    assert (result.refresh_tokens, result.auth_tokens) == (2, 1)
    async with session_factory() as session:
        assert (await session.execute(select(func.count()).select_from(RefreshToken))).scalar() == 1
        assert (await session.execute(select(func.count()).select_from(AuthToken))).scalar() == 1
