"""Exception handlers that always answer with the envelope and static messages."""

from collections.abc import Mapping

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.envelope import error_envelope
from app.core.errors import ERROR_MESSAGES, AppError, ErrorCode

_STATUS_TO_CODE: Mapping[int, ErrorCode] = {
    401: ErrorCode.NOT_AUTHENTICATED,
    404: ErrorCode.NOT_FOUND,
    405: ErrorCode.METHOD_NOT_ALLOWED,
    413: ErrorCode.PAYLOAD_TOO_LARGE,
    415: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
}


def _request_id(request: Request) -> str | None:
    value = request.scope.get("state", {}).get("request_id")
    return str(value) if value else None


def _respond(
    request: Request,
    *,
    status_code: int,
    code: ErrorCode,
    details: list[dict[str, object]] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    body = error_envelope(
        code.value,
        ERROR_MESSAGES[code],
        details=details,
        request_id=_request_id(request),
    )
    return JSONResponse(status_code=status_code, content=body, headers=dict(headers or {}))


async def _handle_app_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    return _respond(
        request,
        status_code=exc.status_code,
        code=exc.code,
        details=exc.details,
        headers=exc.headers,
    )


async def _handle_http_exception(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    code = _STATUS_TO_CODE.get(exc.status_code, ErrorCode.INTERNAL_ERROR)
    status_code = exc.status_code if exc.status_code in _STATUS_TO_CODE else 500
    return _respond(request, status_code=status_code, code=code)


async def _handle_validation_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    # Only the field path and rule type go back: never the submitted value or message text.
    details: list[dict[str, object]] = [
        {"field": ".".join(str(part) for part in error["loc"][1:]), "type": error["type"]}
        for error in exc.errors()
    ]
    return _respond(request, status_code=422, code=ErrorCode.VALIDATION_ERROR, details=details)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _handle_app_error)
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
