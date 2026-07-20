"""CLI: parse PDF estimates into JSON and optionally load Postgres."""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import date
from pathlib import Path

# Ensure project root on path when run as script
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from parser.base import ParsedEstimate
from parser.normalize import is_valid_training_window
from parser.pdf_parser import PDFEstimateParser
from utils.logging import get_logger
from utils.paths import DATA_PROCESSED, DATA_RAW, ensure_dirs

logger = get_logger("windowai.parser.cli")


def parse_file(path: Path) -> ParsedEstimate:
    if path.suffix.lower() == ".json":
        data = json.loads(path.read_text())
        return ParsedEstimate.model_validate(data)
    return PDFEstimateParser().parse(path)


def write_processed(est: ParsedEstimate, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{est.estimate_number}.json"
    out.write_text(json.dumps(est.to_training_dict(), indent=2, default=str))
    return out


def import_to_db(est: ParsedEstimate, source_path: str) -> None:
    from db.init_db import init_db
    from db.models import Estimate, Window
    from db.session import get_session

    init_db()
    with get_session() as session:
        existing = (
            session.query(Estimate)
            .filter(Estimate.estimate_number == est.estimate_number)
            .one_or_none()
        )
        if existing:
            session.delete(existing)
            session.flush()

        row = Estimate(
            id=uuid.uuid4(),
            estimate_number=est.estimate_number,
            customer=est.customer,
            estimate_date=est.estimate_date,
            total_price=est.total,
            source_filename=est.source_filename,
            source_path=source_path,
            raw_json=est.to_training_dict(),
        )
        session.add(row)
        session.flush()
        for w in est.windows:
            unit = w.price
            if unit is None and w.line_total is not None and w.quantity:
                unit = w.line_total / w.quantity
            session.add(
                Window(
                    id=uuid.uuid4(),
                    estimate_id=row.id,
                    type=w.type,
                    width=w.width,
                    height=w.height,
                    area=w.area,
                    frame=w.frame,
                    glass=w.glass,
                    color=w.color,
                    grid=w.grid or "None",
                    tempered=w.tempered,
                    shape=w.shape or "Rectangular",
                    installation=w.installation,
                    hardware=w.hardware,
                    quantity=w.quantity or 1,
                    brickmould=bool(getattr(w, "brickmould", False)),
                    wood_jamb=bool(getattr(w, "wood_jamb", False)),
                    screen=bool(getattr(w, "screen", False)),
                    mulled=bool(getattr(w, "mulled", False)),
                    nailing_flange=bool(getattr(w, "nailing_flange", False)),
                    gas_fill=getattr(w, "gas_fill", None) or "None",
                    unit_price=unit,
                    line_total=w.line_total,
                    is_valid_for_training=is_valid_training_window(w),
                )
            )
    logger.info("Imported estimate %s (%s windows)", est.estimate_number, len(est.windows))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Parse window estimate PDFs/JSON")
    parser.add_argument(
        "paths",
        nargs="*",
        help="Files or directories (default: data/raw)",
    )
    parser.add_argument("--import-db", action="store_true", help="Upsert into database")
    parser.add_argument(
        "--out",
        type=Path,
        default=DATA_PROCESSED,
        help="Processed JSON output directory",
    )
    args = parser.parse_args(argv)
    ensure_dirs()

    targets: list[Path] = []
    raw_paths = args.paths or [str(DATA_RAW)]
    for p in raw_paths:
        path = Path(p)
        if path.is_dir():
            targets.extend(sorted(path.glob("*.pdf")))
            targets.extend(sorted(path.glob("*.json")))
        elif path.exists():
            targets.append(path)
        else:
            logger.warning("Missing path: %s", path)

    if not targets:
        logger.warning("No PDF/JSON files found to parse")
        return 1

    for path in targets:
        try:
            est = parse_file(path)
            out = write_processed(est, args.out)
            logger.info("Parsed %s -> %s (warnings=%s)", path.name, out.name, est.parse_warnings)
            if args.import_db:
                import_to_db(est, str(path))
        except Exception as exc:
            logger.exception("Failed to parse %s: %s", path, exc)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
