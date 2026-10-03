"""Google sign in DTOs."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.schemas.auth import AuthSessionOut

# PKCE verifiers are 43 to 128 characters (RFC 7636).
CodeVerifier = Annotated[str, StringConstraints(min_length=43, max_length=128)]
AuthorizationCode = Annotated[str, StringConstraints(min_length=1, max_length=2048)]
Nonce = Annotated[str, StringConstraints(min_length=16, max_length=256)]
RedirectUri = Annotated[str, StringConstraints(min_length=1, max_length=2048)]


class GoogleSignInIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: AuthorizationCode
    code_verifier: CodeVerifier
    nonce: Nonce
    redirect_uri: RedirectUri


class GoogleSessionOut(AuthSessionOut):
    is_new_user: bool
    linked_existing_account: bool
