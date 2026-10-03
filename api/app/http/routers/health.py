from fastapi import APIRouter
from sqlalchemy import text

from app.core.envelope import Envelope, success_envelope
from app.core.errors import AppError, ErrorCode
from app.core.logging import get_logger
from app.http.deps import UowDep
from app.schemas.health import HealthOut

router = APIRouter(tags=["health"])
_log = get_logger("leafy.health")


@router.get("/healthz")
async def healthz() -> Envelope[HealthOut]:
    return success_envelope(HealthOut(status="ok"))


@router.get("/readyz")
async def readyz(uow: UowDep) -> Envelope[HealthOut]:
    try:
        await uow.session.execute(text("SELECT 1"))
    except Exception as exc:
        _log.error("readiness_check_failed", error_type=type(exc).__name__)
        raise AppError(ErrorCode.SERVICE_UNAVAILABLE) from exc
    return success_envelope(HealthOut(status="ready"))
