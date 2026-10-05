"""Account DTOs."""

from datetime import datetime
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.password_policy import password_policy_violation
from app.schemas.auth import PersonName


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _NewPasswordMixin(_StrictModel):
    new_password: str = Field(max_length=256, repr=False)

    @model_validator(mode="after")
    def _check_policy(self) -> Self:
        # The email is not known here; the service repeats the check with it.
        reason = password_policy_violation(self.new_password)
        if reason is not None:
            raise ValueError(reason)
        return self


class UpdateProfileIn(_StrictModel):
    first_name: Annotated[PersonName, Field(min_length=1)] | None = None
    last_name: PersonName | None = None

    @model_validator(mode="after")
    def _require_a_change(self) -> Self:
        if self.first_name is None and self.last_name is None:
            raise ValueError("nothing_to_update")
        return self


class ChangePasswordIn(_NewPasswordMixin):
    current_password: str | None = Field(default=None, max_length=256, repr=False)


class DeleteAccountIn(_StrictModel):
    password: str | None = Field(default=None, max_length=256, repr=False)
    confirmation: str | None = Field(default=None, max_length=20)


class PasswordChangedOut(BaseModel):
    """Every older session is revoked, so the caller continues on this fresh one."""

    changed: bool = True
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105 - OAuth token type label
    expires_in: int
    refresh_expires_at: datetime


class AccountDeletedOut(BaseModel):
    deleted: bool = True
