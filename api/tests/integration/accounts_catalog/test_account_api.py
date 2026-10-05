"""Profile, password change and account deletion (with the storage outbox)."""

import uuid
from typing import Any

import httpx
import pytest
from app.core.clock import FixedClock
from app.db.models import Scan, ScanStage, ScanStatus
from app.services.purge_service import PurgeService
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from tests.integration.accounts_catalog.conftest import (
    PASSWORD,
    Settle,
    bearer,
    google_login,
    register,
)
from tests.support.fakes import FakeStorage

pytestmark = pytest.mark.integration

ME = "/api/v1/users/me"
NEW_PASSWORD = "a brand new meadow"


async def _count(engine: AsyncEngine, table: str) -> int:
    async with engine.connect() as conn:
        return int((await conn.execute(text(f"SELECT count(*) FROM {table}"))).scalar_one())  # noqa: S608


async def _add_scans(
    session_factory: async_sessionmaker[AsyncSession], user_id: str, count: int
) -> list[str]:
    keys = [f"{user_id}/{uuid.uuid4()}.jpg" for _ in range(count)]
    async with session_factory() as session:
        session.add_all(
            Scan(
                id=uuid.uuid4(),
                user_id=uuid.UUID(user_id),
                image_key=key,
                status=ScanStatus.PROCESSING,
                stage=ScanStage.VALIDATING,
            )
            for key in keys
        )
        await session.commit()
    return keys


# ---- profile ----------------------------------------------------------------------------


async def test_patch_me_updates_the_names(client: httpx.AsyncClient) -> None:
    session = await register(client)
    response = await client.patch(
        ME,
        headers=bearer(session["access_token"]),
        json={"first_name": "  Lea  ", "last_name": "Greene"},
    )
    assert response.status_code == 200
    user = response.json()["data"]
    assert (user["first_name"], user["last_name"]) == ("Lea", "Greene")
    me = await client.get(ME, headers=bearer(session["access_token"]))
    assert me.json()["data"]["first_name"] == "Lea"


async def test_patch_me_allows_changing_only_one_field(client: httpx.AsyncClient) -> None:
    session = await register(client)
    response = await client.patch(
        ME, headers=bearer(session["access_token"]), json={"last_name": ""}
    )
    assert response.status_code == 200
    assert response.json()["data"]["first_name"] == "Leaf"
    assert response.json()["data"]["last_name"] == ""


@pytest.mark.parametrize(
    "body",
    [{}, {"first_name": ""}, {"first_name": "x" * 101}, {"email": "other@example.com"}],
)
async def test_patch_me_rejects_invalid_bodies(
    client: httpx.AsyncClient, body: dict[str, Any]
) -> None:
    session = await register(client)
    response = await client.patch(ME, headers=bearer(session["access_token"]), json=body)
    assert response.status_code == 422


async def test_patch_me_requires_authentication(client: httpx.AsyncClient) -> None:
    assert (await client.patch(ME, json={"first_name": "A"})).status_code == 401


# ---- password ---------------------------------------------------------------------------


async def test_change_password_needs_the_current_password(client: httpx.AsyncClient) -> None:
    session = await register(client)
    headers = bearer(session["access_token"])
    path = f"{ME}/password"

    missing = await client.post(path, headers=headers, json={"new_password": NEW_PASSWORD})
    assert missing.status_code == 422

    wrong = await client.post(
        path,
        headers=headers,
        json={"current_password": "not it at all", "new_password": NEW_PASSWORD},
    )
    assert wrong.status_code == 403
    assert wrong.json()["error"]["code"] == "password_incorrect"

    ok = await client.post(
        path, headers=headers, json={"current_password": PASSWORD, "new_password": NEW_PASSWORD}
    )
    assert ok.status_code == 200
    assert ok.json()["data"]["changed"] is True
    login = await client.post(
        "/api/v1/auth/login", json={"email": "leaf@example.com", "password": NEW_PASSWORD}
    )
    assert login.status_code == 200


async def test_change_password_enforces_the_password_policy(client: httpx.AsyncClient) -> None:
    session = await register(client)
    response = await client.post(
        f"{ME}/password",
        headers=bearer(session["access_token"]),
        json={"current_password": PASSWORD, "new_password": "short"},
    )
    assert response.status_code == 422
    assert "short" not in response.text.replace("too_short", "")


async def test_a_google_only_user_sets_a_first_password_without_a_current_one(
    client: httpx.AsyncClient, google: Any
) -> None:
    login = await google_login(client, google, email="gina@example.com")
    token = login.json()["data"]["access_token"]
    response = await client.post(
        f"{ME}/password", headers=bearer(token), json={"new_password": NEW_PASSWORD}
    )
    assert response.status_code == 200
    me = await client.get(ME, headers=bearer(token))
    assert me.json()["data"]["auth_methods"] == ["password", "google"]
    password_login = await client.post(
        "/api/v1/auth/login", json={"email": "gina@example.com", "password": NEW_PASSWORD}
    )
    assert password_login.status_code == 200


async def test_after_setting_a_password_the_current_one_is_required_once_the_sign_in_is_old(
    client: httpx.AsyncClient, google: Any, clock: FixedClock
) -> None:
    login = await google_login(client, google, email="gina@example.com")
    headers = bearer(login.json()["data"]["access_token"])
    await client.post(f"{ME}/password", headers=headers, json={"new_password": NEW_PASSWORD})
    clock.advance(minutes=11)
    again = await client.post(
        f"{ME}/password", headers=headers, json={"new_password": "another long one"}
    )
    assert again.status_code == 422


# ---- deletion ---------------------------------------------------------------------------


async def test_delete_with_the_wrong_password_deletes_nothing(
    client: httpx.AsyncClient, engine: AsyncEngine
) -> None:
    session = await register(client)
    response = await client.request(
        "DELETE", ME, headers=bearer(session["access_token"]), json={"password": "wrong password!"}
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "password_incorrect"
    assert await _count(engine, "users") == 1


async def test_delete_without_a_password_is_a_validation_error(client: httpx.AsyncClient) -> None:
    session = await register(client)
    response = await client.request("DELETE", ME, headers=bearer(session["access_token"]), json={})
    assert response.status_code == 422


async def test_delete_removes_the_account_and_queues_every_scan_image(
    client: httpx.AsyncClient,
    engine: AsyncEngine,
    session_factory: async_sessionmaker[AsyncSession],
    storage: FakeStorage,
    settle: Settle,
) -> None:
    session = await register(client)
    user_id = session["user"]["id"]
    keys = await _add_scans(session_factory, user_id, 3)
    for key in keys:
        storage.objects[("leafy-scans", key)] = b"jpeg"
    other = await register(client, email="other@example.com")
    other_keys = await _add_scans(session_factory, other["user"]["id"], 1)
    storage.objects[("leafy-scans", other_keys[0])] = b"keep"

    response = await client.request(
        "DELETE", ME, headers=bearer(session["access_token"]), json={"password": PASSWORD}
    )
    assert response.status_code == 200
    assert response.json()["data"] == {"deleted": True}
    await settle()

    assert await _count(engine, "users") == 1
    assert await _count(engine, "scan") == 1
    assert await _count(engine, "refresh_token") == 1
    assert await _count(engine, "storage_deletion") == 0
    assert all(("leafy-scans", key) not in storage.objects for key in keys)
    assert ("leafy-scans", other_keys[0]) in storage.objects


async def test_the_old_access_token_stops_working_after_deletion(
    client: httpx.AsyncClient, settle: Settle
) -> None:
    session = await register(client)
    headers = bearer(session["access_token"])
    await client.request("DELETE", ME, headers=headers, json={"password": PASSWORD})
    await settle()
    assert (await client.get(ME, headers=headers)).status_code == 401
    refresh = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": session["refresh_token"]}
    )
    assert refresh.status_code == 401


async def test_account_is_deleted_even_when_storage_is_down_and_the_outbox_retries(
    client: httpx.AsyncClient,
    engine: AsyncEngine,
    session_factory: async_sessionmaker[AsyncSession],
    storage: FakeStorage,
    clock: FixedClock,
    settle: Settle,
) -> None:
    session = await register(client)
    keys = await _add_scans(session_factory, session["user"]["id"], 2)
    for key in keys:
        storage.objects[("leafy-scans", key)] = b"jpeg"
    storage.down = True

    response = await client.request(
        "DELETE", ME, headers=bearer(session["access_token"]), json={"password": PASSWORD}
    )
    assert response.status_code == 200
    await settle()
    assert await _count(engine, "users") == 0
    assert await _count(engine, "storage_deletion") == 2
    assert len(storage.objects) == 2

    purge = PurgeService(session_factory, storage, clock)
    assert (await purge.drain()).deleted == 0  # backoff has not elapsed
    clock.advance(minutes=10)
    assert (await purge.drain()).failed == 2  # still down: retried and backed off again
    async with engine.connect() as conn:
        attempts = [
            row[0] for row in await conn.execute(text("SELECT attempts FROM storage_deletion"))
        ]
    assert attempts == [2, 2]

    storage.down = False
    clock.advance(hours=2)
    result = await purge.drain_all()
    assert result.deleted == 2
    assert await _count(engine, "storage_deletion") == 0
    assert storage.objects == {}


# ---- deletion for Google only users -------------------------------------------------------


async def test_google_only_user_must_type_delete(
    client: httpx.AsyncClient, google: Any, engine: AsyncEngine, settle: Settle
) -> None:
    login = await google_login(client, google, email="gina@example.com")
    headers = bearer(login.json()["data"]["access_token"])
    missing = await client.request("DELETE", ME, headers=headers, json={})
    wrong = await client.request("DELETE", ME, headers=headers, json={"confirmation": "delete"})
    assert missing.status_code == wrong.status_code == 422
    assert await _count(engine, "users") == 1

    ok = await client.request("DELETE", ME, headers=headers, json={"confirmation": "DELETE"})
    assert ok.status_code == 200
    await settle()
    assert await _count(engine, "users") == 0
    assert await _count(engine, "oauth_identity") == 0


async def test_google_only_user_with_a_stale_session_must_sign_in_again(
    client: httpx.AsyncClient,
    google: Any,
    clock: FixedClock,
    engine: AsyncEngine,
    app: FastAPI,
) -> None:
    login = await google_login(client, google, email="gina@example.com")
    clock.advance(minutes=11)
    # A fresh access token from a silent refresh must not count as a fresh sign in.
    refreshed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": login.json()["data"]["refresh_token"]}
    )
    headers = bearer(refreshed.json()["data"]["access_token"])
    stale = await client.request("DELETE", ME, headers=headers, json={"confirmation": "DELETE"})
    assert stale.status_code == 403
    assert stale.json()["error"]["code"] == "reauth_required"
    assert await _count(engine, "users") == 1

    again = await google_login(client, google, email="gina@example.com")
    fresh = await client.request(
        "DELETE",
        ME,
        headers=bearer(again.json()["data"]["access_token"]),
        json={"confirmation": "DELETE"},
    )
    assert fresh.status_code == 200


async def test_delete_is_rate_limited(app: FastAPI, client: httpx.AsyncClient) -> None:
    session = await register(client)
    app.state.rate_limiter._enabled = True
    headers = bearer(session["access_token"])
    codes = [
        (
            await client.request(
                "DELETE", ME, headers=headers, json={"password": "wrong password!"}
            )
        ).status_code
        for _ in range(6)
    ]
    assert codes == [403, 403, 403, 403, 403, 429]
