import pytest
from app.core.clock import FixedClock
from app.core.config import Settings
from app.core.context import RequestContext
from app.core.errors import AppError, ErrorCode
from app.core.security import PasswordService
from app.db.models import RefreshToken, User
from app.db.uow import UnitOfWork
from app.services.auth_service import AuthService
from app.services.token_service import TokenService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.integration.conftest import insert_user

pytestmark = pytest.mark.integration

CTX = RequestContext(ip="198.51.100.4", user_agent="pytest")
PASSWORD = "a calm green forest"
SessionFactory = async_sessionmaker[AsyncSession]


class Harness:
    def __init__(
        self,
        factory: SessionFactory,
        settings: Settings,
        clock: FixedClock,
        passwords: PasswordService,
    ) -> None:
        self.factory = factory
        self.settings = settings
        self.clock = clock
        self.passwords = passwords

    async def register(self, email: str = "new@example.com", password: str = PASSWORD) -> User:
        async with UnitOfWork(self.factory) as uow:
            service = AuthService(
                uow, self.passwords, TokenService(uow, self.settings, self.clock), self.clock
            )
            result = await service.register(
                email=email, password=password, first_name="New", last_name="Leaf", ctx=CTX
            )
            return result.user

    async def login(self, email: str, password: str) -> User:
        async with UnitOfWork(self.factory) as uow:
            service = AuthService(
                uow, self.passwords, TokenService(uow, self.settings, self.clock), self.clock
            )
            return (await service.authenticate(email=email, password=password, ctx=CTX)).user


@pytest.fixture
async def harness(
    session_factory: SessionFactory,
    db_settings: Settings,
    clock: FixedClock,
    passwords: PasswordService,
) -> Harness:
    return Harness(session_factory, db_settings, clock, passwords)


async def test_register_creates_user_with_argon2id_hash_and_session(
    harness: Harness, session_factory: SessionFactory
) -> None:
    user = await harness.register()
    async with session_factory() as session:
        stored = (await session.execute(select(User))).scalar_one()
        tokens = (await session.execute(select(RefreshToken))).scalars().all()
    assert stored.id == user.id
    assert stored.password_hash is not None and stored.password_hash.startswith("$argon2id$")
    assert PASSWORD not in stored.password_hash
    assert stored.email_verified_at is None
    assert stored.password_changed_at == harness.clock.now()
    assert len(tokens) == 1


async def test_register_duplicate_email_is_email_taken_ignoring_case(harness: Harness) -> None:
    await harness.register("dup@example.com")
    with pytest.raises(AppError) as caught:
        await harness.register("DUP@example.com")
    assert caught.value.code is ErrorCode.EMAIL_TAKEN


async def test_authenticate_succeeds_with_the_right_password(harness: Harness) -> None:
    registered = await harness.register("me@example.com")
    assert (await harness.login("me@example.com", PASSWORD)).id == registered.id


async def test_wrong_password_unknown_email_and_passwordless_user_look_identical(
    harness: Harness, session_factory: SessionFactory
) -> None:
    await harness.register("real@example.com")
    await insert_user(session_factory, email="google@example.com", password_hash=None)

    failures = []
    for email, password in [
        ("real@example.com", "the wrong password"),
        ("nobody@example.com", PASSWORD),
        ("google@example.com", PASSWORD),
    ]:
        with pytest.raises(AppError) as caught:
            await harness.login(email, password)
        failures.append((caught.value.code, caught.value.status_code, caught.value.message))
    assert len(set(failures)) == 1
    assert failures[0][0] is ErrorCode.INVALID_CREDENTIALS


async def test_authenticate_always_runs_a_verification(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str | None] = []
    real_verify = harness.passwords.verify

    def spy(password: str, password_hash: str | None) -> bool:
        calls.append(password_hash)
        return real_verify(password, password_hash)

    monkeypatch.setattr(harness.passwords, "verify", spy)
    with pytest.raises(AppError):
        await harness.login("ghost@example.com", PASSWORD)
    assert calls == [None]  # the dummy hash path was taken inside verify()


async def test_authenticate_upgrades_a_weak_hash_without_marking_password_changed(
    harness: Harness, session_factory: SessionFactory
) -> None:
    weak = PasswordService(time_cost=1, memory_kib=8, parallelism=1).hash(PASSWORD)
    user = await insert_user(session_factory, email="old@example.com", password_hash=weak)
    await harness.login("old@example.com", PASSWORD)
    async with session_factory() as session:
        stored = (await session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert stored.password_hash != weak
    assert stored.password_changed_at is None
