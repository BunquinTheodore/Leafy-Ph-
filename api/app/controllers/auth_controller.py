"""Auth controller: rate limits, calls services, builds DTOs. No SQL beyond read helpers."""

from app.controllers.mappers import to_user_out
from app.core.context import RequestContext
from app.core.ratelimit import RateLimiter
from app.db.uow import UnitOfWork
from app.schemas.auth import (
    AuthSessionOut,
    LoginIn,
    LogoutOut,
    RefreshIn,
    RefreshOut,
    RegisterIn,
)
from app.services.auth_service import AuthResult, AuthService
from app.services.token_service import TokenService

REGISTER_LIMIT = 5
REGISTER_WINDOW_SECONDS = 3600
LOGIN_LIMIT = 10
LOGIN_WINDOW_SECONDS = 900
# Per account, across all IPs: slows distributed guessing against one password.
LOGIN_EMAIL_LIMIT = 30
REFRESH_LIMIT = 60
REFRESH_WINDOW_SECONDS = 60


class AuthController:
    def __init__(
        self,
        auth: AuthService,
        tokens: TokenService,
        uow: UnitOfWork,
        limiter: RateLimiter,
    ) -> None:
        self._auth = auth
        self._tokens = tokens
        self._uow = uow
        self._limiter = limiter

    async def _session_out(self, result: AuthResult) -> AuthSessionOut:
        providers = await self._uow.oauth_identities.providers_for_user(result.user.id)
        return AuthSessionOut(
            access_token=result.session.access_token,
            refresh_token=result.session.refresh_token,
            expires_in=result.session.expires_in,
            refresh_expires_at=result.session.refresh_expires_at,
            user=to_user_out(result.user, providers),
        )

    async def register(self, payload: RegisterIn, ctx: RequestContext) -> AuthSessionOut:
        self._limiter.hit(
            f"register:{ctx.ip}", limit=REGISTER_LIMIT, window_seconds=REGISTER_WINDOW_SECONDS
        )
        result = await self._auth.register(
            email=payload.email,
            password=payload.password,
            first_name=payload.first_name,
            last_name=payload.last_name,
            ctx=ctx,
        )
        return await self._session_out(result)

    async def login(self, payload: LoginIn, ctx: RequestContext) -> AuthSessionOut:
        self._limiter.hit(
            f"login:{ctx.ip}:{payload.email}",
            limit=LOGIN_LIMIT,
            window_seconds=LOGIN_WINDOW_SECONDS,
        )
        self._limiter.hit(
            f"login-email:{payload.email}",
            limit=LOGIN_EMAIL_LIMIT,
            window_seconds=LOGIN_WINDOW_SECONDS,
        )
        result = await self._auth.authenticate(
            email=payload.email, password=payload.password, ctx=ctx
        )
        return await self._session_out(result)

    async def refresh(self, payload: RefreshIn, ctx: RequestContext) -> RefreshOut:
        self._limiter.hit(
            f"refresh:{ctx.ip}", limit=REFRESH_LIMIT, window_seconds=REFRESH_WINDOW_SECONDS
        )
        result = await self._tokens.refresh(payload.refresh_token, ctx)
        return RefreshOut(
            access_token=result.access_token,
            refresh_token=result.refresh_token,
            expires_in=result.expires_in,
            refresh_expires_at=result.refresh_expires_at,
        )

    async def logout(self, payload: RefreshIn) -> LogoutOut:
        await self._tokens.revoke_by_token(payload.refresh_token)
        return LogoutOut()
