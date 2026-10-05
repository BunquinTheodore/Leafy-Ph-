from typing import Annotated

from fastapi import APIRouter, Depends

from app.controllers.account_controller import AccountController
from app.controllers.user_controller import UserController
from app.core.envelope import Envelope, success_envelope
from app.http.deps import (
    ContextDep,
    CurrentClaims,
    CurrentUser,
    get_account_controller,
    get_user_controller,
)
from app.schemas.account import (
    AccountDeletedOut,
    ChangePasswordIn,
    DeleteAccountIn,
    PasswordChangedOut,
    UpdateProfileIn,
)
from app.schemas.auth import UserOut

router = APIRouter(prefix="/users", tags=["users"])

AccountDep = Annotated[AccountController, Depends(get_account_controller)]


@router.get("/me")
async def read_me(
    user: CurrentUser, controller: Annotated[UserController, Depends(get_user_controller)]
) -> Envelope[UserOut]:
    return success_envelope(await controller.me(user))


@router.patch("/me")
async def update_me(
    payload: UpdateProfileIn, user: CurrentUser, controller: AccountDep
) -> Envelope[UserOut]:
    return success_envelope(await controller.update_profile(user, payload))


@router.post("/me/password")
async def change_password(
    payload: ChangePasswordIn,
    user: CurrentUser,
    claims: CurrentClaims,
    controller: AccountDep,
    ctx: ContextDep,
) -> Envelope[PasswordChangedOut]:
    return success_envelope(await controller.change_password(user, claims, payload, ctx))


@router.delete("/me")
async def delete_me(
    payload: DeleteAccountIn, user: CurrentUser, controller: AccountDep
) -> Envelope[AccountDeletedOut]:
    return success_envelope(await controller.delete_account(user, payload))
