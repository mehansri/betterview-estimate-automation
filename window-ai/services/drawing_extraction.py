"""Read window and door sizes off a house's permit drawings (PDF) with Claude.

Brampton sells the original permit drawings for any address (Building
Records request). For tract homes they include the elevations and usually a
window schedule. The result is only a draft: it becomes measure-sheet rows
the salesperson checks before anything is saved or priced.
"""
from __future__ import annotations

import base64
import json
import os
from typing import Any

from services.windowcity.layout import DEFAULT_SERIES, PRESETS, SERIES
from utils.logging import get_logger

logger = get_logger("windowai.drawings")

MODEL = "claude-opus-5-5"
MAX_PDF_BYTES = 30 * 1024 * 1024

# Single operations map to the default series' style code; common two-lite
# combinations map to layout presets.
SINGLE_OPERATIONS = ["fixed", "casement", "awning", "single_slider", "double_slider", "single_hung", "double_hung"]
COMBINATION_PRESETS = {
    "fixed_plus_casement": "C3",
    "casement_plus_fixed": "casement_fixed",
    "twin_casement": "twin_casement",
    "fixed_over_awning": "fixed_over_awning",
    "awning_over_awning": "awning_stack",
}
OPERATIONS = [*SINGLE_OPERATIONS, *COMBINATION_PRESETS, "other_combination", "unknown"]

SYSTEM_PROMPT = """You read Ontario residential permit drawings (builder house plans) for a window and door replacement company.
List every exterior window and door opening shown, so the company can quote replacements before visiting.

Rules:
- Use the window/door schedule when there is one; otherwise read sizes from the elevations and floor plans. Cross-check the two when both exist.
- Report sizes in inches (width x height). Convert metric (mm) to inches. Builder size codes such as "3048" or "30x48" usually mean 30" x 48".
- Say what the size describes: "rough_opening", "frame" (unit size), "nominal" (a size code), or "unknown". Do not adjust sizes yourself.
- One entry per distinct window per elevation; use qty for identical windows side by side or repeated on the same elevation.
- elevation is the side of the house as labelled on the drawings (front, rear -> back, left, right). If unlabelled, use "other".
- location is the room from the floor plan (e.g. "Primary bedroom", "Kitchen", "Basement"), or "" if not shown.
- Only report what the drawings show. If a size is not legible, set it to null and explain in note. Never guess a size.
- Skip garage overhead doors and interior doors. Include entry doors and patio/sliding doors in doors.
- Mark each entry's confidence: "high" (schedule or dimension text), "medium" (read from a dimension string you had to combine), "low" (inferred)."""

_window_schema = {
    "type": "object",
    "properties": {
        "tag": {"type": "string", "description": "Window mark/code on the drawings, or empty"},
        "elevation": {"type": "string", "enum": ["front", "back", "left", "right", "other"]},
        "location": {"type": "string"},
        "operation": {"type": "string", "enum": OPERATIONS},
        "width_in": {"type": ["number", "null"]},
        "height_in": {"type": ["number", "null"]},
        "size_basis": {"type": "string", "enum": ["rough_opening", "frame", "nominal", "unknown"]},
        "qty": {"type": "integer"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "note": {"type": "string"},
    },
    "required": ["tag", "elevation", "location", "operation", "width_in", "height_in", "size_basis", "qty", "confidence", "note"],
    "additionalProperties": False,
}
_door_schema = {
    "type": "object",
    "properties": {
        "elevation": {"type": "string", "enum": ["front", "back", "left", "right", "other"]},
        "location": {"type": "string"},
        "kind": {"type": "string", "enum": ["entry", "patio_slider", "garden", "other"]},
        "description": {"type": "string", "description": "e.g. single door with one sidelite"},
        "width_in": {"type": ["number", "null"]},
        "height_in": {"type": ["number", "null"]},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "note": {"type": "string"},
    },
    "required": ["elevation", "location", "kind", "description", "width_in", "height_in", "confidence", "note"],
    "additionalProperties": False,
}
SCHEMA = {
    "type": "object",
    "properties": {
        "house_model": {"type": "string", "description": "Model/plan name or number if printed, else empty"},
        "builder": {"type": "string"},
        "windows": {"type": "array", "items": _window_schema},
        "doors": {"type": "array", "items": _door_schema},
        "warnings": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["house_model", "builder", "windows", "doors", "warnings"],
    "additionalProperties": False,
}


class DrawingExtractionError(Exception):
    pass


def available() -> bool:
    if not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")):
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return True


def _style_for(operation: str) -> str:
    """Measure-sheet style: a catalog style code or "preset:<id>" ("" = choose)."""
    if operation in SINGLE_OPERATIONS:
        return SERIES[DEFAULT_SERIES]["styles"].get(operation, "")
    preset = COMBINATION_PRESETS.get(operation)
    if preset and any(item["id"] == preset for item in PRESETS):
        return f"preset:{preset}"
    return ""


def _inches(value: Any) -> str:
    if not isinstance(value, (int, float)) or value <= 0:
        return ""
    return f"{round(float(value) * 8) / 8:g}"


def to_measure_rows(extraction: dict[str, Any]) -> list[dict[str, Any]]:
    """Windows as measure-sheet rows (location, style, width, height, qty)."""
    rows = []
    for window in extraction.get("windows") or []:
        elevation = window.get("elevation") or "other"
        room = (window.get("location") or "").strip()
        label = " · ".join(part for part in [room, f"{elevation} elevation", window.get("tag") or ""] if part)
        rows.append({
            "location": label,
            "style": _style_for(window.get("operation") or "unknown"),
            "width": _inches(window.get("width_in")),
            "height": _inches(window.get("height_in")),
            "qty": str(max(1, int(window.get("qty") or 1))),
            "roughOpening": window.get("size_basis") == "rough_opening",
            "elevation": elevation,
            "operation": window.get("operation"),
            "size_basis": window.get("size_basis"),
            "confidence": window.get("confidence"),
            "note": window.get("note") or "",
        })
    return rows


def extract_openings(pdf: bytes, *, address: str = "") -> dict[str, Any]:
    if not pdf.startswith(b"%PDF"):
        raise DrawingExtractionError("That file is not a PDF.")
    if len(pdf) > MAX_PDF_BYTES:
        raise DrawingExtractionError("The drawing set is larger than 30 MB; split it or upload the elevations only.")
    if not available():
        raise DrawingExtractionError("Drawing reading needs Anthropic credentials on the server (ANTHROPIC_API_KEY).")

    import anthropic

    client = anthropic.Anthropic(timeout=600.0)
    prompt = "List every exterior window and door opening on these permit drawings."
    if address:
        prompt += f" The drawings are for {address}."
    try:
        with client.beta.messages.stream(
            model=MODEL,
            max_tokens=64000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA}},
            system=SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "document", "source": {
                        "type": "base64", "media_type": "application/pdf",
                        "data": base64.standard_b64encode(pdf).decode("ascii"),
                    }},
                    {"type": "text", "text": prompt},
                ],
            }],
        ) as stream:
            response = stream.get_final_message()
    except anthropic.BadRequestError as exc:
        raise DrawingExtractionError(f"The drawings could not be read: {exc.message}") from exc
    except anthropic.RateLimitError as exc:
        raise DrawingExtractionError("The drawing reader is busy; try again in a minute.") from exc
    except anthropic.APIStatusError as exc:
        logger.warning("drawing extraction failed with status %s", exc.status_code)
        raise DrawingExtractionError("The drawing reader is unavailable right now; try again later.") from exc
    except anthropic.APIConnectionError as exc:
        raise DrawingExtractionError("Could not reach the drawing reader; check the server's connection.") from exc

    if response.stop_reason == "refusal":
        raise DrawingExtractionError("The drawing reader declined this file.")
    if response.stop_reason == "max_tokens":
        raise DrawingExtractionError("The drawing set is too large to read in one pass; upload the elevations only.")
    text = next((block.text for block in response.content if block.type == "text"), "")
    try:
        extraction = json.loads(text)
    except json.JSONDecodeError as exc:
        raise DrawingExtractionError("The drawing reader returned an unreadable answer; try again.") from exc
    return {**extraction, "rows": to_measure_rows(extraction)}
