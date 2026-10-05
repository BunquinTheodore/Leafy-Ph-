"""Account lifecycle: profile, password change and recovery, deletion."""

import asyncio
import uuid
from datetime import timedelta

from app.core.background import BackgroundRunner
from app.core.clock import Clock
from app.core.config import Settings
from app.core.context import RequestContext
from app.core.errors import AppError, ErrorCode
from app.core.logging import get_logger
from app.core.password_policy import password_policy_violation
from app.core.security import AUTH_METHOD_GOOGLE, AccessClaims, PasswordService
from app.db.models import User
from app.db.uow import UnitOfWork
from app.services.purge_service import PurgeService
from app.services.token_service import REASON_PASSWORD_CHANGE, IssuedSession, TokenService

DELETE_CONFIRMATION = "DELETE"

_log = get_logger("leafy.account")


def _invalid_field(field: str, reason: str) -> AppError:
    return AppError(ErrorCode.VALIDATION_ERROR, details=[{"field": field, "type": reason}])


class AccountService:
    def __init__(
        self,
        *,
        uow: UnitOfWork,
        passwords: PasswordService,
        purge: PurgeService,
        tokens: TokenService,
        runner: BackgroundRunner,
        settings: Settings,
        clock: Clock,
    ) -> None:
        self._uow = uow
        self._passwords = passwords
        self._purge = purge
        self._tokens = tokens
        self._runner = runner
        self._settings = settings
        self._clock = clock

    # ---- profile and password -----------------------------------------------------------

    async def update_profile(
        self, user: User, *, first_name: str | None, last_name: str | None
    ) -> User:
        values = {
            key: value
            for key, value in (("first_name", first_name), ("last_name", last_name))
            if value is not None
        }
        await self._uow.users.update_profile(user.id, values)
        await self._uow.commit()
        await self._uow.session.refresh(user)
        return user

    async def change_password(
        self,
        user: User,
        claims: AccessClaims,
        *,
        current_password: str | None,
        new_password: str,
        ctx: RequestContext,
    ) -> IssuedSession:
        """Change the password, or set the first one for a Google only account.

        There is no email recovery. A session that came from a Google sign in within the last
        `fresh_session_seconds` proves control of the account's email, so it may set a new
        password without the old one, and so may a Google only account setting its first one.
        Every other session must supply the current password. Every existing session is
        revoked in the same transaction and the caller receives a fresh one.
        """
        had_password = user.password_hash is not None
        recovery = self._is_recent_google_sign_in(claims)
        if had_password and not recovery:
            await self._require_current_password(user, current_password)
        elif not had_password and not recovery:
            raise AppError(ErrorCode.REAUTH_REQUIRED)
        self._require_acceptable(new_password, user.email)
        await self._store_password(user, new_password)
        await self._tokens.revoke_all_for_user(user.id, REASON_PASSWORD_CHANGE)
        session = await self._tokens.issue_session(user.id, ctx)
        await self._uow.commit()
        _log.info(
            "password_changed",
            user_id=str(user.id),
            first_password=not had_password,
            recovery=had_password and recovery,
            ip=ctx.ip,
        )
        return session

    def _is_recent_google_sign_in(self, claims: AccessClaims) -> bool:
        if claims.auth_method != AUTH_METHOD_GOOGLE or claims.auth_time is None:
            return False
        age = self._clock.now() - claims.auth_time
        return timedelta(0) <= age <= timedelta(seconds=self._settings.fresh_session_seconds)

    async def _require_current_password(
        self, user: User, supplied: str | None, field: str = "current_password"
    ) -> None:
        if not supplied:
            raise _invalid_field(field, "missing")
        matched = await asyncio.to_thread(self._passwords.verify, supplied, user.password_hash)
        if not matched:
            raise AppError(ErrorCode.PASSWORD_INCORRECT)

    @staticmethod
    def _require_acceptable(password: str, email: str) -> None:
        reason = password_policy_violation(password, email)
        if reason is not None:
            raise _invalid_field("new_password", reason)

    async def _store_password(self, user: User, new_password: str) -> None:
        new_hash = await asyncio.to_thread(self._passwords.hash, new_password)
        await self._uow.users.set_password_hash(user.id, new_hash, self._clock.now())

    # ---- deletion -----------------------------------------------------------------------

    async def delete_account(
        self, user: User, *, password: str | None, confirmation: str | None
    ) -> None:
        """Delete the user and queue their stored images, in one transaction."""
        if user.password_hash is not None:
            await self._require_current_password(user, password, field="password")
        else:
            await self._require_typed_confirmation_and_fresh_session(user, confirmation)
        user_id = user.id
        keys = await self._uow.storage_outbox.scan_image_keys(user_id)
        await self._uow.storage_outbox.enqueue(
            bucket=self._settings.s3_scans_bucket, keys=keys, due_at=self._clock.now()
        )
        await self._uow.users.delete(user_id)
        await self._uow.commit()
        _log.info("account_deleted", user_id=str(user_id), queued_objects=len(keys))
        self._runner.spawn(self._drain_quietly())

    async def _require_typed_confirmation_and_fresh_session(
        self, user: User, confirmation: str | None
    ) -> None:
        if confirmation != DELETE_CONFIRMATION:
            raise _invalid_field("confirmation", "must_be_DELETE")
        if not await self._session_is_fresh(user.id):
            raise AppError(ErrorCode.REAUTH_REQUIRED)

    async def _session_is_fresh(self, user_id: uuid.UUID) -> bool:
        started = await self._uow.refresh_tokens.latest_family_started_at(user_id)
        if started is None:
            return False
        age = self._clock.now() - started
        return age <= timedelta(seconds=self._settings.fresh_session_seconds)

    async def _drain_quietly(self) -> None:
        await self._purge.drain_all()
