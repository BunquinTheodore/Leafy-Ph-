"""Account controller: rate limits, calls the account service, builds DTOs."""

from app.controllers.mappers import to_user_out
from app.core.context import RequestContext
from app.core.ratelimit import RateLimiter
from app.db.models import User
from app.db.uow import UnitOfWork
from app.schemas.account import (
    AccountDeletedOut,
    ChangePasswordIn,
    DeleteAccountIn,
    ForgotPasswordIn,
    PasswordChangedOut,
    PasswordResetOut,
    ResetPasswordIn,
    SentOut,
    UpdateProfileIn,
    VerifiedOut,
    VerifyEmailIn,
)
from app.schemas.auth import UserOut
from app.services.account_service import AccountService

VERIFY_LIMIT = (10, 900)
RESEND_LIMIT = (5, 3600)
FORGOT_IP_LIMIT = (10, 3600)
FORGOT_EMAIL_LIMIT = (3, 3600)
RESET_LIMIT = (10, 900)
PASSWORD_CHANGE_LIMIT = (10, 900)
DELETE_LIMIT = (5, 900)


class AccountController:
    def __init__(self, account: AccountService, uow: UnitOfWork, limiter: RateLimiter) -> None:
        self._account = account
        self._uow = uow
        self._limiter = limiter

    def _hit(self, key: str, limit: tuple[int, int]) -> None:
        self._limiter.hit(key, limit=limit[0], window_seconds=limit[1])

    async def _user_out(self, user: User) -> UserOut:
        providers = await self._uow.oauth_identities.providers_for_user(user.id)
        return to_user_out(user, providers)

    async def verify_email(self, payload: VerifyEmailIn, ctx: RequestContext) -> VerifiedOut:
        self._hit(f"verify-email:{ctx.ip}", VERIFY_LIMIT)
        await self._account.verify_email(payload.token)
        return VerifiedOut()

    async def resend_verification(self, user: User) -> SentOut:
        self._hit(f"resend-verification:{user.id}", RESEND_LIMIT)
        await self._account.resend_verification(user)
        return SentOut()

    async def forgot_password(self, payload: ForgotPasswordIn, ctx: RequestContext) -> SentOut:
        # Limits apply whether or not the account exists, so they reveal nothing.
        self._hit(f"forgot:ip:{ctx.ip}", FORGOT_IP_LIMIT)
        self._hit(f"forgot:email:{payload.email}", FORGOT_EMAIL_LIMIT)
        await self._account.forgot_password(payload.email)
        return SentOut()

    async def reset_password(
        self, payload: ResetPasswordIn, ctx: RequestContext
    ) -> PasswordResetOut:
        self._hit(f"reset-password:{ctx.ip}", RESET_LIMIT)
        await self._account.reset_password(payload.token, payload.new_password)
        return PasswordResetOut()

    async def update_profile(self, user: User, payload: UpdateProfileIn) -> UserOut:
        updated = await self._account.update_profile(
            user, first_name=payload.first_name, last_name=payload.last_name
        )
        return await self._user_out(updated)

    async def change_password(self, user: User, payload: ChangePasswordIn) -> PasswordChangedOut:
        self._hit(f"password-change:{user.id}", PASSWORD_CHANGE_LIMIT)
        await self._account.change_password(
            user, current_password=payload.current_password, new_password=payload.new_password
        )
        return PasswordChangedOut()

    async def delete_account(self, user: User, payload: DeleteAccountIn) -> AccountDeletedOut:
        self._hit(f"delete-account:{user.id}", DELETE_LIMIT)
        await self._account.delete_account(
            user, password=payload.password, confirmation=payload.confirmation
        )
        return AccountDeletedOut()
