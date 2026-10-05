"""Google sign in: Firebase ID token verification, find or create or link the user.

Identity is the Firebase uid (`sub`) of a google.com sign in. The email only decides whether a
brand new identity links to an existing account, and only when the email is verified.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from sqlalchemy.exc import IntegrityError

from app.core.clock import Clock
from app.core.config import Settings
from app.core.context import RequestContext
from app.core.errors import AppError, ErrorCode
from app.core.logging import get_logger
from app.core.security import AUTH_METHOD_GOOGLE
from app.db.models import OAuthProvider, User
from app.db.uow import UnitOfWork
from app.services.infra.google_client import (
    GoogleBackend,
    GoogleBackendError,
    SigningKey,
    issuer_for,
)
from app.services.infra.google_mock import MOCK_PROJECT_ID
from app.services.token_service import IssuedSession, TokenService

GOOGLE_SIGN_IN_PROVIDER = "google.com"
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
    auth_time: datetime


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


class FirebaseIdTokenVerifier:
    """Verifies a Firebase ID token against Google's securetoken certificates."""

    def __init__(self, backend: GoogleBackend, *, project_id: str, clock: Clock) -> None:
        self._backend = backend
        self._project_id = project_id
        self._issuer = issuer_for(project_id)
        self._clock = clock

    async def _key_for(self, kid: str) -> SigningKey | None:
        for force in (False, True):
            keys = await self._backend.signing_keys(force_refresh=force)
            if kid in keys:
                return keys[kid]
        return None

    async def verify(self, id_token: str) -> GoogleClaims:
        """Check signature, iss, aud, times, provider and email; return the identity."""
        try:
            header = jwt.get_unverified_header(id_token)
        except jwt.InvalidTokenError as exc:
            raise _fail("malformed_token") from exc
        kid = header.get("kid")
        if header.get("alg") != self._backend.algorithm or not isinstance(kid, str):
            raise _fail("bad_header")
        try:
            key = await self._key_for(kid)
        except GoogleBackendError as exc:
            _log.error("google_certs_unavailable")
            raise AppError(ErrorCode.SERVICE_UNAVAILABLE) from exc
        if key is None:
            raise _fail("unknown_kid")
        claims = self._decode(id_token, key)
        self._check_times(claims)
        self._check_provider(claims)
        return self._identity(claims)

    def _decode(self, id_token: str, key: SigningKey) -> Mapping[str, Any]:
        try:
            return jwt.decode(
                id_token,
                key,
                algorithms=[self._backend.algorithm],
                audience=self._project_id,
                issuer=self._issuer,
                options={
                    "require": ["exp", "iat", "auth_time", "iss", "aud", "sub"],
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
        leeway = CLOCK_SKEW.total_seconds()
        try:
            expires = float(claims["exp"])
            issued = float(claims["iat"])
            authenticated = float(claims["auth_time"])
        except (TypeError, ValueError) as exc:
            raise _fail("bad_time_claims") from exc
        if expires <= now - leeway:
            raise _fail("expired")
        if issued > now + leeway:
            raise _fail("issued_in_future")
        if authenticated > now + leeway or authenticated > issued + leeway:
            raise _fail("auth_time_in_future")

    def _check_provider(self, claims: Mapping[str, Any]) -> None:
        firebase = claims.get("firebase")
        provider = firebase.get("sign_in_provider") if isinstance(firebase, dict) else None
        if provider != GOOGLE_SIGN_IN_PROVIDER:
            raise _fail("not_google_provider")

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
            sub=sub,
            email=email.strip().lower(),
            given_name=given,
            family_name=family,
            auth_time=datetime.fromtimestamp(float(claims["auth_time"]), tz=UTC),
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
    def project_id(self) -> str | None:
        if self._settings.firebase_project_id:
            return self._settings.firebase_project_id
        return MOCK_PROJECT_ID if self._settings.google_mock else None

    async def sign_in(self, *, id_token: str, ctx: RequestContext) -> GoogleAuthResult:
        project_id = self.project_id
        if project_id is None:
            _log.warning("google_auth_rejected", reason="disabled")
            raise AppError(ErrorCode.GOOGLE_AUTH_FAILED, details=[{"reason": "disabled"}])
        verifier = FirebaseIdTokenVerifier(self._backend, project_id=project_id, clock=self._clock)
        identity = await verifier.verify(id_token)
        user, is_new, linked = await self._resolve_user(identity)
        session = await self._tokens.issue_session(
            user.id,
            ctx,
            auth_method=AUTH_METHOD_GOOGLE,
            auth_at=min(identity.auth_time, self._clock.now()),
        )
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
