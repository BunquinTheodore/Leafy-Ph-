"""Entity to DTO mapping."""

from app.db.models import User
from app.schemas.auth import UserOut

PASSWORD_METHOD = "password"  # noqa: S105 - label shown to the UI, not a secret


def auth_methods(user: User, providers: list[str]) -> list[str]:
    methods = [PASSWORD_METHOD] if user.password_hash else []
    return [*methods, *providers]


def to_user_out(user: User, providers: list[str]) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        email_verified=user.email_verified_at is not None,
        email_verified_at=user.email_verified_at,
        created_at=user.created_at,
        auth_methods=auth_methods(user, providers),
    )
