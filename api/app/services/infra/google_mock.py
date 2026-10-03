"""A local stand in for Google (GOOGLE_MOCK=1, and the Google tests).

It signs ID tokens with an ephemeral RSA key, publishes the public half as a JWKS and issues
single use authorization codes, exactly like the real token endpoint. Nothing here is reachable
in prod: Settings refuses GOOGLE_MOCK=1 when ENV=prod.
"""

import base64
import hashlib
import secrets
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

from app.core.clock import Clock
from app.services.infra.google_client import GoogleBackendError

MOCK_CLIENT_ID = "mock-google-client-id.apps.googleusercontent.com"
GOOGLE_ISSUER = "https://accounts.google.com"
ID_TOKEN_TTL = timedelta(hours=1)
_RSA_KEY_BITS = 2048
_DEFAULT_KID = "mock-key-1"


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


@dataclass(frozen=True)
class _PendingCode:
    claims: Mapping[str, Any]
    code_challenge: str | None
    redirect_uri: str | None


class MockGoogleProvider:
    def __init__(
        self,
        clock: Clock,
        client_id: str = MOCK_CLIENT_ID,
        kid: str = _DEFAULT_KID,
        private_key: rsa.RSAPrivateKey | None = None,
    ):
        self._clock = clock
        self.client_id = client_id
        self.kid = kid
        self._private_key = private_key or rsa.generate_private_key(
            public_exponent=65537, key_size=_RSA_KEY_BITS
        )
        self._codes: dict[str, _PendingCode] = {}
        self.exchange_count = 0

    def jwk(self) -> dict[str, Any]:
        public = RSAAlgorithm.to_jwk(self._private_key.public_key(), as_dict=True)
        return {**public, "kid": self.kid, "use": "sig", "alg": "RS256"}

    async def signing_keys(self, *, force_refresh: bool = False) -> Sequence[Mapping[str, Any]]:
        return [self.jwk()]

    def base_claims(
        self,
        *,
        email: str,
        sub: str | None = None,
        nonce: str | None = None,
        email_verified: bool | str = True,
        given_name: str | None = "Mock",
        family_name: str | None = "Googler",
        name: str | None = None,
    ) -> dict[str, Any]:
        now = self._clock.now()
        claims: dict[str, Any] = {
            "iss": GOOGLE_ISSUER,
            "aud": self.client_id,
            "sub": sub or "mock-" + hashlib.sha256(email.encode()).hexdigest()[:20],
            "email": email,
            "email_verified": email_verified,
            "iat": int(now.timestamp()),
            "exp": int((now + ID_TOKEN_TTL).timestamp()),
        }
        optional = {
            "nonce": nonce,
            "given_name": given_name,
            "family_name": family_name,
            "name": name,
        }
        claims.update({key: value for key, value in optional.items() if value is not None})
        return claims

    def sign(self, claims: Mapping[str, Any], *, kid: str | None = None) -> str:
        return jwt.encode(
            dict(claims),
            self._private_key,
            algorithm="RS256",
            headers={"kid": kid or self.kid},
        )

    def issue_id_token(self, *, email: str, **options: Any) -> str:
        """Sign a token. Pass `overrides={...}` to replace or add raw claims (None removes one)."""
        overrides: Mapping[str, Any] = options.pop("overrides", {})
        kid = options.pop("kid", None)
        claims = self.base_claims(email=email, **options)
        for key, value in overrides.items():
            if value is None:
                claims.pop(key, None)
            else:
                claims[key] = value
        return self.sign(claims, kid=kid)

    def create_code(
        self,
        *,
        email: str,
        nonce: str | None,
        code_challenge: str | None = None,
        redirect_uri: str | None = None,
        **options: Any,
    ) -> str:
        """Start a sign in as the browser would: returns the one time authorization code."""
        code = secrets.token_urlsafe(24)
        claims = self.base_claims(email=email, nonce=nonce, **options)
        self._codes[code] = _PendingCode(claims, code_challenge, redirect_uri)
        return code

    async def exchange_code(self, *, code: str, code_verifier: str, redirect_uri: str) -> str:
        self.exchange_count += 1
        pending = self._codes.pop(code, None)  # single use: a replay finds nothing
        if pending is None:
            raise GoogleBackendError("invalid_grant")
        if pending.redirect_uri is not None and pending.redirect_uri != redirect_uri:
            raise GoogleBackendError("redirect_uri_mismatch")
        challenge = pending.code_challenge
        if challenge is not None and not secrets.compare_digest(
            pkce_challenge(code_verifier), challenge
        ):
            raise GoogleBackendError("invalid_grant")
        return self.sign(pending.claims)
