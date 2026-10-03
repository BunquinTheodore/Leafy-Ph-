"""Compose the branded transactional emails and hand them to a sender.

Delivery problems are logged and swallowed here on purpose: an SMTP outage must not break
sign up, and it must not reveal through an error whether an address has an account.
"""

from pathlib import Path
from urllib.parse import quote

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from app.core.config import Settings
from app.core.logging import get_logger
from app.services.infra.email_service import EmailDeliveryError, EmailSender, OutgoingEmail

TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "templates" / "email"

SUBJECT_VERIFY = "Verify your Leafy email"
SUBJECT_RESET = "Reset your Leafy password"
SUBJECT_PASSWORD_CHANGED = "Your Leafy password was changed"  # noqa: S105 - email subject

_log = get_logger("leafy.email")


def _hours_label(hours: int) -> str:
    return "1 hour" if hours == 1 else f"{hours} hours"


def build_environment() -> Environment:
    return Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(enabled_extensions=("html",), default=False),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )


class EmailService:
    def __init__(self, sender: EmailSender, settings: Settings) -> None:
        self._sender = sender
        self._settings = settings
        self._env = build_environment()

    def _render(
        self, name: str, *, subject: str, preheader: str, context: dict[str, str]
    ) -> tuple[str, str]:
        values = {"subject": subject, "preheader": preheader, **context}
        html = self._env.get_template(f"{name}.html").render(values)
        text = self._env.get_template(f"{name}.txt").render(values)
        return html, text

    def _link(self, path: str, token: str | None = None) -> str:
        base = self._settings.app_origin.rstrip("/")
        return f"{base}{path}" if token is None else f"{base}{path}?token={quote(token, safe='')}"

    async def _deliver(self, *, to: str, subject: str, html: str, text: str, kind: str) -> None:
        try:
            await self._sender.send(OutgoingEmail(to=to, subject=subject, text=text, html=html))
        except EmailDeliveryError:
            _log.error("email_delivery_failed", kind=kind)
            return
        _log.info("email_sent", kind=kind)

    async def send_verification(self, *, to: str, first_name: str, token: str) -> None:
        html, text = self._render(
            "verify",
            subject=SUBJECT_VERIFY,
            preheader="Confirm your email to start scanning leaves.",
            context={
                "first_name": first_name or "there",
                "action_url": self._link("/verify-email", token),
                "expires_in": _hours_label(self._settings.verify_email_ttl_hours),
            },
        )
        await self._deliver(to=to, subject=SUBJECT_VERIFY, html=html, text=text, kind="verify")

    async def send_password_reset(self, *, to: str, first_name: str, token: str) -> None:
        html, text = self._render(
            "reset",
            subject=SUBJECT_RESET,
            preheader="Use this link to choose a new password.",
            context={
                "first_name": first_name or "there",
                "action_url": self._link("/reset-password", token),
                "expires_in": _hours_label(self._settings.reset_password_ttl_hours),
            },
        )
        await self._deliver(to=to, subject=SUBJECT_RESET, html=html, text=text, kind="reset")

    async def send_password_changed(self, *, to: str, first_name: str) -> None:
        html, text = self._render(
            "password_changed",
            subject=SUBJECT_PASSWORD_CHANGED,
            preheader="Your password was changed. Check that this was you.",
            context={
                "first_name": first_name or "there",
                "action_url": self._link("/forgot-password"),
            },
        )
        await self._deliver(
            to=to,
            subject=SUBJECT_PASSWORD_CHANGED,
            html=html,
            text=text,
            kind="password_changed",
        )
