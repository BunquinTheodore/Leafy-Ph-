"""Google sign in: code exchange, ID token verification, find or create or link the user.

Identity is Google's stable `sub`. The email only decides whether a brand new identity links to
an existing account, and only when Google says the email is verified.
"""

import hmac
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import jwt
from jwt import PyJWK
from sqlalchemy.exc import IntegrityError

from app.core.clock import Clock
from app.core.config import Settings
from app.core.context import RequestContext
from app.core.errors import AppError, ErrorCode
from app.core.logging import get_logger
from app.db.models import OAuthProvider, User
from app.db.uow import UnitOfWork
from app.services.infra.google_client import GoogleBackend, GoogleBackendError
from app.services.infra.google_mock import MOCK_CLIENT_ID
from app.services.token_service import IssuedSession, TokenService

ALLOWED_ISSUERS = ("https://accounts.google.com", "accounts.google.com")
ALLOWED_ALGORITHM = "RS256"
CLOCK_SKEW = timedelta(seconds=60)
MAX_SUBJECT_LENGTH = 255
MAX_NAME_LENGTH = 100
REASON_ACCOUNT_LINKED = "google_link_unverified_account"

_log = get_logger("leafy.google")


@dataclass(frozen=True)
class GoogleClaims:
    sub: str
    email: str
    given_name: str
    family_name: str


@dataclass(frozen=True)
class GoogleAuthResult:
    user: User
    session: IssuedSession
    is_new_user: bool
    linked_existing: bool


def _fail(reason: str) -> AppError:
    """A generic failure for the client; the reason only goes to the log."""
    _log.warning("google_auth_rejected", reason=reason)
    return AppError(ErrorCode.GOOGLE_AUTH_FAILED)


def _split_names(claims: Mapping[str, Any], email: str) -> tuple[str, str]:
    given = str(claims.get("given_name") or "").strip()
    family = str(claims.get("family_name") or "").strip()
    if not given:
        parts = str(claims.get("name") or "").strip().split(maxsplit=1)
        given = parts[0] if parts else email.split("@", 1)[0]
        family = family or (parts[1] if len(parts) > 1 else "")
    return given[:MAX_NAME_LENGTH], family[:MAX_NAME_LENGTH]


def _is_true(value: object) -> bool:
    return value is True or (isinstance(value, str) and value.lower() == "true")


class GoogleIdTokenVerifier:
    def __init__(self, backend: GoogleBackend, *, client_id: str, clock: Clock) -> None:
        self._backend = backend
        self._client_id = client_id
        self._clock = clock

    async def _key_for(self, kid: str) -> PyJWK | None:
        for force in (False, True):
            for jwk in await self._backend.signing_keys(force_refresh=force):
                if jwk.get("kid") == kid:
                    return PyJWK.from_dict(dict(jwk), algorithm=ALLOWED_ALGORITHM)
        return None

    async def verify(self, id_token: str, *, nonce: str) -> GoogleClaims:
        """Check signature, iss, aud, exp, nonce and email_verified; return the identity."""
        try:
            header = jwt.get_unverified_header(id_token)
        except jwt.InvalidTokenError as exc:
            raise _fail("malformed_token") from exc
        kid = header.get("kid")
        if header.get("alg") != ALLOWED_ALGORITHM or not isinstance(kid, str):
            raise _fail("bad_header")
        try:
            key = await self._key_for(kid)
        except GoogleBackendError as exc:
            raise _fail("jwks_unavailable") from exc
        if key is None:
            raise _fail("unknown_kid")
        claims = self._decode(id_token, key)
        self._check_times(claims)
        if not hmac.compare_digest(str(claims.get("nonce", "")), nonce):
            raise _fail("nonce_mismatch")
        return self._identity(claims)

    def _decode(self, id_token: str, key: PyJWK) -> Mapping[str, Any]:
        try:
            return jwt.decode(
                id_token,
                key.key,
                algorithms=[ALLOWED_ALGORITHM],
                audience=self._client_id,
                issuer=list(ALLOWED_ISSUERS),
                options={
                    "require": ["exp", "iat", "iss", "aud", "sub"],
                    # Time is checked against the injected clock below.
                    "verify_exp": False,
                    "verify_iat": False,
                    "verify_nbf": False,
                },
            )
        except jwt.InvalidAudienceError as exc:
            raise _fail("wrong_audience") from exc
        except jwt.InvalidIssuerError as exc:
            raise _fail("wrong_issuer") from exc
        except jwt.InvalidTokenError as exc:
            raise _fail("invalid_token") from exc

    def _check_times(self, claims: Mapping[str, Any]) -> None:
        now = self._clock.now().timestamp()
        try:
            expires = float(claims["exp"])
            issued = float(claims["iat"])
        except (TypeError, ValueError) as exc:
            raise _fail("bad_time_claims") from exc
        if expires <= now - CLOCK_SKEW.total_seconds():
            raise _fail("expired")
        if issued > now + CLOCK_SKEW.total_seconds():
            raise _fail("issued_in_future")

    def _identity(self, claims: Mapping[str, Any]) -> GoogleClaims:
        sub = claims.get("sub")
        email = claims.get("email")
        if not isinstance(sub, str) or not sub or len(sub) > MAX_SUBJECT_LENGTH:
            raise _fail("bad_subject")
        if not isinstance(email, str) or "@" not in email:
            raise _fail("no_email")
        if not _is_true(claims.get("email_verified")):
            _log.info("google_email_unverified")
            raise AppError(ErrorCode.GOOGLE_EMAIL_UNVERIFIED)
        given, family = _split_names(claims, email)
        return GoogleClaims(
            sub=sub, email=email.strip().lower(), given_name=given, family_name=family
        )


class GoogleAuthService:
    def __init__(
        self,
        uow: UnitOfWork,
        backend: GoogleBackend,
        tokens: TokenService,
        settings: Settings,
        clock: Clock,
    ) -> None:
        self._uow = uow
        self._backend = backend
        self._tokens = tokens
        self._settings = settings
        self._clock = clock

    @property
    def client_id(self) -> str | None:
        if self._settings.google_client_id:
            return self._settings.google_client_id
        return MOCK_CLIENT_ID if self._settings.google_mock else None

    def _allowed_redirects(self) -> set[str]:
        return {uri.strip() for uri in self._settings.google_redirect_uri.split(",") if uri.strip()}

    async def sign_in(
        self, *, code: str, code_verifier: str, nonce: str, redirect_uri: str, ctx: RequestContext
    ) -> GoogleAuthResult:
        client_id = self.client_id
        if client_id is None:
            raise _fail("not_configured")
        if redirect_uri not in self._allowed_redirects():
            raise _fail("redirect_uri_not_allowed")
        try:
            id_token = await self._backend.exchange_code(
                code=code, code_verifier=code_verifier, redirect_uri=redirect_uri
            )
        except GoogleBackendError as exc:
            raise _fail("code_exchange_failed") from exc
        verifier = GoogleIdTokenVerifier(self._backend, client_id=client_id, clock=self._clock)
        identity = await verifier.verify(id_token, nonce=nonce)
        user, is_new, linked = await self._resolve_user(identity)
        session = await self._tokens.issue_session(user.id, ctx)
        await self._uow.commit()
        return GoogleAuthResult(
            user=user, session=session, is_new_user=is_new, linked_existing=linked
        )

    async def _resolve_user(self, identity: GoogleClaims) -> tuple[User, bool, bool]:
        linked = await self._uow.oauth_identities.get_by_subject(OAuthProvider.GOOGLE, identity.sub)
        if linked is not None:
            user = await self._uow.users.get(linked.user_id)
            if user is None:
                raise _fail("identity_without_user")
            return user, False, False
        try:
            async with self._uow.session.begin_nested():
                return await self._link_or_create(identity)
        except IntegrityError:
            # Another request created the same user or link first; use what it stored.
            return await self._resolve_after_race(identity)

    async def _resolve_after_race(self, identity: GoogleClaims) -> tuple[User, bool, bool]:
        existing = await self._uow.oauth_identities.get_by_subject(
            OAuthProvider.GOOGLE, identity.sub
        )
        user = await self._uow.users.get(existing.user_id) if existing else None
        if user is None:
            raise _fail("race_unresolved")
        return user, False, False

    async def _link_or_create(self, identity: GoogleClaims) -> tuple[User, bool, bool]:
        now = self._clock.now()
        user = await self._uow.users.get_by_email(identity.email)
        if user is None:
            user = await self._uow.users.create(
                email=identity.email,
                password_hash=None,
                first_name=identity.given_name,
                last_name=identity.family_name,
                email_verified_at=now,
            )
            created = True
        else:
            await self._take_over_unverified(user)
            await self._uow.users.mark_email_verified(user.id, now)
            created = False
        await self._uow.oauth_identities.add(
            user_id=user.id,
            provider=OAuthProvider.GOOGLE,
            subject=identity.sub,
            email=identity.email,
        )
        await self._uow.session.refresh(user)
        _log.info(
            "google_user_created" if created else "google_identity_linked", user_id=str(user.id)
        )
        return user, created, not created

    async def _take_over_unverified(self, user: User) -> None:
        """An account whose email was never verified may belong to someone else.

        Anyone can register with another person's email. Once the real owner proves control
        through Google, the unverified password and its sessions are removed so the earlier
        registrant cannot keep access.
        """
        if user.email_verified_at is not None:
            return
        if user.password_hash is not None:
            await self._uow.users.clear_password(user.id)
        await self._tokens.revoke_all_for_user(user.id, REASON_ACCOUNT_LINKED)
