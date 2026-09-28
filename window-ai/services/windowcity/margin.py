"""Sliding project margin with a profit floor.

The rule (user spec, 2026-09-28):

* no project quotes with less than the profit floor ($1,800);
* small projects start at the starting margin (45%) and slide down to the
  ending margin (30%) as the project grows;
* once the profit at the ending margin passes the cap ($4,000) the margin
  stays flat at the ending margin.

Margin is profit as a share of the sell price (sell = cost / (1 - margin)).
The ``markup`` basis is also supported (profit as a share of cost, sell =
cost x (1 + markup)); both numbers are always reported.

``C1`` is the project cost at which the starting rate earns exactly the floor,
``C2`` the cost at which the ending rate earns exactly the cap. Up to C1 the
floor applies (a fixed minimum profit); between C1 and C2 the rate falls
linearly from start to end; past C2 it is flat. The curve is continuous at
both breakpoints, so a bigger job never quotes cheaper than a smaller one --
``validate`` checks that for any settings a manager saves.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

DEFAULTS: dict[str, Any] = {
    "start_margin_percent": 45.0,
    "end_margin_percent": 30.0,
    "cap_profit": 4000.0,
    "basis": "margin",
}


class MarginConfigError(ValueError):
    """Sliding-margin settings that cannot produce a sensible price curve."""


@dataclass(frozen=True)
class MarginPlan:
    cost: float
    sell: float
    profit: float
    rate_percent: float
    margin_percent: float
    markup_percent: float
    band: str  # "floor" | "sliding" | "flat"
    breakpoints: tuple[float, float]

    def as_dict(self) -> dict[str, Any]:
        return {
            "cost": round(self.cost, 2),
            "sell": round(self.sell, 2),
            "profit": round(self.profit, 2),
            "rate_percent": round(self.rate_percent, 4),
            "margin_percent": round(self.margin_percent, 4),
            "markup_percent": round(self.markup_percent, 4),
            "band": self.band,
            "breakpoints": [round(value, 2) for value in self.breakpoints],
        }


def settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    out = {**DEFAULTS, **(raw or {})}
    out["basis"] = str(out.get("basis") or "margin").lower()
    for key in ("start_margin_percent", "end_margin_percent", "cap_profit"):
        out[key] = float(out[key])
    return out


def _profit(cost: float, rate: float, basis: str) -> float:
    return cost * rate / (1.0 - rate) if basis == "margin" else cost * rate


def breakpoints(cfg: dict[str, Any], floor_profit: float) -> tuple[float, float]:
    """(C1, C2): cost where the start rate earns the floor, and the end rate the cap."""
    start = cfg["start_margin_percent"] / 100.0
    end = cfg["end_margin_percent"] / 100.0
    if cfg["basis"] == "margin":
        c1 = floor_profit * (1.0 - start) / start
        c2 = cfg["cap_profit"] * (1.0 - end) / end
    else:
        c1 = floor_profit / start
        c2 = cfg["cap_profit"] / end
    return c1, c2


def plan(cost: float, raw: dict[str, Any] | None, floor_profit: float) -> MarginPlan:
    """Sell price, profit and effective margin for a project costing ``cost``."""
    cfg = settings(raw)
    start = cfg["start_margin_percent"] / 100.0
    end = cfg["end_margin_percent"] / 100.0
    basis = cfg["basis"]
    c1, c2 = breakpoints(cfg, floor_profit)
    cost = max(0.0, float(cost))
    if cost <= c1:
        band, rate = "floor", start
        profit = max(floor_profit, _profit(cost, start, basis)) if cost > 0 else floor_profit
    elif cost >= c2:
        band, rate = "flat", end
        profit = _profit(cost, end, basis)
    else:
        band = "sliding"
        rate = start + (end - start) * (cost - c1) / (c2 - c1)
        profit = _profit(cost, rate, basis)
    sell = cost + profit
    return MarginPlan(
        cost=cost,
        sell=sell,
        profit=profit,
        rate_percent=rate * 100.0,
        margin_percent=(profit / sell * 100.0) if sell else 0.0,
        markup_percent=(profit / cost * 100.0) if cost else 0.0,
        band=band,
        breakpoints=(c1, c2),
    )


def validate(raw: dict[str, Any] | None, floor_profit: float) -> dict[str, Any]:
    """Reject settings that would make the price curve fall or jump."""
    cfg = settings(raw)
    start, end = cfg["start_margin_percent"], cfg["end_margin_percent"]
    if cfg["basis"] not in ("margin", "markup"):
        raise MarginConfigError("sliding margin basis must be 'margin' or 'markup'")
    upper = 95.0 if cfg["basis"] == "margin" else 1000.0
    if not (0 < end <= start < upper):
        raise MarginConfigError(
            f"sliding margin must start at or above where it ends, between 0 and {upper:g}% "
            f"(got {start:g}% -> {end:g}%)")
    if floor_profit < 0 or cfg["cap_profit"] <= 0:
        raise MarginConfigError("the profit floor cannot be negative and the cap must be positive")
    c1, c2 = breakpoints(cfg, floor_profit)
    if c2 < c1:
        raise MarginConfigError(
            f"the cap (${cfg['cap_profit']:,.0f}) at {end:g}% is reached at a smaller project "
            f"(${c2:,.0f}) than the floor at {start:g}% (${c1:,.0f}); raise the cap or lower the floor")
    # No cliff: the sell price must never fall as the project grows.
    previous = None
    top = max(c2 * 1.5, 1.0)
    for step in range(0, 401):
        sell = plan(top * step / 400.0, cfg, floor_profit).sell
        if previous is not None and sell < previous - 0.005:
            raise MarginConfigError(
                "these settings would quote a bigger project cheaper than a smaller one; "
                "narrow the gap between the starting and ending margin or raise the cap")
        previous = sell
    return cfg
