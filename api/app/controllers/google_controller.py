"""Google sign in controller."""

from app.controllers.mappers import to_user_out
from app.core.context import RequestContext
from app.core.ratelimit import RateLimiter
from app.db.uow import UnitOfWork
from app.schemas.google import GoogleSessionOut, GoogleSignInIn
from app.services.google_auth_service import GoogleAuthService

GOOGLE_LIMIT = 10
GOOGLE_WINDOW_SECONDS = 900


class GoogleController:
    def __init__(self, service: GoogleAuthService, uow: UnitOfWork, limiter: RateLimiter) -> None:
        self._service = service
        self._uow = uow
        self._limiter = limiter

    async def sign_in(self, payload: GoogleSignInIn, ctx: RequestContext) -> GoogleSessionOut:
        self._limiter.hit(
            f"google:{ctx.ip}", limit=GOOGLE_LIMIT, window_seconds=GOOGLE_WINDOW_SECONDS
        )
        result = await self._service.sign_in(id_token=payload.id_token, ctx=ctx)
        providers = await self._uow.oauth_identities.providers_for_user(result.user.id)
        return GoogleSessionOut(
            access_token=result.session.access_token,
            refresh_token=result.session.refresh_token,
            expires_in=result.session.expires_in,
            refresh_expires_at=result.session.refresh_expires_at,
            user=to_user_out(result.user, providers),
            is_new_user=result.is_new_user,
            linked_existing_account=result.linked_existing,
        )
