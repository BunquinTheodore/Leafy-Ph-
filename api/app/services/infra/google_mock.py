"""Local stand ins for Firebase Auth. Neither is ever trusted in prod.

MockFirebaseBackend serves GOOGLE_MOCK=1. The web builds the ID token itself (HS256, shared key
below, kid "leafy-mock"), so no mock server is needed. MockGoogleProvider signs RS256 tokens with
an ephemeral RSA key and publishes certificates like the real backend; the Google tests use it.
Settings refuses GOOGLE_MOCK=1 when ENV=prod, and create_app refuses any mock backend in prod.
"""

import hashlib
from collections.abc import Mapping
from datetime import timedelta
from typing import Any

import jwt
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from app.core.clock import Clock
from app.services.infra.google_client import SigningKeys, issuer_for

MOCK_PROJECT_ID = "leafy-mock"
MOCK_KID = "leafy-mock"
MOCK_ALGORITHM = "HS256"
# Public by design: it only works while GOOGLE_MOCK=1, which prod refuses.
MOCK_SIGNING_KEY = "leafy-mock-firebase-signing-key"
ID_TOKEN_TTL = timedelta(hours=1)
GOOGLE_PROVIDER = "google.com"
_RSA_KEY_BITS = 2048
_DEFAULT_KID = "mock-key-1"
_CERT_VALIDITY = timedelta(days=30)


class MockFirebaseBackend:
    """Accepts only HS256 tokens with kid "leafy-mock", signed with the shared mock key."""

    algorithm = MOCK_ALGORITHM

    def __init__(self, project_id: str = MOCK_PROJECT_ID) -> None:
        self.project_id = project_id

    async def signing_keys(self, *, force_refresh: bool = False) -> SigningKeys:
        return {MOCK_KID: MOCK_SIGNING_KEY}


class MockGoogleProvider:
    algorithm = "RS256"

    def __init__(
        self,
        clock: Clock,
        project_id: str = MOCK_PROJECT_ID,
        kid: str = _DEFAULT_KID,
        private_key: rsa.RSAPrivateKey | None = None,
    ):
        self._clock = clock
        self.project_id = project_id
        self.kid = kid
        self._private_key = private_key or rsa.generate_private_key(
            public_exponent=65537, key_size=_RSA_KEY_BITS
        )
        self.refresh_count = 0

    def certificate_pem(self) -> str:
        """The public key as a self signed x509 certificate, like Google's cert endpoint."""
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "mock-securetoken")])
        now = self._clock.now()
        certificate = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)
            .public_key(self._private_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + _CERT_VALIDITY)
            .sign(self._private_key, hashes.SHA256())
        )
        return certificate.public_bytes(serialization.Encoding.PEM).decode("ascii")

    async def signing_keys(self, *, force_refresh: bool = False) -> SigningKeys:
        if force_refresh:
            self.refresh_count += 1
        return {self.kid: self._private_key.public_key()}

    def base_claims(
        self,
        *,
        email: str,
        sub: str | None = None,
        email_verified: bool | str = True,
        sign_in_provider: str = GOOGLE_PROVIDER,
        name: str | None = "Mock Googler",
    ) -> dict[str, Any]:
        now = self._clock.now()
        stamp = int(now.timestamp())
        uid = sub or "mock-" + hashlib.sha256(email.encode()).hexdigest()[:20]
        claims: dict[str, Any] = {
            "iss": issuer_for(self.project_id),
            "aud": self.project_id,
            "sub": uid,
            "user_id": uid,
            "email": email,
            "email_verified": email_verified,
            "auth_time": stamp,
            "iat": stamp,
            "exp": int((now + ID_TOKEN_TTL).timestamp()),
            "firebase": {
                "identities": {"email": [email]},
                "sign_in_provider": sign_in_provider,
            },
        }
        if name is not None:
            claims["name"] = name
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
