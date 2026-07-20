"""Generate synthetic historical estimates for bootstrap training."""
from __future__ import annotations

import argparse
import math
import os
import random
import uuid
from datetime import date, timedelta
from typing import Any

from db.init_db import init_db
from db.models import Estimate, Window
from db.session import get_session, reset_engine
from utils.logging import get_logger

logger = get_logger("windowai.seed")

WINDOW_TYPES = ["Casement", "Awning", "Double Hung", "Slider", "Fixed", "Picture"]
FRAMES = ["Vinyl", "Aluminum", "Fiberglass", "Wood"]
GLASS = ["Single", "Double", "Triple"]
COLORS = ["White", "Black", "Brown", "Beige", "Gray"]
GRIDS = ["None", "Colonial", "Prairie", "Diamond"]
SHAPES = ["Rectangular", "Arched", "Custom"]
INSTALLATIONS = ["New Construction", "Replacement", "Retrofit"]

# Base $/sqft by window type (CAD-ish)
BASE_PSF = {
    "Casement": 42.0,
    "Awning": 40.0,
    "Double Hung": 38.0,
    "Slider": 36.0,
    "Fixed": 32.0,
    "Picture": 34.0,
}
GLASS_MULT = {"Single": 1.0, "Double": 1.15, "Triple": 1.35}
FRAME_MULT = {"Vinyl": 1.0, "Aluminum": 1.10, "Fiberglass": 1.20, "Wood": 1.35}
COLOR_MULT = {"White": 1.0, "Black": 1.08, "Brown": 1.05, "Beige": 1.03, "Gray": 1.06}
GRID_MULT = {"None": 1.0, "Colonial": 1.08, "Prairie": 1.10, "Diamond": 1.12}


def price_window(
    w_type: str,
    width: float,
    height: float,
    frame: str,
    glass: str,
    color: str,
    grid: str,
    tempered: bool,
    shape: str,
    rng: random.Random,
) -> float:
    area_sqin = width * height
    area_sqft = area_sqin / 144.0
    base = BASE_PSF[w_type] * area_sqft
    mult = (
        GLASS_MULT[glass]
        * FRAME_MULT[frame]
        * COLOR_MULT[color]
        * GRID_MULT[grid]
    )
    if tempered:
        mult *= 1.08
    if shape != "Rectangular":
        mult *= 1.18
    if area_sqin > 3000:  # oversized
        mult *= 1.10
    noise = rng.gauss(1.0, 0.025)  # ~±2.5%
    price = max(80.0, base * mult * noise)
    return round(price, 2)


def make_estimate(est_num: int, day: date, rng: random.Random) -> dict[str, Any]:
    n_windows = rng.randint(1, 8)
    windows: list[dict[str, Any]] = []
    total = 0.0
    for _ in range(n_windows):
        w_type = rng.choice(WINDOW_TYPES)
        width = round(rng.uniform(18, 72), 1)
        height = round(rng.uniform(24, 84), 1)
        frame = rng.choice(FRAMES)
        glass = rng.choice(GLASS)
        color = rng.choice(COLORS)
        grid = rng.choice(GRIDS)
        tempered = rng.random() < 0.25
        shape = rng.choices(SHAPES, weights=[0.9, 0.06, 0.04])[0]
        installation = rng.choice(INSTALLATIONS)
        qty = rng.choices([1, 2, 3], weights=[0.75, 0.18, 0.07])[0]
        unit = price_window(
            w_type, width, height, frame, glass, color, grid, tempered, shape, rng
        )
        line_total = round(unit * qty, 2)
        total += line_total
        windows.append(
            {
                "type": w_type,
                "width": width,
                "height": height,
                "area": round(width * height, 3),
                "frame": frame,
                "glass": glass,
                "color": color,
                "grid": grid,
                "tempered": tempered,
                "shape": shape,
                "installation": installation,
                "hardware": "Standard",
                "quantity": qty,
                "unit_price": unit,
                "line_total": line_total,
                "is_valid_for_training": True,
            }
        )
    return {
        "estimate_number": str(1000 + est_num),
        "customer": f"Customer {rng.randint(1, 80)}",
        "estimate_date": day,
        "total_price": round(total, 2),
        "windows": windows,
    }


def seed(
    n_estimates: int = 400,
    seed: int = 42,
    clear: bool = True,
    database_url: str | None = None,
) -> int:
    if database_url:
        os.environ["DATABASE_URL"] = database_url
        reset_engine()

    init_db()
    rng = random.Random(seed)
    start = date.today() - timedelta(days=540)
    rows = 0

    with get_session() as session:
        if clear:
            session.query(Window).delete()
            session.query(Estimate).delete()
            session.flush()

        for i in range(n_estimates):
            day = start + timedelta(days=int(i * (540 / max(n_estimates, 1))))
            payload = make_estimate(i, day, rng)
            est = Estimate(
                id=uuid.uuid4(),
                estimate_number=payload["estimate_number"],
                customer=payload["customer"],
                estimate_date=payload["estimate_date"],
                total_price=payload["total_price"],
                source_filename=f"synthetic_{payload['estimate_number']}.json",
                source_path="synthetic",
                raw_json={
                    "estimate_number": payload["estimate_number"],
                    "customer": payload["customer"],
                    "windows": [
                        {k: v for k, v in w.items() if k != "is_valid_for_training"}
                        for w in payload["windows"]
                    ],
                    "total": payload["total_price"],
                },
            )
            session.add(est)
            session.flush()
            for w in payload["windows"]:
                session.add(
                    Window(
                        id=uuid.uuid4(),
                        estimate_id=est.id,
                        **w,
                    )
                )
                rows += 1

    logger.info("Seeded %s estimates / %s windows", n_estimates, rows)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed synthetic window estimates")
    parser.add_argument(
        "--n",
        type=int,
        default=int(os.getenv("SYNTHETIC_N_ESTIMATES", "400")),
        help="Number of estimates",
    )
    parser.add_argument("--seed", type=int, default=int(os.getenv("SYNTHETIC_SEED", "42")))
    parser.add_argument("--no-clear", action="store_true", help="Do not wipe existing rows")
    parser.add_argument(
        "--sqlite",
        type=str,
        default=None,
        help="Optional SQLite path for local bootstrap without Postgres",
    )
    args = parser.parse_args()
    url = f"sqlite:///{args.sqlite}" if args.sqlite else None
    seed(n_estimates=args.n, seed=args.seed, clear=not args.no_clear, database_url=url)


if __name__ == "__main__":
    main()
