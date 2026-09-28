"""Draft a follow-up email for an open estimate.

Uses Claude when the server has Anthropic credentials (``ANTHROPIC_API_KEY``
or ``ANTHROPIC_AUTH_TOKEN``) and ``FOLLOW_UP_AI`` is not ``off``; otherwise a
plain template. Either way it is only a draft — the salesperson edits and
sends it themselves. Only customer-safe facts are ever sent to the model
(never cost, margin, or floor data).
"""
from __future__ import annotations

import json
import os
from datetime import date, datetime, timezone
from typing import Any

from services import business_settings
from utils.logging import get_logger

logger = get_logger("windowai.follow_up")

MODEL = "claude-opus-5"

SYSTEM_PROMPT = """You write follow-up emails for a residential window and door company's salespeople.
The salesperson will review and send the email themselves.

Write a short, warm, professional follow-up (80-150 words) to a homeowner who received an estimate.
- Plain language, no hype, no pressure tactics, no invented facts or promotions.
- Reference only the facts provided. Do not state prices other than those given.
- If the customer opened the estimate, acknowledge they may have had a chance to look it over; if not, gently mention it was sent.
- If options were offered, you may mention they can choose the option that fits best.
- If the estimate expires soon, mention the valid-until date once, matter-of-factly.
- Offer to answer questions or revisit measurements, and end with the salesperson's name and the company.
- Canadian English spelling. No emoji. No placeholder brackets."""

SCHEMA = {
    "type": "object",
    "properties": {
        "subject": {"type": "string"},
        "body": {"type": "string"},
    },
    "required": ["subject", "body"],
    "additionalProperties": False,
}


def _facts(row) -> dict[str, Any]:
    pricing = row.pricing_snapshot or {}
    company = business_settings.get_group("company")
    sent = row.sent_at.replace(tzinfo=row.sent_at.tzinfo or timezone.utc) if row.sent_at else None
    tiers = [
        {"name": tier.get("name"), "total": tier.get("total")}
        for tier in pricing.get("tiers") or [] if not tier.get("error")
    ]
    return {
        "customer_first_name": (row.customer_name or "").split(" ")[0] or "there",
        "project": row.project_name or "your window and door project",
        "estimate_number": row.estimate_number,
        "total_including_tax": (pricing.get("totals") or {}).get("total"),
        "options": tiers,
        "customer_opened_estimate": bool(row.viewed_at),
        "days_since_sent": (datetime.now(timezone.utc) - sent).days if sent else None,
        "valid_until": row.valid_until.isoformat() if row.valid_until else None,
        "days_until_expiry": (row.valid_until - date.today()).days if row.valid_until else None,
        "salesperson": row.salesperson or "",
        "company": company.get("name"),
        "company_phone": company.get("phone"),
    }


def _template(facts: dict[str, Any]) -> dict[str, str]:
    total = facts.get("total_including_tax")
    lines = [f"Hi {facts['customer_first_name']},", ""]
    if facts["customer_opened_estimate"]:
        lines.append(f"I hope you had a chance to look over the estimate for {facts['project']}.")
    else:
        lines.append(f"I wanted to make sure the estimate for {facts['project']} reached you.")
    if facts["options"]:
        lines.append("It includes a few options so you can choose the level that fits your home and budget.")
    elif total:
        lines.append(f"It comes to ${float(total):,.2f} including tax.")
    if facts.get("days_until_expiry") is not None and 0 <= facts["days_until_expiry"] <= 10:
        lines.append(f"The pricing is valid until {facts['valid_until']}.")
    lines += [
        "",
        "If you have any questions, or would like us to revisit any measurements or options, just reply to this email or give me a call.",
        "",
        "Best regards,",
        facts["salesperson"] or facts["company"],
        facts["company"],
    ]
    if facts.get("company_phone"):
        lines.append(facts["company_phone"])
    return {
        "subject": f"Following up on your estimate {facts.get('estimate_number') or ''}".strip(),
        "body": "\n".join(line for line in lines if line is not None),
    }


def ai_available() -> bool:
    if os.getenv("FOLLOW_UP_AI", "").lower() in ("off", "0", "false", "no"):
        return False
    if not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")):
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return True


def _claude_draft(facts: dict[str, Any]) -> dict[str, str] | None:
    import anthropic

    client = anthropic.Anthropic(timeout=60.0)
    try:
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=2000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
            system=SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": "Estimate facts (JSON):\n" + json.dumps(facts, indent=2, default=str),
            }],
        )
    except anthropic.RateLimitError:
        logger.warning("follow-up draft rate limited; using template")
        return None
    except anthropic.APIStatusError as exc:
        logger.warning("follow-up draft failed with status %s; using template", exc.status_code)
        return None
    except anthropic.APIConnectionError:
        logger.warning("follow-up draft could not reach the API; using template")
        return None

    if response.stop_reason in ("refusal", "max_tokens"):
        logger.warning("follow-up draft stopped with %s; using template", response.stop_reason)
        return None
    text = next((block.text for block in response.content if block.type == "text"), "")
    try:
        draft = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not str(draft.get("subject", "")).strip() or not str(draft.get("body", "")).strip():
        return None
    return {"subject": draft["subject"].strip(), "body": draft["body"].strip()}


def draft_follow_up(row) -> dict[str, Any]:
    facts = _facts(row)
    if ai_available():
        draft = _claude_draft(facts)
        if draft:
            return {**draft, "source": "claude"}
    return {**_template(facts), "source": "template"}
