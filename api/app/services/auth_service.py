"""Registration and password authentication."""

import asyncio
from dataclasses import dataclass

from sqlalchemy.exc import IntegrityError

from app.core.clock import Clock
from app.core.context import RequestContext
from app.core.errors import AppError, ErrorCode
from app.core.logging import get_logger
from app.core.security import PasswordService
from app.db.models import User
from app.db.uow import UnitOfWork
from app.services.token_service import IssuedSession, TokenService

_log = get_logger("leafy.auth")


@dataclass(frozen=True)
class AuthResult:
    user: User
    session: IssuedSession


class AuthService:
    def __init__(
        self,
        uow: UnitOfWork,
        passwords: PasswordService,
        tokens: TokenService,
        clock: Clock,
    ) -> None:
        self._uow = uow
        self._passwords = passwords
        self._tokens = tokens
        self._clock = clock

    async def register(
        self,
        *,
        email: str,
        password: str,
        first_name: str,
        last_name: str,
        ctx: RequestContext,
    ) -> AuthResult:
        if await self._uow.users.get_by_email(email) is not None:
            raise AppError(ErrorCode.EMAIL_TAKEN)
        password_hash = await asyncio.to_thread(self._passwords.hash, password)
        try:
            async with self._uow.session.begin_nested():
                user = await self._uow.users.create(
                    email=email,
                    password_hash=password_hash,
                    first_name=first_name,
                    last_name=last_name,
                    password_changed_at=self._clock.now(),
                )
        except IntegrityError as exc:
            # Lost a race with another registration of the same email.
            raise AppError(ErrorCode.EMAIL_TAKEN) from exc
        session = await self._tokens.issue_session(user.id, ctx)
        await self._uow.commit()
        _log.info("user_registered", user_id=str(user.id))
        return AuthResult(user=user, session=session)

    async def authenticate(self, *, email: str, password: str, ctx: RequestContext) -> AuthResult:
        """Verify credentials. Unknown email, no password and wrong password look identical."""
        user = await self._uow.users.get_by_email(email)
        stored_hash = user.password_hash if user is not None else None
        matched = await asyncio.to_thread(self._passwords.verify, password, stored_hash)
        if user is None or not matched:
            raise AppError(ErrorCode.INVALID_CREDENTIALS)
        if stored_hash is not None and self._passwords.needs_rehash(stored_hash):
            new_hash = await asyncio.to_thread(self._passwords.hash, password)
            await self._uow.users.replace_hash_only(user.id, new_hash)
        session = await self._tokens.issue_session(user.id, ctx)
        await self._uow.commit()
        return AuthResult(user=user, session=session)
