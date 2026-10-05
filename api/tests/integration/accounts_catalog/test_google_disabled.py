"""With FIREBASE_PROJECT_ID empty and no mock, Google sign in is disabled with a clear error."""

import httpx
import pytest
from app.services.infra.google_mock import MockGoogleProvider
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

pytestmark = pytest.mark.integration


@pytest.fixture
def firebase_project_id() -> str:
    return ""


async def test_google_sign_in_is_disabled_without_a_firebase_project(
    client: httpx.AsyncClient, google: MockGoogleProvider, engine: AsyncEngine
) -> None:
    token = google.issue_id_token(email="gina@example.com")
    response = await client.post("/api/v1/auth/google", json={"id_token": token})
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "google_auth_failed"
    assert error["details"] == [{"reason": "disabled"}]
    async with engine.connect() as conn:
        assert (await conn.execute(text("SELECT count(*) FROM users"))).scalar_one() == 0
