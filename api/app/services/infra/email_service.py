"""Email delivery behind a Protocol. The SMTP implementation uses aiosmtplib."""

from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage
from email.utils import formatdate, make_msgid
from typing import Protocol

import aiosmtplib

from app.core.config import Settings


class EmailDeliveryError(Exception):
    """The message could not be delivered. The text never includes recipient or content."""


@dataclass(frozen=True)
class OutgoingEmail:
    to: str
    subject: str
    text: str
    html: str


class EmailSender(Protocol):
    async def send(self, message: OutgoingEmail) -> None: ...


def build_mime(message: OutgoingEmail, sender: str) -> MimeMessage:
    """Assemble a multipart message. Header values with line breaks are refused by the stdlib."""
    mime = MimeMessage()
    mime["From"] = sender
    mime["To"] = message.to
    mime["Subject"] = message.subject
    mime["Date"] = formatdate(localtime=False)
    mime["Message-ID"] = make_msgid(domain="leafy")
    mime.set_content(message.text)
    mime.add_alternative(message.html, subtype="html")
    return mime


class SmtpEmailSender:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def send(self, message: OutgoingEmail) -> None:
        settings = self._settings
        password = settings.smtp_password.get_secret_value() if settings.smtp_password else None
        username = settings.smtp_username or None  # an empty env var means no authentication
        try:
            mime = build_mime(message, settings.smtp_from)
            await aiosmtplib.send(
                mime,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=username,
                password=password or None,
                use_tls=settings.smtp_use_tls,
                start_tls=settings.smtp_starttls,
                timeout=settings.smtp_timeout_seconds,
            )
        except (aiosmtplib.SMTPException, OSError, ValueError, TimeoutError) as exc:
            raise EmailDeliveryError("email delivery failed") from exc
