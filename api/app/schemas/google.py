"""Google sign in DTOs."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.schemas.auth import AuthSessionOut

# Firebase ID tokens are about 1 KB; the cap only bounds abuse.
FirebaseIdToken = Annotated[str, StringConstraints(min_length=1, max_length=8192)]


class GoogleSignInIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id_token: FirebaseIdToken


class GoogleSessionOut(AuthSessionOut):
    is_new_user: bool
    linked_existing_account: bool
