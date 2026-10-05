"""Password hashing (argon2id), access JWTs, opaque tokens and sha256."""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

import jwt
from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.errors import AppError, ErrorCode

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TYPE = "access"  # noqa: S105 - claim value, not a secret
AUTH_METHOD_PASSWORD = "password"  # noqa: S105 - label, not a secret
AUTH_METHOD_GOOGLE = "google"
OPAQUE_TOKEN_BYTES = 32
_DUMMY_PASSWORD = "dummy-password-used-only-for-timing"  # noqa: S105


class PasswordService:
    """argon2id hashing. Verifying against a missing hash still costs one real verification."""

    def __init__(self, time_cost: int, memory_kib: int, parallelism: int) -> None:
        self._hasher = PasswordHasher(
            time_cost=time_cost,
            memory_cost=memory_kib,
            parallelism=parallelism,
            type=Type.ID,
        )
        self._dummy_hash = self._hasher.hash(_DUMMY_PASSWORD)

    def hash(self, password: str) -> str:
        return self._hasher.hash(password)

    def verify(self, password: str, password_hash: str | None) -> bool:
        """Return True only for a matching hash. Never raises; a None hash burns equal time."""
        target = password_hash if password_hash else self._dummy_hash
        try:
            matched = self._hasher.verify(target, password)
        except (VerificationError, InvalidHashError):
            return False
        return matched and password_hash is not None

    def needs_rehash(self, password_hash: str) -> bool:
        return self._hasher.check_needs_rehash(password_hash)


@dataclass(frozen=True)
class AccessClaims:
    user_id: uuid.UUID
    issued_at: datetime
    expires_at: datetime
    auth_method: str = AUTH_METHOD_PASSWORD
    auth_time: datetime | None = None


def encode_access_token(
    *,
    user_id: uuid.UUID,
    secret: str,
    issuer: str,
    audience: str,
    now: datetime,
    ttl_seconds: int,
    auth_method: str = AUTH_METHOD_PASSWORD,
    auth_time: datetime | None = None,
) -> str:
    """Sign an access token. `auth_method` and `auth_time` say how and when the user signed in."""
    claims = {
        "sub": str(user_id),
        "iss": issuer,
        "aud": audience,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl_seconds)).timestamp()),
        "typ": ACCESS_TOKEN_TYPE,
        "jti": uuid.uuid4().hex,
        "auth_method": auth_method,
        "auth_time": int((auth_time or now).timestamp()),
    }
    return jwt.encode(claims, secret, algorithm=JWT_ALGORITHM)


def decode_access_token(
    token: str, *, secret: str, issuer: str, audience: str, now: datetime
) -> AccessClaims:
    """Validate signature, issuer, audience, type and expiry against the injected clock."""
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],
            audience=audience,
            issuer=issuer,
            options={"require": ["exp", "iat", "sub", "iss", "aud"], "verify_exp": False},
        )
        if claims.get("typ") != ACCESS_TOKEN_TYPE:
            raise AppError(ErrorCode.INVALID_TOKEN)
        expires_at = datetime.fromtimestamp(int(claims["exp"]), tz=now.tzinfo)
        if expires_at <= now:
            raise AppError(ErrorCode.TOKEN_EXPIRED)
        return AccessClaims(
            user_id=uuid.UUID(str(claims["sub"])),
            issued_at=datetime.fromtimestamp(int(claims["iat"]), tz=now.tzinfo),
            expires_at=expires_at,
            auth_method=_auth_method(claims),
            auth_time=_auth_time(claims, now),
        )
    except (jwt.InvalidTokenError, ValueError, TypeError) as exc:
        raise AppError(ErrorCode.INVALID_TOKEN) from exc


def _auth_method(claims: dict[str, object]) -> str:
    method = claims.get("auth_method")
    return method if method == AUTH_METHOD_GOOGLE else AUTH_METHOD_PASSWORD


def _auth_time(claims: dict[str, object], now: datetime) -> datetime | None:
    raw = claims.get("auth_time")
    if raw is None:
        return None
    return datetime.fromtimestamp(int(str(raw)), tz=now.tzinfo)


def generate_opaque_token() -> str:
    return secrets.token_urlsafe(OPAQUE_TOKEN_BYTES)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
