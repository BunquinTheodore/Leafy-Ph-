"""Application factory. Run with: uvicorn app.main:create_app --factory"""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.background import BackgroundRunner
from app.core.clock import Clock, SystemClock
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.core.ratelimit import RateLimiter
from app.core.security import PasswordService
from app.db.session import create_engine, create_session_factory
from app.http.exception_handlers import register_exception_handlers
from app.http.middleware import (
    MaxBodySizeMiddleware,
    RequestIdMiddleware,
    SecurityHeadersMiddleware,
)
from app.http.routers import api_router, mock_google
from app.services.email_service import EmailService
from app.services.infra.email_service import EmailSender, SmtpEmailSender
from app.services.infra.google_client import GoogleBackend, HttpGoogleBackend
from app.services.infra.google_mock import MOCK_CLIENT_ID, MockGoogleProvider
from app.services.infra.storage_service import S3StorageService, StorageService
from app.services.ml.base import MLInferenceService
from app.services.ml.factory import create_ml_service
from app.services.scan_janitor import ScanJanitor
from app.services.scan_worker import InProcessScanQueue, ScanProcessor

API_PREFIX = "/api/v1"


def _google_backend(settings: Settings, clock: Clock) -> GoogleBackend:
    if settings.google_mock:
        return MockGoogleProvider(clock, client_id=settings.google_client_id or MOCK_CLIENT_ID)
    return HttpGoogleBackend(settings, clock)


def create_app(
    settings: Settings | None = None,
    *,
    clock: Clock | None = None,
    email_sender: EmailSender | None = None,
    storage: StorageService | None = None,
    google_backend: GoogleBackend | None = None,
    ml_service: MLInferenceService | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    engine = create_engine(settings.database_url, null_pool=settings.env == "test")
    active_clock = clock or SystemClock()
    background = BackgroundRunner()
    backend = google_backend or _google_backend(settings, active_clock)
    session_factory = create_session_factory(engine)
    active_storage = storage or S3StorageService(settings)
    ml = ml_service or create_ml_service(settings.ml_service, environment=settings.env)
    scan_queue = InProcessScanQueue(
        ScanProcessor(session_factory, active_storage, ml, settings), settings.scan_workers
    )
    janitor = ScanJanitor(
        session_factory, active_clock, stuck_after_seconds=settings.scan_stuck_seconds
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        janitor_task = asyncio.create_task(
            janitor.run_forever(settings.scan_janitor_interval_seconds), name="scan-janitor"
        )
        yield
        janitor_task.cancel()
        await asyncio.gather(janitor_task, return_exceptions=True)
        await scan_queue.close()
        await background.drain()
        if isinstance(backend, HttpGoogleBackend):
            await backend.aclose()
        await engine.dispose()

    app = FastAPI(
        title="Leafy API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if settings.env == "prod" else "/docs",
        redoc_url=None,
        openapi_url=None if settings.env == "prod" else "/openapi.json",
    )
    app.state.settings = settings
    app.state.clock = active_clock
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.passwords = PasswordService(
        settings.argon2_time_cost, settings.argon2_memory_kib, settings.argon2_parallelism
    )
    app.state.rate_limiter = RateLimiter(active_clock, enabled=settings.rate_limit_enabled)
    app.state.ml_service = ml
    app.state.scan_queue = scan_queue
    app.state.background = background
    app.state.email_service = EmailService(email_sender or SmtpEmailSender(settings), settings)
    app.state.storage = active_storage
    app.state.google_backend = backend

    # add_middleware puts the newest outermost: security headers, then request id, then size cap.
    app.add_middleware(MaxBodySizeMiddleware, max_bytes=settings.max_upload_bytes + 64 * 1024)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.env == "prod")
    register_exception_handlers(app)
    app.include_router(api_router, prefix=API_PREFIX)
    if settings.google_mock:
        app.include_router(mock_google.router, prefix=API_PREFIX)
    return app
