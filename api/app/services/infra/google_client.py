"""Fetches Firebase's public signing certificates, cached per Cache-Control.

Firebase ID tokens are RS256 JWTs signed by Google. The matching public keys are published as
x509 certificates keyed by `kid`. No Admin SDK, service account or client secret is involved.
"""

import asyncio
import re
from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any, Protocol

import httpx
from cryptography import x509
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey

from app.core.clock import Clock
from app.core.logging import get_logger

FIREBASE_CERTS_URL = (
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
)
DEFAULT_CERTS_TTL_SECONDS = 3600
MIN_CERTS_TTL_SECONDS = 60
MAX_CERTS_TTL_SECONDS = 86_400
FORCED_REFRESH_INTERVAL_SECONDS = 30
FAILURE_BACKOFF_SECONDS = 60
MAX_STALE_SECONDS = 86_400
HTTP_TIMEOUT_SECONDS = 10.0

SECURETOKEN_ISSUER_PREFIX = "https://securetoken.google.com/"

SigningKey = RSAPublicKey | str
SigningKeys = Mapping[str, SigningKey]
REAL_ALGORITHM = "RS256"

_MAX_AGE = re.compile(r"max-age=(\d+)")
_log = get_logger("leafy.google")


class GoogleBackendError(Exception):
    """The certificates could not be fetched. Details are logged, not returned."""


class GoogleBackend(Protocol):
    algorithm: str
    """The only JWT algorithm this backend's keys may verify (RS256 for real Firebase)."""

    async def signing_keys(self, *, force_refresh: bool = False) -> SigningKeys:
        """Return the public keys by kid. `force_refresh` asks for a fresh copy (rate limited)."""
        ...


def issuer_for(project_id: str) -> str:
    """The `iss` claim Firebase puts in ID tokens of this project."""
    return f"{SECURETOKEN_ISSUER_PREFIX}{project_id}"


def certs_ttl_seconds(cache_control: str | None) -> int:
    """Cache lifetime from the response header, clamped to a sane range."""
    match = _MAX_AGE.search(cache_control or "")
    ttl = int(match.group(1)) if match else DEFAULT_CERTS_TTL_SECONDS
    return max(MIN_CERTS_TTL_SECONDS, min(MAX_CERTS_TTL_SECONDS, ttl))


def _parse_certificates(payload: object) -> dict[str, RSAPublicKey]:
    if not isinstance(payload, dict):
        return {}
    keys: dict[str, RSAPublicKey] = {}
    for kid, pem in payload.items():
        if not isinstance(kid, str) or not isinstance(pem, str):
            continue
        try:
            public = x509.load_pem_x509_certificate(pem.encode("ascii")).public_key()
        except (ValueError, UnicodeEncodeError):
            _log.warning("firebase_certificate_unreadable", kid=kid)
            continue
        if isinstance(public, RSAPublicKey):
            keys[kid] = public
    return keys


class HttpGoogleBackend:
    """Real Google over HTTPS with cached certificates."""

    algorithm = REAL_ALGORITHM

    def __init__(self, clock: Clock, client: httpx.AsyncClient | None = None):
        self._clock = clock
        self._client = client
        self._keys: dict[str, RSAPublicKey] = {}
        self._fetched_at: datetime | None = None
        self._expires_at: datetime | None = None
        self._retry_after: datetime | None = None
        self._last_forced: datetime | None = None
        self._lock = asyncio.Lock()

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def signing_keys(self, *, force_refresh: bool = False) -> SigningKeys:
        now = self._clock.now()
        self._drop_keys_past_max_stale(now)
        if self._is_fresh(now) and not force_refresh:
            return self._keys
        if force_refresh:
            if self._forced_too_recently(now):
                return self._cached_or_raise()
            self._last_forced = now
        if self._backing_off(now):
            return self._cached_or_raise()
        async with self._lock:
            now = self._clock.now()
            # Another caller may have refreshed (or failed) while this one waited for the lock.
            if (self._is_fresh(now) and not force_refresh) or self._backing_off(now):
                return self._cached_or_raise()
            return await self._fetch(now)

    def _is_fresh(self, now: datetime) -> bool:
        return self._expires_at is not None and now < self._expires_at

    def _backing_off(self, now: datetime) -> bool:
        return self._retry_after is not None and now < self._retry_after

    def _drop_keys_past_max_stale(self, now: datetime) -> None:
        """A key that could not be refreshed for a day is no longer trusted."""
        if self._fetched_at is None:
            return
        if now - self._fetched_at > timedelta(seconds=MAX_STALE_SECONDS):
            self._keys = {}
            self._fetched_at = None
            self._expires_at = None

    def _cached_or_raise(self) -> SigningKeys:
        if not self._keys:
            raise GoogleBackendError("certificates unavailable")
        return self._keys

    def _forced_too_recently(self, now: datetime) -> bool:
        if self._last_forced is None:
            return False
        return now - self._last_forced < timedelta(seconds=FORCED_REFRESH_INTERVAL_SECONDS)

    async def _fetch(self, now: datetime) -> SigningKeys:
        try:
            response = await self._http().get(FIREBASE_CERTS_URL)
            response.raise_for_status()
            payload: Any = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            return self._failed(now, "certificate request failed", exc)
        keys = _parse_certificates(payload)
        if not keys:
            return self._failed(now, "certificate response had no usable keys", None)
        ttl = certs_ttl_seconds(response.headers.get("cache-control"))
        self._keys = keys
        self._fetched_at = now
        self._expires_at = now + timedelta(seconds=ttl)
        self._retry_after = None
        return self._keys

    def _failed(self, now: datetime, reason: str, cause: Exception | None) -> SigningKeys:
        """Back off before the next outbound call; keep serving cached keys until max stale."""
        self._retry_after = now + timedelta(seconds=FAILURE_BACKOFF_SECONDS)
        if self._keys:
            _log.warning("firebase_certs_refresh_failed_using_cache", reason=reason)
            return self._keys
        raise GoogleBackendError(reason) from cause
