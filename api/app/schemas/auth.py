"""Auth request and response DTOs."""

import re
import uuid
from datetime import datetime
from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from app.core.password_policy import password_policy_violation

MAX_EMAIL_LENGTH = 254
_EMAIL_PATTERN = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")


def _normalize_email(value: str) -> str:
    candidate = value.strip().lower()
    if len(candidate) > MAX_EMAIL_LENGTH or not _EMAIL_PATTERN.match(candidate):
        raise ValueError("invalid_email")
    return candidate


EmailAddress = Annotated[str, AfterValidator(_normalize_email)]
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]
RefreshTokenValue = Annotated[str, StringConstraints(min_length=20, max_length=256)]


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class RegisterIn(_StrictModel):
    email: EmailAddress
    password: str = Field(max_length=256, repr=False)
    first_name: Annotated[PersonName, Field(min_length=1)]
    last_name: PersonName = ""

    @model_validator(mode="after")
    def _check_password_policy(self) -> Self:
        reason = password_policy_violation(self.password, self.email)
        if reason is not None:
            raise ValueError(reason)
        return self


class LoginIn(_StrictModel):
    email: EmailAddress
    password: str = Field(min_length=1, max_length=128, repr=False)


class RefreshIn(_StrictModel):
    refresh_token: RefreshTokenValue


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    email_verified: bool
    email_verified_at: datetime | None
    created_at: datetime
    auth_methods: list[str]


class AuthSessionOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105 - OAuth token type label
    expires_in: int
    refresh_expires_at: datetime
    user: UserOut


class RefreshOut(BaseModel):
    access_token: str
    # None when the presented token was already rotated inside the grace window.
    refresh_token: str | None
    token_type: str = "bearer"  # noqa: S105 - OAuth token type label
    expires_in: int
    refresh_expires_at: datetime | None


class LogoutOut(BaseModel):
    revoked: bool = True
