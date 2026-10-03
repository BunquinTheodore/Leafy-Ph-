"""Response envelope: {success, data, error:{code, message, details, request_id}}."""

from typing import Any

from pydantic import BaseModel


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[dict[str, Any]] | None = None
    request_id: str | None = None


class Envelope[T](BaseModel):
    success: bool
    data: T | None = None
    error: ErrorBody | None = None


def success_envelope[T](data: T) -> Envelope[T]:
    return Envelope[T](success=True, data=data, error=None)


def error_envelope(
    code: str,
    message: str,
    *,
    details: list[dict[str, Any]] | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    body = ErrorBody(code=code, message=message, details=details, request_id=request_id)
    return {"success": False, "data": None, "error": body.model_dump()}
