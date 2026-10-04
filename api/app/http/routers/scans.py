"""Private scan endpoints. Every route needs a signed in user and is scoped to that user."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile

from app.controllers.scan_controller import ScanController
from app.core.envelope import Envelope, success_envelope
from app.db.models import ScanStatus, ScanVerdict
from app.http.deps import CurrentUser, get_scan_controller
from app.schemas.scan import (
    ScanCreatedOut,
    ScanDeletedOut,
    ScanDetailOut,
    ScanFeedbackIn,
    ScanFeedbackOut,
    ScanListOut,
    ScanStatsOut,
)

router = APIRouter(prefix="/scans", tags=["scans"])

ControllerDep = Annotated[ScanController, Depends(get_scan_controller)]
ScanId = uuid.UUID
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 50
MAX_CURSOR_LENGTH = 300


@router.post("", status_code=202)
async def create_scan(
    user: CurrentUser, controller: ControllerDep, image: Annotated[UploadFile, File()]
) -> Envelope[ScanCreatedOut]:
    return success_envelope(await controller.create(user, image))


@router.get("")
async def list_scans(
    user: CurrentUser,
    controller: ControllerDep,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    cursor: Annotated[str | None, Query(max_length=MAX_CURSOR_LENGTH)] = None,
    status: ScanStatus | None = None,
    verdict: ScanVerdict | None = None,
    plant: Annotated[str | None, Query(max_length=80)] = None,
) -> Envelope[ScanListOut]:
    return success_envelope(
        await controller.list(
            user, limit=limit, cursor=cursor, status=status, verdict=verdict, plant=plant
        )
    )


@router.get("/stats")
async def scan_stats(user: CurrentUser, controller: ControllerDep) -> Envelope[ScanStatsOut]:
    return success_envelope(await controller.stats(user))


@router.get("/{scan_id}")
async def read_scan(
    scan_id: ScanId, user: CurrentUser, controller: ControllerDep
) -> Envelope[ScanDetailOut]:
    return success_envelope(await controller.get(user, scan_id))


@router.delete("/{scan_id}")
async def delete_scan(
    scan_id: ScanId, user: CurrentUser, controller: ControllerDep
) -> Envelope[ScanDeletedOut]:
    return success_envelope(await controller.delete(user, scan_id))


@router.post("/{scan_id}/retry", status_code=202)
async def retry_scan(
    scan_id: ScanId, user: CurrentUser, controller: ControllerDep
) -> Envelope[ScanCreatedOut]:
    return success_envelope(await controller.retry(user, scan_id))


@router.put("/{scan_id}/feedback")
async def put_feedback(
    scan_id: ScanId, payload: ScanFeedbackIn, user: CurrentUser, controller: ControllerDep
) -> Envelope[ScanFeedbackOut]:
    return success_envelope(await controller.put_feedback(user, scan_id, payload))


@router.delete("/{scan_id}/feedback")
async def delete_feedback(
    scan_id: ScanId, user: CurrentUser, controller: ControllerDep
) -> Envelope[ScanDeletedOut]:
    return success_envelope(await controller.delete_feedback(user, scan_id))
