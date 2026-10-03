from typing import Annotated

from fastapi import APIRouter, Depends

from app.controllers.account_controller import AccountController
from app.controllers.auth_controller import AuthController
from app.controllers.google_controller import GoogleController
from app.core.envelope import Envelope, success_envelope
from app.http.deps import (
    ContextDep,
    CurrentUser,
    get_account_controller,
    get_auth_controller,
    get_google_controller,
)
from app.schemas.account import (
    ForgotPasswordIn,
    PasswordResetOut,
    ResetPasswordIn,
    SentOut,
    VerifiedOut,
    VerifyEmailIn,
)
from app.schemas.auth import (
    AuthSessionOut,
    LoginIn,
    LogoutOut,
    RefreshIn,
    RefreshOut,
    RegisterIn,
)
from app.schemas.google import GoogleSessionOut, GoogleSignInIn

router = APIRouter(prefix="/auth", tags=["auth"])

ControllerDep = Annotated[AuthController, Depends(get_auth_controller)]
AccountDep = Annotated[AccountController, Depends(get_account_controller)]
GoogleDep = Annotated[GoogleController, Depends(get_google_controller)]


@router.post("/register", status_code=201)
async def register(
    payload: RegisterIn, ctx: ContextDep, controller: ControllerDep
) -> Envelope[AuthSessionOut]:
    return success_envelope(await controller.register(payload, ctx))


@router.post("/login")
async def login(
    payload: LoginIn, ctx: ContextDep, controller: ControllerDep
) -> Envelope[AuthSessionOut]:
    return success_envelope(await controller.login(payload, ctx))


@router.post("/refresh")
async def refresh(
    payload: RefreshIn, ctx: ContextDep, controller: ControllerDep
) -> Envelope[RefreshOut]:
    return success_envelope(await controller.refresh(payload, ctx))


@router.post("/logout")
async def logout(payload: RefreshIn, controller: ControllerDep) -> Envelope[LogoutOut]:
    return success_envelope(await controller.logout(payload))


@router.post("/verify-email")
async def verify_email(
    payload: VerifyEmailIn, ctx: ContextDep, controller: AccountDep
) -> Envelope[VerifiedOut]:
    return success_envelope(await controller.verify_email(payload, ctx))


@router.post("/resend-verification")
async def resend_verification(user: CurrentUser, controller: AccountDep) -> Envelope[SentOut]:
    return success_envelope(await controller.resend_verification(user))


@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordIn, ctx: ContextDep, controller: AccountDep
) -> Envelope[SentOut]:
    return success_envelope(await controller.forgot_password(payload, ctx))


@router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordIn, ctx: ContextDep, controller: AccountDep
) -> Envelope[PasswordResetOut]:
    return success_envelope(await controller.reset_password(payload, ctx))


@router.post("/google")
async def google_sign_in(
    payload: GoogleSignInIn, ctx: ContextDep, controller: GoogleDep
) -> Envelope[GoogleSessionOut]:
    return success_envelope(await controller.sign_in(payload, ctx))
