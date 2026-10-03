"""Templates, the email service and the SMTP sender (no network)."""

from typing import Any

import aiosmtplib
import pytest
from app.services.email_service import EmailService
from app.services.infra.email_service import (
    EmailDeliveryError,
    OutgoingEmail,
    SmtpEmailSender,
    build_mime,
)

from tests.conftest import make_settings
from tests.support.fakes import FakeEmailSender

TOKEN = "tok_abc-123_XYZ"


@pytest.fixture
def sender() -> FakeEmailSender:
    return FakeEmailSender()


@pytest.fixture
def service(sender: FakeEmailSender) -> EmailService:
    return EmailService(sender, make_settings(app_origin="https://leafy.test/"))


async def test_verification_email_has_a_branded_html_and_a_text_twin(
    service: EmailService, sender: FakeEmailSender
) -> None:
    await service.send_verification(to="a@example.com", first_name="Ada", token=TOKEN)
    [message] = sender.sent
    link = f"https://leafy.test/verify-email?token={TOKEN}"
    assert message.subject == "Verify your Leafy email"
    assert link in message.html and link in message.text
    assert "LEAFY" in message.html
    assert "Josefin Sans" in message.html and "Manrope" in message.html
    assert "#23813a" in message.html
    assert "24 hours" in message.html and "24 hours" in message.text
    assert "<" not in message.text


async def test_reset_email_says_one_hour(service: EmailService, sender: FakeEmailSender) -> None:
    await service.send_password_reset(to="a@example.com", first_name="Ada", token=TOKEN)
    [message] = sender.sent
    assert message.subject == "Reset your Leafy password"
    assert f"https://leafy.test/reset-password?token={TOKEN}" in message.text
    assert "1 hour " in message.text and "1 hours" not in message.text


async def test_password_changed_email_links_to_the_forgot_page_without_a_token(
    service: EmailService, sender: FakeEmailSender
) -> None:
    await service.send_password_changed(to="a@example.com", first_name="Ada")
    [message] = sender.sent
    assert message.subject == "Your Leafy password was changed"
    assert "https://leafy.test/forgot-password" in message.text
    assert "token=" not in message.text and "token=" not in message.html


async def test_names_are_html_escaped_in_the_html_body(
    service: EmailService, sender: FakeEmailSender
) -> None:
    await service.send_verification(
        to="a@example.com", first_name='<script>alert("x")</script>', token=TOKEN
    )
    html = sender.sent[0].html
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


async def test_token_is_url_encoded_in_the_link(
    service: EmailService, sender: FakeEmailSender
) -> None:
    await service.send_verification(to="a@example.com", first_name="Ada", token="a b&c=d")
    assert "token=a%20b%26c%3Dd" in sender.sent[0].text


async def test_an_empty_first_name_falls_back_to_there(
    service: EmailService, sender: FakeEmailSender
) -> None:
    await service.send_verification(to="a@example.com", first_name="", token=TOKEN)
    assert "Hello there," in sender.sent[0].text


async def test_copy_has_no_exclamation_marks_or_dashes(
    service: EmailService, sender: FakeEmailSender
) -> None:
    await service.send_verification(to="a@example.com", first_name="Ada", token=TOKEN)
    await service.send_password_reset(to="a@example.com", first_name="Ada", token=TOKEN)
    await service.send_password_changed(to="a@example.com", first_name="Ada")
    for message in sender.sent:
        prose = message.text.replace(TOKEN, "")
        assert "!" not in prose
        assert chr(0x2014) not in prose and chr(0x2013) not in prose


async def test_delivery_failure_is_swallowed_by_the_service(
    service: EmailService, sender: FakeEmailSender
) -> None:
    sender.fail = True
    await service.send_verification(to="a@example.com", first_name="Ada", token=TOKEN)
    assert sender.sent == []


def test_build_mime_is_multipart_alternative_with_both_bodies() -> None:
    message = build_mime(
        OutgoingEmail(to="a@example.com", subject="Hi", text="plain body", html="<p>html body</p>"),
        "Leafy <no-reply@leafy.test>",
    )
    assert message["To"] == "a@example.com"
    assert message["From"] == "Leafy <no-reply@leafy.test>"
    assert message.get_body(("plain",)).get_content().strip() == "plain body"  # type: ignore[union-attr]
    assert "html body" in message.get_body(("html",)).get_content()  # type: ignore[union-attr]
    assert message["Message-ID"] and message["Date"]


def test_build_mime_refuses_header_injection() -> None:
    with pytest.raises(ValueError, match=r"linefeed|newline|header"):
        build_mime(
            OutgoingEmail(to="a@example.com\nBcc: x@example.com", subject="s", text="t", html="h"),
            "Leafy <no-reply@leafy.test>",
        )


async def test_smtp_sender_passes_settings_to_aiosmtplib(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_send(message: Any, **kwargs: Any) -> None:
        captured["message"] = message
        captured.update(kwargs)

    monkeypatch.setattr(aiosmtplib, "send", fake_send)
    settings = make_settings(
        smtp_host="mail.test",
        smtp_port=2525,
        smtp_username="user",
        smtp_password="pw",
        smtp_starttls=True,
        smtp_from="Leafy <hi@leafy.test>",
    )
    await SmtpEmailSender(settings).send(
        OutgoingEmail(to="a@example.com", subject="s", text="t", html="<p>h</p>")
    )
    assert captured["hostname"] == "mail.test"
    assert captured["port"] == 2525
    assert captured["username"] == "user"
    assert captured["password"] == "pw"
    assert captured["start_tls"] is True and captured["use_tls"] is False
    assert captured["message"]["From"] == "Leafy <hi@leafy.test>"


@pytest.mark.parametrize(
    "error", [aiosmtplib.SMTPConnectError("boom"), OSError("down"), TimeoutError()]
)
async def test_smtp_failures_become_email_delivery_error(
    monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    async def failing(*_: Any, **__: Any) -> None:
        raise error

    monkeypatch.setattr(aiosmtplib, "send", failing)
    with pytest.raises(EmailDeliveryError) as raised:
        await SmtpEmailSender(make_settings()).send(
            OutgoingEmail(to="secret@example.com", subject="s", text="t", html="h")
        )
    assert "secret@example.com" not in str(raised.value)
