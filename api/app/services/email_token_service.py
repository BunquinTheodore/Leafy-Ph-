"""Single use email tokens (verify and reset). Only the sha256 of a token is stored."""

import math
import uuid
from datetime import timedelta

from app.core.clock import Clock
from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.core.security import generate_opaque_token, sha256_hex
from app.db.models import AuthTokenType
from app.db.uow import UnitOfWork

MAX_TOKEN_LENGTH = 512


class EmailTokenService:
    def __init__(self, uow: UnitOfWork, settings: Settings, clock: Clock) -> None:
        self._uow = uow
        self._settings = settings
        self._clock = clock

    def _ttl(self, token_type: AuthTokenType) -> timedelta:
        if token_type is AuthTokenType.VERIFY_EMAIL:
            return timedelta(hours=self._settings.verify_email_ttl_hours)
        return timedelta(hours=self._settings.reset_password_ttl_hours)

    async def issue(self, user_id: uuid.UUID, token_type: AuthTokenType) -> str:
        """Create a token and retire older unused ones. The caller commits."""
        now = self._clock.now()
        await self._uow.auth_tokens.invalidate_unused(
            user_id=user_id, token_type=token_type, now=now
        )
        raw = generate_opaque_token()
        await self._uow.auth_tokens.add(
            user_id=user_id,
            token_type=token_type,
            token_hash=sha256_hex(raw),
            expires_at=now + self._ttl(token_type),
            created_at=now,
        )
        return raw

    async def consume(self, raw_token: str, token_type: AuthTokenType) -> uuid.UUID:
        """Atomically use a token. Unknown, used, expired and wrong type all look the same.

        The caller commits; a rollback therefore also un-uses the token.
        """
        if not raw_token or len(raw_token) > MAX_TOKEN_LENGTH:
            raise AppError(ErrorCode.TOKEN_INVALID_OR_EXPIRED)
        user_id = await self._uow.auth_tokens.consume(
            token_hash=sha256_hex(raw_token), token_type=token_type, now=self._clock.now()
        )
        if user_id is None:
            raise AppError(ErrorCode.TOKEN_INVALID_OR_EXPIRED)
        return user_id

    async def seconds_until_resend(self, user_id: uuid.UUID, token_type: AuthTokenType) -> int:
        """Remaining cooldown before another token may be issued; 0 when allowed."""
        last = await self._uow.auth_tokens.latest_created_at(user_id=user_id, token_type=token_type)
        if last is None:
            return 0
        wait = timedelta(seconds=self._settings.verify_resend_cooldown_seconds)
        remaining = (last + wait) - self._clock.now()
        return max(0, math.ceil(remaining.total_seconds()))
