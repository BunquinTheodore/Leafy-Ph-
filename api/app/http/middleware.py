"""Pure ASGI middleware: request id and error boundary, security headers, body size cap."""

import json
import re
import uuid
from typing import Any

from fastapi import HTTPException
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.envelope import error_envelope
from app.core.errors import ERROR_MESSAGES, ERROR_STATUS, ErrorCode
from app.core.logging import get_logger, request_id_var

REQUEST_ID_HEADER = "X-Request-Id"
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")
_log = get_logger("leafy.http")


def _json_body(status: ErrorCode, request_id: str | None) -> bytes:
    payload = error_envelope(status.value, ERROR_MESSAGES[status], request_id=request_id)
    return json.dumps(payload).encode("utf-8")


async def _send_error(send: Send, code: ErrorCode, request_id: str | None) -> None:
    body = _json_body(code, request_id)
    headers = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(body)).encode("ascii")),
    ]
    await send({"type": "http.response.start", "status": ERROR_STATUS[code], "headers": headers})
    await send({"type": "http.response.body", "body": body})


class RequestIdMiddleware:
    """Assign X-Request-Id and turn any unhandled exception into the 500 envelope."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        inbound = Headers(scope=scope).get(REQUEST_ID_HEADER, "")
        request_id = inbound if _REQUEST_ID_PATTERN.match(inbound) else uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        token = request_id_var.set(request_id)
        started = False

        async def send_with_id(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        except Exception:
            _log.exception("unhandled_exception", path=scope.get("path"))
            if started:
                raise
            await _send_error(send_with_id, ErrorCode.INTERNAL_ERROR, request_id)
        finally:
            request_id_var.reset(token)


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, *, hsts: bool = False) -> None:
        self.app = app
        self._hsts = hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        is_docs = scope.get("path", "").startswith(_DOCS_PATHS)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["X-Content-Type-Options"] = "nosniff"
                headers["Referrer-Policy"] = "no-referrer"
                headers["X-Frame-Options"] = "DENY"
                if "cache-control" not in headers:
                    headers["Cache-Control"] = "no-store"
                if not is_docs:
                    headers["Content-Security-Policy"] = (
                        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
                    )
                if self._hsts:
                    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
            await send(message)

        await self.app(scope, receive, send_with_headers)


class MaxBodySizeMiddleware:
    """Reject bodies over the limit: by Content-Length up front, and while streaming."""

    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        self.app = app
        self._max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = Headers(scope=scope).get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > self._max_bytes:
            request_id = scope.get("state", {}).get("request_id")
            await _send_error(send, ErrorCode.PAYLOAD_TOO_LARGE, request_id)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message: dict[str, Any] = dict(await receive())
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self._max_bytes:
                    # HTTPException passes through FastAPI's body parsing and maps to 413.
                    raise HTTPException(status_code=413)
            return message

        await self.app(scope, limited_receive, send)
