"""Outbound email over SMTP (works with any provider: Google, Microsoft 365,
SendGrid, Resend, ...). When SMTP is not configured, callers get
``delivered=False`` and show the salesperson a link to send themselves.

Environment:
    SMTP_HOST, SMTP_PORT (587), SMTP_USERNAME, SMTP_PASSWORD,
    SMTP_FROM ("Better View <estimates@example.com>"), SMTP_USE_SSL (false)
"""
from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import getaddresses

from utils.logging import get_logger

logger = get_logger("windowai.mailer")


class MailError(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_FROM"))


def _addresses(value: str) -> list[str]:
    return [address for _, address in getaddresses([value or ""]) if "@" in address]


def send_email(
    *,
    to: str,
    subject: str,
    text: str,
    html: str | None = None,
    cc: str = "",
    reply_to: str = "",
    attachments: list[tuple[str, bytes, str]] | None = None,
) -> bool:
    """Send a message. Returns False (without raising) when SMTP is not set up."""
    recipients = _addresses(to)
    if not recipients:
        raise MailError("Enter a valid customer email address.")
    if not is_configured():
        return False

    message = EmailMessage()
    message["From"] = os.environ["SMTP_FROM"]
    message["To"] = ", ".join(recipients)
    copies = _addresses(cc)
    if copies:
        message["Cc"] = ", ".join(copies)
    if reply_to:
        message["Reply-To"] = reply_to
    message["Subject"] = subject
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")
    for filename, content, mime in attachments or []:
        maintype, subtype = mime.split("/", 1)
        message.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)

    host = os.environ["SMTP_HOST"]
    port = int(os.getenv("SMTP_PORT", "587"))
    username, password = os.getenv("SMTP_USERNAME"), os.getenv("SMTP_PASSWORD")
    context = ssl.create_default_context()
    try:
        if os.getenv("SMTP_USE_SSL", "").lower() in ("1", "true", "yes"):
            server: smtplib.SMTP = smtplib.SMTP_SSL(host, port, context=context, timeout=20)
        else:
            server = smtplib.SMTP(host, port, timeout=20)
            server.starttls(context=context)
        with server:
            if username:
                server.login(username, password or "")
            server.send_message(message, to_addrs=recipients + copies)
    except (smtplib.SMTPException, OSError) as exc:
        logger.warning("email to %s failed: %s", recipients, exc)
        raise MailError(f"The email could not be sent: {exc}") from exc
    return True
