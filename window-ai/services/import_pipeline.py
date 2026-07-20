"""PDF/JSON import pipeline: parse → normalize → validate → features → rules → DB."""
from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path
from typing import Any, Optional

from parser.base import ParsedEstimate, ParsedWindow
from parser.cli import parse_file, write_processed
from parser.normalize import is_valid_training_window
from services.features import attach_derived_features
from services.rules import apply_rules, get_thresholds, load_rules
from services.validation import validate_estimate, validate_window
from utils.logging import get_logger
from utils.paths import DATA_PROCESSED, UPLOADS_DIR, ensure_dirs

logger = get_logger("windowai.import")


def _window_to_dict(w: ParsedWindow) -> dict[str, Any]:
    return w.model_dump()


def enrich_window(w: dict[str, Any], rules_cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    cfg = rules_cfg if rules_cfg is not None else load_rules()
    thr = get_thresholds(cfg)
    row = attach_derived_features(
        w,
        oversized_area=float(thr["oversized_area"]),
        wide_width=float(thr["wide_width"]),
        tall_height=float(thr["tall_height"]),
    )
    row = apply_rules(row, cfg)
    return row


def import_estimate_file(
    path: Path,
    *,
    replace_duplicate: bool = True,
    copy_to_uploads: bool = False,
) -> dict[str, Any]:
    """
    Import a single PDF or JSON estimate.
    Returns status dict with estimate_id, warnings, errors.
    """
    from db.init_db import init_db
    from db.models import Estimate, ImportLog, Window
    from db.session import get_session

    ensure_dirs()
    init_db()
    path = Path(path)
    if not path.exists():
        return {
            "status": "failed",
            "filename": path.name,
            "errors": [f"File not found: {path}"],
            "warnings": [],
        }

    if copy_to_uploads and path.parent.resolve() != UPLOADS_DIR.resolve():
        dest = UPLOADS_DIR / path.name
        shutil.copy2(path, dest)
        path = dest

    rules_cfg = load_rules()
    thr = get_thresholds(rules_cfg)
    all_warnings: list[str] = []
    all_errors: list[str] = []

    try:
        est = parse_file(path)
    except Exception as exc:
        logger.exception("Parse failed for %s", path)
        with get_session() as session:
            session.add(
                ImportLog(
                    id=uuid.uuid4(),
                    filename=path.name,
                    source_path=str(path),
                    status="failed",
                    errors=[str(exc)],
                    warnings=[],
                    message=f"Parse failed: {exc}",
                )
            )
        return {
            "status": "failed",
            "filename": path.name,
            "errors": [str(exc)],
            "warnings": [],
        }

    est_dict = {
        "estimate_number": est.estimate_number,
        "customer": est.customer,
        "estimate_date": est.estimate_date.isoformat() if est.estimate_date else None,
        "windows": [_window_to_dict(w) for w in est.windows],
        "total": est.total,
    }
    e_err, e_warn = validate_estimate(est_dict)
    all_errors.extend(e_err)
    all_warnings.extend(e_warn)
    all_warnings.extend(est.parse_warnings or [])

    # Soft: still import windows that pass; hard fail only if no estimate number
    if not est.estimate_number:
        with get_session() as session:
            session.add(
                ImportLog(
                    id=uuid.uuid4(),
                    filename=path.name,
                    source_path=str(path),
                    status="failed",
                    errors=all_errors,
                    warnings=all_warnings,
                    message="Missing estimate_number",
                )
            )
        return {
            "status": "failed",
            "filename": path.name,
            "errors": all_errors,
            "warnings": all_warnings,
        }

    write_processed(est, DATA_PROCESSED)
    enriched_windows: list[dict[str, Any]] = []
    for i, w in enumerate(est.windows):
        raw = _window_to_dict(w)
        row = enrich_window(raw, rules_cfg)
        w_err, w_warn = validate_window(
            row,
            min_dimension=float(thr["min_dimension"]),
            max_width=float(thr["max_reasonable_width"]),
            max_height=float(thr["max_reasonable_height"]),
        )
        for msg in w_err:
            all_warnings.append(f"Window {i + 1} error (stored with flag): {msg}")
        all_warnings.extend([f"Window {i + 1}: {m}" for m in w_warn])
        row["_validation_errors"] = w_err
        row["window_number"] = i + 1
        # Preserve unknown fields
        known = set(ParsedWindow.model_fields.keys()) | {
            "area",
            "perimeter",
            "aspect_ratio",
            "oversized",
            "wide_window",
            "tall_window",
            "glass_layers",
            "color_upcharge",
            "window_number",
            "_validation_errors",
            "extras",
        }
        extras = {k: v for k, v in raw.items() if k not in known and v is not None}
        if extras:
            row["extras"] = {**(row.get("extras") or {}), **extras}
        enriched_windows.append(row)

    estimate_id: Optional[str] = None
    with get_session() as session:
        existing = (
            session.query(Estimate)
            .filter(Estimate.estimate_number == est.estimate_number)
            .one_or_none()
        )
        if existing and not replace_duplicate:
            session.add(
                ImportLog(
                    id=uuid.uuid4(),
                    filename=path.name,
                    source_path=str(path),
                    status="failed",
                    estimate_number=est.estimate_number,
                    errors=[f"Duplicate estimate_number {est.estimate_number}"],
                    warnings=all_warnings,
                    message="Duplicate rejected",
                )
            )
            return {
                "status": "failed",
                "filename": path.name,
                "estimate_number": est.estimate_number,
                "errors": [f"Duplicate estimate_number {est.estimate_number}"],
                "warnings": all_warnings,
            }
        if existing:
            session.delete(existing)
            session.flush()
            all_warnings.append(f"Replaced existing estimate {est.estimate_number}")

        row = Estimate(
            id=uuid.uuid4(),
            estimate_number=est.estimate_number,
            customer=est.customer,
            project_name=getattr(est, "project_name", None),
            salesperson=getattr(est, "salesperson", None),
            estimate_date=est.estimate_date,
            total_price=est.total,
            source_filename=est.source_filename or path.name,
            source_path=str(path),
            raw_json=est.to_training_dict(),
        )
        session.add(row)
        session.flush()
        estimate_id = str(row.id)

        for w in enriched_windows:
            unit = w.get("price")
            if unit is None and w.get("line_total") is not None and w.get("quantity"):
                try:
                    unit = float(w["line_total"]) / max(int(w["quantity"]), 1)
                except (TypeError, ValueError):
                    unit = None
            valid = is_valid_training_window(ParsedWindow.model_validate(
                {k: w.get(k) for k in ParsedWindow.model_fields.keys()}
            )) and not w.get("_validation_errors")
            session.add(
                Window(
                    id=uuid.uuid4(),
                    estimate_id=row.id,
                    window_number=w.get("window_number"),
                    type=w.get("type"),
                    width=w.get("width"),
                    height=w.get("height"),
                    area=w.get("area"),
                    perimeter=w.get("perimeter"),
                    aspect_ratio=w.get("aspect_ratio"),
                    oversized=bool(w.get("oversized", False)),
                    wide_window=bool(w.get("wide_window", False)),
                    tall_window=bool(w.get("tall_window", False)),
                    frame=w.get("frame"),
                    glass=w.get("glass"),
                    color=w.get("color"),
                    grid=w.get("grid") or "None",
                    tempered=bool(w.get("tempered", False)),
                    shape=w.get("shape") or "Rectangular",
                    installation=w.get("installation"),
                    hardware=w.get("hardware"),
                    quantity=int(w.get("quantity") or 1),
                    brickmould=bool(w.get("brickmould", False)),
                    wood_jamb=bool(w.get("wood_jamb", False)),
                    screen=bool(w.get("screen", False)),
                    mulled=bool(w.get("mulled", False)),
                    nailing_flange=bool(w.get("nailing_flange", False)),
                    gas_fill=w.get("gas_fill") or "None",
                    spacer=w.get("spacer"),
                    low_e=w.get("low_e"),
                    interior_finish=w.get("interior_finish"),
                    exterior_finish=w.get("exterior_finish"),
                    glass_layers=w.get("glass_layers"),
                    extras=w.get("extras"),
                    unit_price=unit,
                    line_total=w.get("line_total"),
                    is_valid_for_training=valid,
                )
            )

        status = "warning" if all_warnings else "success"
        if all_errors and not enriched_windows:
            status = "failed"
        session.add(
            ImportLog(
                id=uuid.uuid4(),
                filename=path.name,
                source_path=str(path),
                status=status,
                estimate_id=row.id,
                estimate_number=est.estimate_number,
                window_count=len(enriched_windows),
                warnings=all_warnings or None,
                errors=all_errors or None,
                message=f"Imported {len(enriched_windows)} windows",
            )
        )

    logger.info(
        "Imported %s (%s windows) status=%s",
        est.estimate_number,
        len(enriched_windows),
        status,
    )
    return {
        "status": status,
        "filename": path.name,
        "estimate_number": est.estimate_number,
        "estimate_id": estimate_id,
        "window_count": len(enriched_windows),
        "warnings": all_warnings,
        "errors": all_errors,
    }


def import_uploads_batch(*, pattern: str = "*.pdf") -> list[dict[str, Any]]:
    ensure_dirs()
    results = []
    for path in sorted(UPLOADS_DIR.glob(pattern)):
        results.append(import_estimate_file(path))
    # Also JSON
    for path in sorted(UPLOADS_DIR.glob("*.json")):
        results.append(import_estimate_file(path))
    return results


def reprocess_estimate(estimate_id: str) -> dict[str, Any]:
    from db.models import Estimate
    from db.session import get_session

    with get_session() as session:
        est = session.query(Estimate).filter(Estimate.id == estimate_id).one_or_none()
        if not est:
            return {"status": "failed", "errors": ["Estimate not found"]}
        src = est.source_path
        estimate_number = est.estimate_number
    if src and Path(src).exists():
        return import_estimate_file(Path(src))
    processed = DATA_PROCESSED / f"{estimate_number}.json"
    if processed.exists():
        return import_estimate_file(processed)
    return {"status": "failed", "errors": [f"Source file missing: {src}"]}
