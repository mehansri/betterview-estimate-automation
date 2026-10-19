"""Payment schedules: when the customer pays what share of the estimate.

Mirrors the CRM's src/domain/payment-schedule.ts (triggers, presets) so the
schedule printed on the estimate is the one the CRM bills against on import.
"""
from __future__ import annotations

from typing import Any

TRIGGERS = ("deposit", "delivery", "completion")

# Customer wording on the estimate, one line per milestone.
_WORDING = {
    "deposit": "{p}% deposit upon signing.",
    "delivery": "{p}% due upon delivery.",
    "completion": "{p}% due upon project completion.",
}

DEFAULT_SCHEDULE: list[dict[str, Any]] = [
    {"trigger": "deposit", "percentage": 35.0},
    {"trigger": "completion", "percentage": 65.0},
]


class PaymentScheduleError(ValueError):
    pass


def normalize(schedule: Any) -> list[dict[str, Any]]:
    """A deposit plus one or two later milestones, each trigger once, adding up to 100%."""
    if not isinstance(schedule, list) or not 2 <= len(schedule) <= len(TRIGGERS):
        raise PaymentScheduleError("Add a deposit and one or two later payments")
    entries: dict[str, float] = {}
    for entry in schedule:
        if not isinstance(entry, dict):
            raise PaymentScheduleError("Each payment must have a due point and a percentage")
        trigger = entry.get("trigger")
        if trigger not in TRIGGERS:
            raise PaymentScheduleError("Payments are due at signing, delivery or completion")
        if trigger in entries:
            raise PaymentScheduleError("Each due point can only be used once")
        try:
            percentage = round(float(entry.get("percentage")), 2)
        except (TypeError, ValueError):
            raise PaymentScheduleError("Enter a percentage for every payment") from None
        if not 0 < percentage <= 100:
            raise PaymentScheduleError("Payment percentages must be between 0.01 and 100")
        entries[trigger] = percentage
    if "deposit" not in entries:
        raise PaymentScheduleError("The schedule needs a deposit")
    if abs(sum(entries.values()) - 100) > 0.01:
        raise PaymentScheduleError("Payments must add up to 100%")
    return [{"trigger": trigger, "percentage": entries[trigger]} for trigger in TRIGGERS if trigger in entries]


def terms_lines(schedule: list[dict[str, Any]]) -> list[str]:
    """'35% deposit upon signing.', '65% due upon project completion.'"""
    return [_WORDING[entry["trigger"]].format(p=f"{float(entry['percentage']):g}") for entry in schedule]
