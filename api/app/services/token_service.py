"""Access and refresh token lifecycle: issue, rotate with reuse detection, revoke."""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core.clock import Clock
from app.core.config import Settings
from app.core.context import RequestContext
from app.core.errors import AppError, ErrorCode
from app.core.logging import get_logger
from app.core.security import encode_access_token, generate_opaque_token, sha256_hex
from app.db.uow import UnitOfWork

REASON_LOGOUT = "logout"
REASON_REUSE = "reuse_detected"
REASON_PASSWORD_CHANGE = "password_change"  # noqa: S105 - reason label, not a secret

_log = get_logger("leafy.tokens")


@dataclass(frozen=True)
class IssuedSession:
    access_token: str
    refresh_token: str
    expires_in: int
    refresh_expires_at: datetime


@dataclass(frozen=True)
class RefreshResult:
    access_token: str
    expires_in: int
    refresh_token: str | None
    refresh_expires_at: datetime | None


class TokenService:
    def __init__(self, uow: UnitOfWork, settings: Settings, clock: Clock) -> None:
        self._uow = uow
        self._settings = settings
        self._clock = clock

    def _access_token(self, user_id: uuid.UUID, now: datetime) -> str:
        return encode_access_token(
            user_id=user_id,
            secret=self._settings.jwt_secret.get_secret_value(),
            issuer=self._settings.jwt_issuer,
            audience=self._settings.jwt_audience,
            now=now,
            ttl_seconds=self._settings.access_token_ttl_seconds,
        )

    async def _insert_refresh_token(
        self,
        *,
        user_id: uuid.UUID,
        family_id: uuid.UUID,
        family_expires_at: datetime,
        now: datetime,
        ctx: RequestContext,
    ) -> tuple[str, uuid.UUID, datetime]:
        raw = generate_opaque_token()
        token_id = uuid.uuid4()
        expires_at = min(
            now + timedelta(days=self._settings.refresh_token_ttl_days), family_expires_at
        )
        await self._uow.refresh_tokens.add(
            token_id=token_id,
            user_id=user_id,
            family_id=family_id,
            token_hash=sha256_hex(raw),
            created_at=now,
            expires_at=expires_at,
            family_expires_at=family_expires_at,
            ip=ctx.ip,
            user_agent=ctx.user_agent,
        )
        return raw, token_id, expires_at

    async def issue_session(self, user_id: uuid.UUID, ctx: RequestContext) -> IssuedSession:
        """Start a new token family. The caller commits."""
        now = self._clock.now()
        family_expires_at = now + timedelta(days=self._settings.refresh_family_max_days)
        raw, _, expires_at = await self._insert_refresh_token(
            user_id=user_id,
            family_id=uuid.uuid4(),
            family_expires_at=family_expires_at,
            now=now,
            ctx=ctx,
        )
        return IssuedSession(
            access_token=self._access_token(user_id, now),
            refresh_token=raw,
            expires_in=self._settings.access_token_ttl_seconds,
            refresh_expires_at=expires_at,
        )

    async def refresh(self, raw_token: str, ctx: RequestContext) -> RefreshResult:
        """Rotate a refresh token. Commits on every outcome that changes state."""
        row = await self._uow.refresh_tokens.get_by_hash_for_update(sha256_hex(raw_token))
        now = self._clock.now()
        if row is None or row.revoked_at is not None:
            raise AppError(ErrorCode.REFRESH_INVALID)
        if row.expires_at <= now or row.family_expires_at <= now:
            raise AppError(ErrorCode.REFRESH_INVALID)

        if row.rotated_at is not None:
            return await self._handle_rotated(row.rotated_at, row.family_id, row.user_id, now)

        user = await self._uow.users.get(row.user_id)
        if user is None:
            raise AppError(ErrorCode.REFRESH_INVALID)
        raw, new_id, expires_at = await self._insert_refresh_token(
            user_id=row.user_id,
            family_id=row.family_id,
            family_expires_at=row.family_expires_at,
            now=now,
            ctx=ctx,
        )
        await self._uow.refresh_tokens.mark_rotated(row.id, rotated_at=now, replaced_by=new_id)
        await self._uow.commit()
        return RefreshResult(
            access_token=self._access_token(row.user_id, now),
            expires_in=self._settings.access_token_ttl_seconds,
            refresh_token=raw,
            refresh_expires_at=expires_at,
        )

    async def _handle_rotated(
        self, rotated_at: datetime, family_id: uuid.UUID, user_id: uuid.UUID, now: datetime
    ) -> RefreshResult:
        grace = timedelta(seconds=self._settings.refresh_grace_seconds)
        if now - rotated_at <= grace:
            # A concurrent refresh already rotated this token: hand out access only.
            if await self._uow.users.get(user_id) is None:
                raise AppError(ErrorCode.REFRESH_INVALID)
            return RefreshResult(
                access_token=self._access_token(user_id, now),
                expires_in=self._settings.access_token_ttl_seconds,
                refresh_token=None,
                refresh_expires_at=None,
            )
        await self._uow.refresh_tokens.revoke_family(family_id, at=now, reason=REASON_REUSE)
        # Persist the revocation before raising, otherwise the rollback would undo it.
        await self._uow.commit()
        _log.warning("refresh_reuse_detected", user_id=str(user_id), family_id=str(family_id))
        raise AppError(ErrorCode.REFRESH_REUSE_DETECTED)

    async def revoke_by_token(self, raw_token: str) -> None:
        """Revoke the family of a presented token. Unknown tokens are a no-op (idempotent)."""
        row = await self._uow.refresh_tokens.get_by_hash(sha256_hex(raw_token))
        if row is not None:
            await self._uow.refresh_tokens.revoke_family(
                row.family_id, at=self._clock.now(), reason=REASON_LOGOUT
            )
        await self._uow.commit()

    async def revoke_all_for_user(self, user_id: uuid.UUID, reason: str) -> int:
        """Revoke every family of a user. Does not commit, so it can join a larger transaction."""
        return await self._uow.refresh_tokens.revoke_all_for_user(
            user_id, at=self._clock.now(), reason=reason
        )
