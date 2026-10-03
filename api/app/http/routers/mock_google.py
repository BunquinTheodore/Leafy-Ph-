"""Mock Google endpoints for local development. Mounted only when GOOGLE_MOCK=1.

`/authorize` plays the account picker (it approves the email in the query), `/token` is the
token endpoint and `/jwks` publishes the signing key. Redirects go only to the configured
GOOGLE_REDIRECT_URI.
"""

from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Form, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse

from app.core.errors import AppError, ErrorCode
from app.services.infra.google_client import GoogleBackendError
from app.services.infra.google_mock import MockGoogleProvider

router = APIRouter(prefix="/mock-google", tags=["mock-google"], include_in_schema=False)


def _provider(request: Request) -> MockGoogleProvider:
    provider = request.app.state.google_backend
    if not isinstance(provider, MockGoogleProvider):
        raise AppError(ErrorCode.NOT_FOUND)
    return provider


@router.get("/authorize")
async def authorize(
    request: Request,
    redirect_uri: Annotated[str, Query(max_length=2048)],
    state: Annotated[str, Query(max_length=512)],
    nonce: Annotated[str, Query(max_length=512)],
    email: Annotated[str, Query(max_length=254)] = "dev@example.com",
    code_challenge: Annotated[str | None, Query(max_length=128)] = None,
    email_verified: bool = True,
) -> RedirectResponse:
    allowed = request.app.state.settings.google_redirect_uri
    if redirect_uri != allowed:
        raise AppError(ErrorCode.INVALID_STATE)
    code = _provider(request).create_code(
        email=email,
        nonce=nonce,
        code_challenge=code_challenge,
        redirect_uri=redirect_uri,
        email_verified=email_verified,
    )
    return RedirectResponse(
        f"{allowed}?{urlencode({'code': code, 'state': state})}", status_code=302
    )


@router.post("/token")
async def token(
    request: Request,
    code: Annotated[str, Form()],
    redirect_uri: Annotated[str, Form()],
    code_verifier: Annotated[str, Form()] = "",
) -> JSONResponse:
    try:
        id_token = await _provider(request).exchange_code(
            code=code, code_verifier=code_verifier, redirect_uri=redirect_uri
        )
    except GoogleBackendError:
        return JSONResponse({"error": "invalid_grant"}, status_code=400)
    return JSONResponse({"id_token": id_token, "token_type": "Bearer"})


@router.get("/jwks")
async def jwks(request: Request) -> JSONResponse:
    return JSONResponse({"keys": [_provider(request).jwk()]})
