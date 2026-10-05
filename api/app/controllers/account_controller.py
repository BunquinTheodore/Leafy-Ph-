"""Account controller: rate limits, calls the account service, builds DTOs."""

from app.controllers.mappers import to_user_out
from app.core.context import RequestContext
from app.core.ratelimit import RateLimiter
from app.core.security import AccessClaims
from app.db.models import User
from app.db.uow import UnitOfWork
from app.schemas.account import (
    AccountDeletedOut,
    ChangePasswordIn,
    DeleteAccountIn,
    PasswordChangedOut,
    UpdateProfileIn,
)
from app.schemas.auth import UserOut
from app.services.account_service import AccountService

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

    async def update_profile(self, user: User, payload: UpdateProfileIn) -> UserOut:
        updated = await self._account.update_profile(
            user, first_name=payload.first_name, last_name=payload.last_name
        )
        return await self._user_out(updated)

    async def change_password(
        self, user: User, claims: AccessClaims, payload: ChangePasswordIn, ctx: RequestContext
    ) -> PasswordChangedOut:
        self._hit(f"password-change:{user.id}", PASSWORD_CHANGE_LIMIT)
        session = await self._account.change_password(
            user,
            claims,
            current_password=payload.current_password,
            new_password=payload.new_password,
            ctx=ctx,
        )
        return PasswordChangedOut(
            access_token=session.access_token,
            refresh_token=session.refresh_token,
            expires_in=session.expires_in,
            refresh_expires_at=session.refresh_expires_at,
        )

    async def delete_account(self, user: User, payload: DeleteAccountIn) -> AccountDeletedOut:
        self._hit(f"delete-account:{user.id}", DELETE_LIMIT)
        await self._account.delete_account(
            user, password=payload.password, confirmation=payload.confirmation
        )
        return AccountDeletedOut()
