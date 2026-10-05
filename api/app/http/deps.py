"""FastAPI dependencies: settings, unit of work, request context, authenticated user."""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.controllers.account_controller import AccountController
from app.controllers.auth_controller import AuthController
from app.controllers.catalog_controller import CatalogController
from app.controllers.google_controller import GoogleController
from app.controllers.scan_controller import ScanController
from app.controllers.user_controller import UserController
from app.core.background import BackgroundRunner
from app.core.clock import Clock
from app.core.config import Settings
from app.core.context import MAX_USER_AGENT_LENGTH, RequestContext
from app.core.errors import AppError, ErrorCode
from app.core.ratelimit import RateLimiter
from app.core.security import AccessClaims, PasswordService, decode_access_token
from app.db.models import User
from app.db.uow import UnitOfWork
from app.services.account_service import AccountService
from app.services.auth_service import AuthService
from app.services.catalog_service import CatalogService
from app.services.google_auth_service import GoogleAuthService
from app.services.infra.google_client import GoogleBackend
from app.services.infra.storage_service import StorageService
from app.services.purge_service import PurgeService
from app.services.scan_service import ScanService
from app.services.scan_worker import ScanQueue
from app.services.token_service import TokenService

_bearer = HTTPBearer(auto_error=False)


def get_settings_dep(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_clock(request: Request) -> Clock:
    clock: Clock = request.app.state.clock
    return clock


def get_password_service(request: Request) -> PasswordService:
    service: PasswordService = request.app.state.passwords
    return service


def get_rate_limiter(request: Request) -> RateLimiter:
    limiter: RateLimiter = request.app.state.rate_limiter
    return limiter


def get_session_factory(request: Request) -> async_sessionmaker[AsyncSession]:
    factory: async_sessionmaker[AsyncSession] = request.app.state.session_factory
    return factory


def get_background_runner(request: Request) -> BackgroundRunner:
    runner: BackgroundRunner = request.app.state.background
    return runner


def get_storage(request: Request) -> StorageService:
    storage: StorageService = request.app.state.storage
    return storage


def get_google_backend(request: Request) -> GoogleBackend:
    backend: GoogleBackend = request.app.state.google_backend
    return backend


async def get_uow(request: Request) -> AsyncIterator[UnitOfWork]:
    async with UnitOfWork(request.app.state.session_factory) as uow:
        yield uow


def client_ip(request: Request, trusted_hops: int) -> str | None:
    """Client address. X-Forwarded-For is trusted only for the configured number of proxies."""
    if trusted_hops > 0:
        forwarded = [
            part.strip()
            for part in request.headers.get("x-forwarded-for", "").split(",")
            if part.strip()
        ]
        if len(forwarded) >= trusted_hops:
            return forwarded[-trusted_hops]
    return request.client.host if request.client else None


def get_request_context(
    request: Request, settings: Annotated[Settings, Depends(get_settings_dep)]
) -> RequestContext:
    agent = request.headers.get("user-agent")
    return RequestContext(
        request_id=request.scope.get("state", {}).get("request_id"),
        ip=client_ip(request, settings.trusted_proxy_hops),
        user_agent=agent[:MAX_USER_AGENT_LENGTH] if agent else None,
    )


UowDep = Annotated[UnitOfWork, Depends(get_uow)]
SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
ClockDep = Annotated[Clock, Depends(get_clock)]
ContextDep = Annotated[RequestContext, Depends(get_request_context)]


def get_token_service(uow: UowDep, settings: SettingsDep, clock: ClockDep) -> TokenService:
    return TokenService(uow, settings, clock)


def get_account_service(
    uow: UowDep,
    settings: SettingsDep,
    clock: ClockDep,
    passwords: Annotated[PasswordService, Depends(get_password_service)],
    storage: Annotated[StorageService, Depends(get_storage)],
    runner: Annotated[BackgroundRunner, Depends(get_background_runner)],
    session_factory: Annotated[async_sessionmaker[AsyncSession], Depends(get_session_factory)],
) -> AccountService:
    return AccountService(
        uow=uow,
        passwords=passwords,
        purge=PurgeService(session_factory, storage, clock),
        tokens=TokenService(uow, settings, clock),
        runner=runner,
        settings=settings,
        clock=clock,
    )


AccountServiceDep = Annotated[AccountService, Depends(get_account_service)]
LimiterDep = Annotated[RateLimiter, Depends(get_rate_limiter)]


def get_auth_controller(
    uow: UowDep,
    settings: SettingsDep,
    clock: ClockDep,
    passwords: Annotated[PasswordService, Depends(get_password_service)],
    limiter: LimiterDep,
) -> AuthController:
    tokens = TokenService(uow, settings, clock)
    return AuthController(AuthService(uow, passwords, tokens, clock), tokens, uow, limiter)


def get_account_controller(
    uow: UowDep, limiter: LimiterDep, account: AccountServiceDep
) -> AccountController:
    return AccountController(account, uow, limiter)


def get_google_controller(
    uow: UowDep,
    settings: SettingsDep,
    clock: ClockDep,
    limiter: LimiterDep,
    backend: Annotated[GoogleBackend, Depends(get_google_backend)],
) -> GoogleController:
    service = GoogleAuthService(uow, backend, TokenService(uow, settings, clock), settings, clock)
    return GoogleController(service, uow, limiter)


def get_catalog_controller(
    uow: UowDep, storage: Annotated[StorageService, Depends(get_storage)]
) -> CatalogController:
    return CatalogController(CatalogService(uow, storage.public_catalog_url))


def get_scan_queue(request: Request) -> ScanQueue:
    queue: ScanQueue = request.app.state.scan_queue
    return queue


def get_scan_controller(
    uow: UowDep,
    settings: SettingsDep,
    clock: ClockDep,
    limiter: LimiterDep,
    storage: Annotated[StorageService, Depends(get_storage)],
    queue: Annotated[ScanQueue, Depends(get_scan_queue)],
    runner: Annotated[BackgroundRunner, Depends(get_background_runner)],
    session_factory: Annotated[async_sessionmaker[AsyncSession], Depends(get_session_factory)],
) -> ScanController:
    service = ScanService(
        uow=uow,
        storage=storage,
        queue=queue,
        runner=runner,
        purge=PurgeService(session_factory, storage, clock),
        public_url=storage.public_catalog_url,
        settings=settings,
        clock=clock,
    )
    return ScanController(service, limiter, settings.max_upload_bytes)


def get_user_controller(uow: UowDep) -> UserController:
    return UserController(uow)


def get_access_claims(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: SettingsDep,
    clock: ClockDep,
) -> AccessClaims:
    """Validate the bearer token and return its claims (user, how and when they signed in)."""
    if credentials is None:
        raise AppError(ErrorCode.NOT_AUTHENTICATED)
    return decode_access_token(
        credentials.credentials,
        secret=settings.jwt_secret.get_secret_value(),
        issuer=settings.jwt_issuer,
        audience=settings.jwt_audience,
        now=clock.now(),
    )


CurrentClaims = Annotated[AccessClaims, Depends(get_access_claims)]


async def get_current_user(claims: CurrentClaims, uow: UowDep) -> User:
    """Reload the user from the token so deleted accounts stop working."""
    user = await uow.users.get(claims.user_id)
    if user is None or _issued_before_password_change(claims, user):
        raise AppError(ErrorCode.NOT_AUTHENTICATED)
    return user


def _issued_before_password_change(claims: AccessClaims, user: User) -> bool:
    """A password change ends access tokens issued before it (token times have 1 s precision)."""
    changed = user.password_changed_at
    return changed is not None and claims.issued_at < changed.replace(microsecond=0)


CurrentUser = Annotated[User, Depends(get_current_user)]
