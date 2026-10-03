"""Talks to Google: authorization code exchange and the JWKS used to verify ID tokens."""

import re
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta
from typing import Any, Protocol

import httpx

from app.core.clock import Clock
from app.core.config import Settings
from app.core.logging import get_logger

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 - public endpoint URL
GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
DEFAULT_JWKS_TTL_SECONDS = 3600
MIN_JWKS_TTL_SECONDS = 60
MAX_JWKS_TTL_SECONDS = 86_400
FORCED_REFRESH_INTERVAL_SECONDS = 30
HTTP_TIMEOUT_SECONDS = 10.0

_MAX_AGE = re.compile(r"max-age=(\d+)")
_log = get_logger("leafy.google")


class GoogleBackendError(Exception):
    """Google could not be reached or rejected the request. Details are logged, not returned."""


class GoogleBackend(Protocol):
    async def exchange_code(self, *, code: str, code_verifier: str, redirect_uri: str) -> str:
        """Exchange an authorization code for a raw ID token."""
        ...

    async def signing_keys(self, *, force_refresh: bool = False) -> Sequence[Mapping[str, Any]]:
        """Return the JWKS keys. `force_refresh` asks for a fresh copy (rate limited)."""
        ...


def jwks_ttl_seconds(cache_control: str | None) -> int:
    """Cache lifetime from the response header, clamped to a sane range."""
    match = _MAX_AGE.search(cache_control or "")
    ttl = int(match.group(1)) if match else DEFAULT_JWKS_TTL_SECONDS
    return max(MIN_JWKS_TTL_SECONDS, min(MAX_JWKS_TTL_SECONDS, ttl))


class HttpGoogleBackend:
    """Real Google over HTTPS with a cached JWKS."""

    def __init__(self, settings: Settings, clock: Clock, client: httpx.AsyncClient | None = None):
        self._settings = settings
        self._clock = clock
        self._client = client
        self._keys: list[Mapping[str, Any]] = []
        self._expires_at: datetime | None = None
        self._last_forced: datetime | None = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def exchange_code(self, *, code: str, code_verifier: str, redirect_uri: str) -> str:
        secret = self._settings.google_client_secret
        if not self._settings.google_client_id or secret is None:
            raise GoogleBackendError("google is not configured")
        form = {
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": code_verifier,
            "redirect_uri": redirect_uri,
            "client_id": self._settings.google_client_id,
            "client_secret": secret.get_secret_value(),
        }
        try:
            response = await self._http().post(GOOGLE_TOKEN_URL, data=form)
        except httpx.HTTPError as exc:
            raise GoogleBackendError("token request failed") from exc
        if response.status_code != 200:
            _log.warning("google_token_rejected", status=response.status_code)
            raise GoogleBackendError("token endpoint rejected the code")
        try:
            payload = response.json()
        except ValueError as exc:
            raise GoogleBackendError("token response was not json") from exc
        id_token = payload.get("id_token") if isinstance(payload, dict) else None
        if not isinstance(id_token, str) or not id_token:
            raise GoogleBackendError("token response had no id_token")
        return id_token

    async def signing_keys(self, *, force_refresh: bool = False) -> Sequence[Mapping[str, Any]]:
        now = self._clock.now()
        fresh = self._expires_at is not None and now < self._expires_at
        if fresh and not force_refresh:
            return self._keys
        if fresh and force_refresh and self._forced_too_recently(now):
            return self._keys
        if force_refresh:
            self._last_forced = now
        return await self._fetch(now)

    def _forced_too_recently(self, now: datetime) -> bool:
        if self._last_forced is None:
            return False
        return now - self._last_forced < timedelta(seconds=FORCED_REFRESH_INTERVAL_SECONDS)

    async def _fetch(self, now: datetime) -> Sequence[Mapping[str, Any]]:
        try:
            response = await self._http().get(GOOGLE_JWKS_URL)
            response.raise_for_status()
            payload = response.json()
            keys = payload.get("keys", []) if isinstance(payload, dict) else []
        except (httpx.HTTPError, ValueError) as exc:
            if self._keys:
                _log.warning("google_jwks_refresh_failed_using_cache")
                return self._keys
            raise GoogleBackendError("jwks request failed") from exc
        if not isinstance(keys, list) or not keys:
            raise GoogleBackendError("jwks response had no keys")
        ttl = jwks_ttl_seconds(response.headers.get("cache-control"))
        self._keys = [key for key in keys if isinstance(key, dict)]
        self._expires_at = now + timedelta(seconds=ttl)
        return self._keys
