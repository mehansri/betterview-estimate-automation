"""Sales pipeline and profitability reporting for managers."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

OPEN_STATUSES = ("finalized", "sent", "viewed")


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _total(row) -> float:
    return float(((row.pricing_snapshot or {}).get("totals") or {}).get("total") or 0)


def _accepted_total(row) -> float:
    return float((row.acceptance or {}).get("total") or _total(row))


def _profitability(row) -> dict[str, Any]:
    return (row.pricing_snapshot or {}).get("profitability") or {}


def _discount_percent(row) -> float | None:
    totals = (row.pricing_snapshot or {}).get("totals") or {}
    base = float(totals.get("base_subtotal") or 0)
    if base <= 0:
        return None
    return float(totals.get("discount") or 0) / base * 100.0


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def summary(days: int = 90) -> dict[str, Any]:
    from db.models import CustomerEstimate, EstimateEvent
    from db.session import get_session

    since = datetime.now(timezone.utc) - timedelta(days=days)
    today = date.today()
    with get_session() as session:
        rows = session.query(CustomerEstimate).filter(CustomerEstimate.deleted_at.is_(None)).all()
        # Only the latest revision of each offer counts in the pipeline.
        latest: dict[str, Any] = {}
        for row in rows:
            key = str(row.revision_of or row.id)
            if key not in latest or (row.revision_number or 1) > (latest[key].revision_number or 1):
                latest[key] = row
        offers = list(latest.values())

        pipeline = {status: {"count": 0, "value": 0.0} for status in
                    ("draft", "priced", "finalized", "sent", "viewed", "accepted", "lost")}
        for row in offers:
            bucket = pipeline.setdefault(row.status, {"count": 0, "value": 0.0})
            bucket["count"] += 1
            value = _accepted_total(row) if row.status == "accepted" else _total(row)
            bucket["value"] = round(bucket["value"] + value, 2)

        won = [row for row in offers if row.status == "accepted" and _aware(row.accepted_at) and _aware(row.accepted_at) >= since]
        lost = [row for row in offers if row.status == "lost" and _aware(row.lost_at) and _aware(row.lost_at) >= since]
        decided = len(won) + len(lost)
        days_to_close = [
            (_aware(row.accepted_at) - _aware(row.sent_at)).total_seconds() / 86400
            for row in won if row.sent_at
        ]

        reps: dict[str, dict[str, Any]] = defaultdict(lambda: {
            "estimates": 0, "sent": 0, "won": 0, "lost": 0, "won_value": 0.0,
            "margins": [], "discounts": [], "overrides": 0,
        })
        for row in offers:
            created = _aware(row.created_at)
            if created and created < since and row not in won and row not in lost:
                continue
            rep = reps[(row.salesperson or "").strip() or "Unassigned"]
            rep["estimates"] += 1
            if row.sent_at:
                rep["sent"] += 1
            if row in won:
                rep["won"] += 1
                rep["won_value"] += _accepted_total(row)
            if row in lost:
                rep["lost"] += 1
            profit = _profitability(row)
            if profit.get("margin_percent") is not None and row.pricing_snapshot:
                rep["margins"].append(float(profit["margin_percent"]))
            discount = _discount_percent(row)
            if discount is not None:
                rep["discounts"].append(discount)
            if profit.get("override_applied"):
                rep["overrides"] += 1
        by_rep = [
            {
                "salesperson": name,
                "estimates": data["estimates"],
                "sent": data["sent"],
                "won": data["won"],
                "lost": data["lost"],
                "close_rate": round(data["won"] / (data["won"] + data["lost"]) * 100, 1) if data["won"] + data["lost"] else None,
                "won_value": round(data["won_value"], 2),
                "average_margin_percent": _avg(data["margins"]),
                "average_discount_percent": _avg(data["discounts"]),
                "overrides": data["overrides"],
            }
            for name, data in sorted(reps.items(), key=lambda item: -item[1]["won_value"])
        ]

        by_id = {str(row.id): row for row in rows}
        override_events = (
            session.query(EstimateEvent)
            .filter(EstimateEvent.kind == "override")
            .order_by(EstimateEvent.created_at.desc())
            .limit(50)
            .all()
        )
        overrides = []
        for event in override_events:
            created = _aware(event.created_at)
            if created and created < since:
                continue
            row = by_id.get(str(event.estimate_id))
            overrides.append({
                "estimate_id": str(event.estimate_id),
                "estimate_number": row.estimate_number if row else None,
                "customer_name": row.customer_name if row else None,
                "salesperson": row.salesperson if row else None,
                "reason": (event.detail or {}).get("reason"),
                "total": (event.detail or {}).get("total"),
                "margin_percent": (event.detail or {}).get("margin_percent"),
                "created_at": created.isoformat() if created else None,
            })

        follow_ups = sorted(
            (row for row in offers if row.status in OPEN_STATUSES and row.follow_up_on and row.follow_up_on <= today),
            key=lambda row: row.follow_up_on,
        )
        return {
            "days": days,
            "pipeline": pipeline,
            "open_pipeline_value": round(sum(pipeline[status]["value"] for status in OPEN_STATUSES), 2),
            "won": {"count": len(won), "value": round(sum(_accepted_total(row) for row in won), 2)},
            "lost": {"count": len(lost), "reasons": Counter((row.lost_reason or "No reason").strip() for row in lost).most_common(8)},
            "close_rate": round(len(won) / decided * 100, 1) if decided else None,
            "average_days_to_close": _avg(days_to_close),
            "average_won_margin_percent": _avg([float(_profitability(row).get("margin_percent") or 0) for row in won]),
            "by_salesperson": by_rep,
            "overrides": overrides,
            "follow_ups_due": [
                {"id": str(row.id), "estimate_number": row.estimate_number, "customer_name": row.customer_name,
                 "salesperson": row.salesperson, "status": row.status, "follow_up_on": row.follow_up_on.isoformat(),
                 "total": _total(row)}
                for row in follow_ups
            ],
        }
