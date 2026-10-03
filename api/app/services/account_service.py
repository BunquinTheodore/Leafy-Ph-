"""Account lifecycle: email verification, password reset and change, profile, deletion."""

import asyncio
import uuid
from datetime import timedelta

from app.core.background import BackgroundRunner
from app.core.clock import Clock
from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.core.logging import get_logger
from app.core.password_policy import password_policy_violation
from app.core.security import PasswordService
from app.db.models import AuthTokenType, User
from app.db.uow import UnitOfWork
from app.services.email_service import EmailService
from app.services.email_token_service import EmailTokenService
from app.services.purge_service import PurgeService
from app.services.token_service import REASON_PASSWORD_CHANGE, TokenService

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
        email_tokens: EmailTokenService,
        tokens: TokenService,
        emails: EmailService,
        purge: PurgeService,
        runner: BackgroundRunner,
        settings: Settings,
        clock: Clock,
    ) -> None:
        self._uow = uow
        self._passwords = passwords
        self._email_tokens = email_tokens
        self._tokens = tokens
        self._emails = emails
        self._purge = purge
        self._runner = runner
        self._settings = settings
        self._clock = clock

    # ---- email verification -------------------------------------------------------------

    async def issue_verification(self, user: User) -> None:
        """Create a verify link and email it after the commit (used right after sign up)."""
        token = await self._email_tokens.issue(user.id, AuthTokenType.VERIFY_EMAIL)
        await self._uow.commit()
        self._runner.spawn(
            self._emails.send_verification(to=user.email, first_name=user.first_name, token=token)
        )

    async def verify_email(self, raw_token: str) -> None:
        user_id = await self._email_tokens.consume(raw_token, AuthTokenType.VERIFY_EMAIL)
        await self._uow.users.mark_email_verified(user_id, self._clock.now())
        await self._uow.commit()
        _log.info("email_verified", user_id=str(user_id))

    async def resend_verification(self, user: User) -> None:
        if user.email_verified_at is not None:
            raise AppError(ErrorCode.ALREADY_VERIFIED)
        wait = await self._email_tokens.seconds_until_resend(user.id, AuthTokenType.VERIFY_EMAIL)
        if wait > 0:
            raise AppError(ErrorCode.RATE_LIMITED, headers={"Retry-After": str(wait)})
        await self.issue_verification(user)

    # ---- password reset -----------------------------------------------------------------

    async def forgot_password(self, email: str) -> None:
        """Email a reset link when the account exists. The caller always answers the same."""
        user = await self._uow.users.get_by_email(email)
        if user is None:
            return
        token = await self._email_tokens.issue(user.id, AuthTokenType.RESET_PASSWORD)
        await self._uow.commit()
        self._runner.spawn(
            self._emails.send_password_reset(to=user.email, first_name=user.first_name, token=token)
        )

    async def reset_password(self, raw_token: str, new_password: str) -> None:
        """Use the token, set the password and end every session in one transaction."""
        user_id = await self._email_tokens.consume(raw_token, AuthTokenType.RESET_PASSWORD)
        user = await self._uow.users.get(user_id)
        if user is None:
            raise AppError(ErrorCode.TOKEN_INVALID_OR_EXPIRED)
        self._require_acceptable(new_password, user.email)
        await self._store_password(user, new_password)
        await self._tokens.revoke_all_for_user(user.id, REASON_PASSWORD_CHANGE)
        await self._uow.commit()
        self._notify_password_changed(user)

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
        self, user: User, *, current_password: str | None, new_password: str
    ) -> None:
        """Change the password, or set the first one for a Google only account."""
        had_password = user.password_hash is not None
        if had_password:
            await self._require_current_password(user, current_password)
        self._require_acceptable(new_password, user.email)
        await self._store_password(user, new_password)
        await self._uow.commit()
        _log.info("password_changed", user_id=str(user.id), first_password=not had_password)
        self._notify_password_changed(user)

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

    def _notify_password_changed(self, user: User) -> None:
        self._runner.spawn(
            self._emails.send_password_changed(to=user.email, first_name=user.first_name)
        )

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
