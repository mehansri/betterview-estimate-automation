"""Read window and door sizes off a house's permit drawings (PDF) with an LLM.

Brampton sells the original permit drawings for any address (Building
Records request). For tract homes they include the elevations and usually a
window schedule. The result is only a draft: it becomes measure-sheet rows
the salesperson checks before anything is saved or priced.

Two providers, chosen with DRAWINGS_PROVIDER:
- "claude" (default): the whole PDF goes to Claude in one request.
- "ollama": a local vision model on this PC (free, slower, less accurate on
  dimension strings). Pages are rendered to PNG and read one at a time, then
  merged. Only works where the API runs on the same machine as Ollama.

Typed descriptions ("kitchen: 2 casements 29x65") go through the same schema
and review flow with a text model.
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Optional

from services.windowcity.layout import DEFAULT_SERIES, PRESETS, SERIES
from utils.logging import get_logger

logger = get_logger("windowai.drawings")

MODEL = "claude-opus-5-5"
MAX_PDF_BYTES = 30 * 1024 * 1024
MAX_TEXT_CHARS = 8000

PROVIDERS = ("claude", "ollama")
DEFAULT_OLLAMA_URL = "http://localhost:11434"
DEFAULT_VISION_MODEL = "qwen2.5vl:7b"
DEFAULT_TEXT_MODEL = "qwen2.5:7b"
# CPU-only inference (no NVIDIA GPU): a 7B vision model takes a minute or more
# per page, more on the first page while the model loads.
DEFAULT_OLLAMA_TIMEOUT = 900
DEFAULT_OLLAMA_MAX_PAGES = 12
# Long side of each rendered page. Qwen2.5-VL downsamples to about a megapixel
# anyway; more pixels only cost time.
DEFAULT_PAGE_PX = 1568

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

TEXT_SYSTEM_PROMPT = """You turn a window and door salesperson's typed notes about one house into a structured list of openings to quote.

Rules:
- Commas, semicolons and new lines separate items. Every size (e.g. "28x51") is its own entry; details after a size (e.g. "right hinge") belong to that entry only.
- A room name followed by a colon (e.g. "living room:") is the location for the items after it, until the next room. A room name directly before a size (e.g. "kitchen 28x51") is that entry's location.
- Sizes are width x height in inches unless a unit is given. Convert mm to inches. "29 1/2" is 29.5. If no size is given, use null. Never invent a size.
- "3 casements 29x65" is one entry with qty 3. Only treat several sashes as one unit when the notes say so (e.g. "twin casement", "fixed with casement").
- operation: casement, awning, fixed (picture), single_slider ("slider"), double_slider, single_hung, double_hung, or a combination preset; "unknown" if not stated.
- size_basis: "rough_opening" if the notes say RO / rough opening, "frame" if they say frame or unit size, otherwise "unknown".
- elevation: front, back (rear), left or right only when the notes say so; otherwise "other".
- Put hinge side, grilles, colour, glass or anything else about the item in note; leave note "" when there is nothing more.
- tag is "" unless the notes give a window mark.
- Entry, patio and garden doors go in doors.
- confidence: "high" when the type and size are both stated, "medium" when you assumed the type, "low" when the item is unclear.
- house_model and builder are "" unless the notes name them. Put anything you could not interpret in warnings."""

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


class _UnreadableAnswer(DrawingExtractionError):
    """The model answered, but not with usable JSON (one page can be skipped)."""


# ------------------------------------------------------------------ provider settings
def provider() -> str:
    value = (os.getenv("DRAWINGS_PROVIDER") or "claude").strip().lower()
    if value not in PROVIDERS:
        logger.warning("unknown DRAWINGS_PROVIDER %r; using claude", value)
        return "claude"
    return value


def ollama_url() -> str:
    return (os.getenv("OLLAMA_URL") or DEFAULT_OLLAMA_URL).strip().rstrip("/")


def vision_model() -> str:
    return (os.getenv("OLLAMA_VISION_MODEL") or DEFAULT_VISION_MODEL).strip()


def text_model() -> str:
    return (os.getenv("OLLAMA_TEXT_MODEL") or DEFAULT_TEXT_MODEL).strip()


def _env_int(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name) or default)
    except ValueError:
        return default
    return value if value > 0 else default


def _claude_available() -> bool:
    if not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")):
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return True


def _has_model(installed: set[str], name: str) -> bool:
    return name in installed or (":" not in name and f"{name}:latest" in installed)


def _ollama_installed() -> Optional[set[str]]:
    """Model names Ollama has pulled, or None when Ollama is not reachable."""
    try:
        tags = _ollama_request("/api/tags", timeout=3)
    except DrawingExtractionError:
        return None
    return {str(item.get("name") or item.get("model") or "") for item in tags.get("models") or []}


def status() -> dict[str, Any]:
    """Which reader is configured and whether it can take work right now."""
    if provider() == "ollama":
        vision, text = vision_model(), text_model()
        installed = _ollama_installed()
        missing = [] if installed is None else [name for name in dict.fromkeys([vision, text]) if not _has_model(installed, name)]
        if installed is None:
            message = f"Ollama is not running at {ollama_url()} (start it on the PC that runs the API)."
        elif missing:
            message = "Pull the local model(s) first: " + "; ".join(f"ollama pull {name}" for name in missing)
        else:
            message = ""
        return {
            "provider": "ollama",
            "model": vision,
            "text_model": text,
            "available": installed is not None and _has_model(installed, vision),
            "text_available": installed is not None and _has_model(installed, text),
            "local": True,
            # Pages take minutes on CPU: the frontend runs these as background jobs.
            "background": True,
            "message": message,
        }
    ready = _claude_available()
    return {
        "provider": "claude",
        "model": MODEL,
        "text_model": MODEL,
        "available": ready,
        "text_available": ready,
        "local": False,
        "background": False,
        "message": "" if ready else "Drawing reading needs Anthropic credentials on the server (ANTHROPIC_API_KEY).",
    }


def available() -> bool:
    return bool(status()["available"])


# ------------------------------------------------------------------ measure-sheet rows
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


def to_measure_rows(extraction: dict[str, Any], *, label_other_elevation: bool = True) -> list[dict[str, Any]]:
    """Windows as measure-sheet rows (location, style, width, height, qty)."""
    rows = []
    for window in extraction.get("windows") or []:
        elevation = window.get("elevation") or "other"
        room = (window.get("location") or "").strip()
        side = f"{elevation} elevation" if label_other_elevation or elevation != "other" else ""
        page = f"p.{window['page']}" if window.get("page") else ""
        label = " · ".join(part for part in [room, side, window.get("tag") or "", page] if part)
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


# ------------------------------------------------------------------ validation
_ELEVATIONS = ["front", "back", "left", "right", "other"]
_ELEVATION_ALIASES = {"rear": "back", "side": "other", "unknown": "other", "": "other"}
_OPERATION_ALIASES = {
    "picture": "fixed", "slider": "single_slider", "sliding": "single_slider", "hung": "single_hung",
    "fixed_casement": "fixed_plus_casement", "casement_fixed": "casement_plus_fixed",
}
_SIZE_BASES = ["rough_opening", "frame", "nominal", "unknown"]
_DOOR_KINDS = ["entry", "patio_slider", "garden", "other"]
_CONFIDENCES = ["high", "medium", "low"]
_MIXED_NUMBER = re.compile(r"^(\d+(?:\.\d+)?)(?:[\s-]+(\d+)/(\d+))?$")


def _enum(value: Any, allowed: list[str], fallback: str, aliases: Optional[dict[str, str]] = None) -> str:
    key = re.sub(r"[\s-]+", "_", str(value or "").strip().lower())
    key = (aliases or {}).get(key, key)
    return key if key in allowed else fallback


def _size(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if value > 0 else None
    match = _MIXED_NUMBER.match(str(value or "").strip().strip('"').strip())
    if not match:
        return None
    whole, numerator, denominator = match.groups()
    size = float(whole) + (int(numerator) / int(denominator) if numerator and int(denominator) else 0)
    return size if size > 0 else None


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _qty(value: Any) -> int:
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return 1


def _clean(raw: Any) -> dict[str, Any]:
    """Coerce a model's answer to SCHEMA (small local models drift on enums and types)."""
    if not isinstance(raw, dict):
        raise _UnreadableAnswer("The drawing reader returned an unreadable answer; try again.")
    windows = []
    for item in raw.get("windows") or []:
        if not isinstance(item, dict):
            continue
        window = {
            "tag": _text(item.get("tag")),
            "elevation": _enum(item.get("elevation"), _ELEVATIONS, "other", _ELEVATION_ALIASES),
            "location": _text(item.get("location")),
            "operation": _enum(item.get("operation"), OPERATIONS, "unknown", _OPERATION_ALIASES),
            "width_in": _size(item.get("width_in")),
            "height_in": _size(item.get("height_in")),
            "size_basis": _enum(item.get("size_basis"), _SIZE_BASES, "unknown"),
            "qty": _qty(item.get("qty")),
            "confidence": _enum(item.get("confidence"), _CONFIDENCES, "low"),
            "note": _text(item.get("note")),
        }
        if isinstance(item.get("page"), int):
            window["page"] = item["page"]
        windows.append(window)
    doors = []
    for item in raw.get("doors") or []:
        if not isinstance(item, dict):
            continue
        door = {
            "elevation": _enum(item.get("elevation"), _ELEVATIONS, "other", _ELEVATION_ALIASES),
            "location": _text(item.get("location")),
            "kind": _enum(item.get("kind"), _DOOR_KINDS, "other"),
            "description": _text(item.get("description")),
            "width_in": _size(item.get("width_in")),
            "height_in": _size(item.get("height_in")),
            "confidence": _enum(item.get("confidence"), _CONFIDENCES, "low"),
            "note": _text(item.get("note")),
        }
        if isinstance(item.get("page"), int):
            door["page"] = item["page"]
        doors.append(door)
    return {
        "house_model": _text(raw.get("house_model")),
        "builder": _text(raw.get("builder")),
        "windows": windows,
        "doors": doors,
        "warnings": [warning.strip() for warning in raw.get("warnings") or [] if isinstance(warning, str) and warning.strip()],
    }


def _finish(raw: Any, *, label_other_elevation: bool = True, model: str = "") -> dict[str, Any]:
    """The one path every provider's answer takes to become reviewable rows."""
    extraction = _clean(raw)
    return {
        **extraction,
        "rows": to_measure_rows(extraction, label_other_elevation=label_other_elevation),
        "provider": provider(),
        "model": model,
    }


# ------------------------------------------------------------------ Claude
def _claude_json(system: str, content: list[dict[str, Any]], *, unavailable: str) -> Any:
    if not _claude_available():
        raise DrawingExtractionError(unavailable)

    import anthropic

    client = anthropic.Anthropic(timeout=600.0)
    try:
        with client.beta.messages.stream(
            model=MODEL,
            max_tokens=64000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA}},
            system=system,
            messages=[{"role": "user", "content": content}],
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
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise DrawingExtractionError("The drawing reader returned an unreadable answer; try again.") from exc


# ------------------------------------------------------------------ Ollama
def _ollama_request(path: str, body: Optional[dict[str, Any]] = None, *, timeout: float, model: str = "") -> dict[str, Any]:
    url = f"{ollama_url()}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, method="POST" if body is not None else "GET",
                                     headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            detail = str(json.loads(exc.read().decode("utf-8")).get("error") or "")
        except (ValueError, AttributeError):
            detail = ""
        if exc.code == 404 and model:
            raise DrawingExtractionError(f"The local model {model} is not installed; run `ollama pull {model}` on this PC.") from exc
        logger.warning("ollama %s failed with status %s: %s", path, exc.code, detail)
        raise DrawingExtractionError(f"The local model could not read this ({detail or f'HTTP {exc.code}'}).") from exc
    except TimeoutError as exc:
        raise DrawingExtractionError(
            f"The local model took longer than {timeout:g} s. Upload fewer pages, or raise OLLAMA_TIMEOUT."
        ) from exc
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, TimeoutError):
            raise DrawingExtractionError(
                f"The local model took longer than {timeout:g} s. Upload fewer pages, or raise OLLAMA_TIMEOUT."
            ) from exc
        raise DrawingExtractionError(
            f"Could not reach Ollama at {ollama_url()}. Start Ollama on the PC that runs the API."
        ) from exc
    except (ValueError, UnicodeDecodeError) as exc:
        raise DrawingExtractionError("Ollama returned an unreadable response.") from exc


def _ollama_json(model: str, system: str, prompt: str, *, images: Optional[list[bytes]] = None) -> Any:
    message: dict[str, Any] = {"role": "user", "content": prompt}
    if images:
        message["images"] = [base64.standard_b64encode(image).decode("ascii") for image in images]
    response = _ollama_request("/api/chat", {
        "model": model,
        "stream": False,
        "format": SCHEMA,
        "keep_alive": "10m",
        "options": {"temperature": 0, "num_ctx": _env_int("OLLAMA_NUM_CTX", 8192), "num_predict": 4096},
        "messages": [{"role": "system", "content": system}, message],
    }, timeout=_env_int("OLLAMA_TIMEOUT", DEFAULT_OLLAMA_TIMEOUT), model=model)
    if response.get("done_reason") == "length":
        raise _UnreadableAnswer("the answer was cut off (too many openings for one pass)")
    content = (response.get("message") or {}).get("content") or ""
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise _UnreadableAnswer("the model's answer was not valid JSON") from exc


def _open_pdf(pdf: bytes):
    try:
        import pypdfium2 as pdfium
    except ImportError as exc:
        raise DrawingExtractionError("Reading drawings locally needs pypdfium2 on the API server: pip install pypdfium2") from exc
    try:
        return pdfium.PdfDocument(pdf)
    except pdfium.PdfiumError as exc:
        raise DrawingExtractionError("The PDF could not be opened; it may be damaged or password-protected.") from exc


def _render_page(page, *, max_px: int) -> bytes:
    width, height = page.get_size()
    scale = min(max_px / max(width, height, 1), 300 / 72)
    image = page.render(scale=scale, grayscale=True).to_pil()
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def render_pages(pdf: bytes, *, max_px: int = DEFAULT_PAGE_PX):
    """Yield each page as a PNG, one at a time (whole drawing sets are large)."""
    document = _open_pdf(pdf)
    try:
        for index in range(len(document)):
            page = document[index]
            try:
                yield _render_page(page, max_px=max_px)
            finally:
                page.close()
    finally:
        document.close()


def _page_count(pdf: bytes) -> int:
    document = _open_pdf(pdf)
    try:
        return len(document)
    finally:
        document.close()


def _merge_pages(pages: list[tuple[int, Any]]) -> dict[str, Any]:
    """Combine per-page answers; flag window marks read on more than one page."""
    merged: dict[str, Any] = {"house_model": "", "builder": "", "windows": [], "doors": [], "warnings": []}
    for number, answer in pages:
        if isinstance(answer, str):
            merged["warnings"].append(f"Page {number} could not be read: {answer}.")
            continue
        merged["house_model"] = merged["house_model"] or answer["house_model"]
        merged["builder"] = merged["builder"] or answer["builder"]
        merged["windows"] += [{**window, "page": number} for window in answer["windows"]]
        merged["doors"] += [{**door, "page": number} for door in answer["doors"]]
        merged["warnings"] += [f"Page {number}: {warning}" for warning in answer["warnings"]]

    tag_pages: dict[str, set[int]] = {}
    for window in merged["windows"]:
        if window["tag"]:
            tag_pages.setdefault(window["tag"].upper(), set()).add(window["page"])
    repeated = {tag: pages for tag, pages in tag_pages.items() if len(pages) > 1}
    for window in merged["windows"]:
        others = sorted(repeated.get(window["tag"].upper(), set()) - {window["page"]})
        if others:
            hint = f"{window['tag']} also read on p.{', p.'.join(map(str, others))} — possible duplicate"
            window["note"] = f"{window['note']}; {hint}" if window["note"] else hint
    if repeated:
        merged["warnings"].append(
            "Pages were read one at a time; window marks " + ", ".join(sorted(repeated))
            + " appear on more than one page (schedule and elevation?). Remove duplicates on the measure sheet."
        )
    return merged


def _ollama_drawings(pdf: bytes, address: str, progress: Optional[Callable[[int, int], None]]) -> dict[str, Any]:
    model = vision_model()
    count = _page_count(pdf)
    limit = _env_int("OLLAMA_MAX_PAGES", DEFAULT_OLLAMA_MAX_PAGES)
    if count > limit:
        raise DrawingExtractionError(
            f"The drawing set has {count} pages; the local reader takes up to {limit} at a time (about a minute each). "
            "Upload the elevations and window schedule only."
        )
    pages: list[tuple[int, Any]] = []
    for index, image in enumerate(render_pages(pdf, max_px=_env_int("OLLAMA_PAGE_PX", DEFAULT_PAGE_PX))):
        number = index + 1
        if progress:
            progress(number, count)
        prompt = (
            f"This is page {number} of {count} of a set of permit drawings"
            + (f" for {address}" if address else "")
            + ". List every exterior window and door opening shown on this page."
            " If the page shows none (site plan, sections, notes), return empty lists."
        )
        try:
            pages.append((number, _clean(_ollama_json(model, SYSTEM_PROMPT, prompt, images=[image]))))
        except _UnreadableAnswer as exc:
            logger.warning("page %s of %s unreadable: %s", number, count, exc)
            pages.append((number, str(exc)))
    if pages and all(isinstance(answer, str) for _, answer in pages):
        raise DrawingExtractionError(f"The local model could not read any of the {count} page(s): {pages[0][1]}.")
    return _finish(_merge_pages(pages), model=model)


# ------------------------------------------------------------------ entry points
def _check_pdf(pdf: bytes) -> None:
    if not pdf.startswith(b"%PDF"):
        raise DrawingExtractionError("That file is not a PDF.")
    if len(pdf) > MAX_PDF_BYTES:
        raise DrawingExtractionError("The drawing set is larger than 30 MB; split it or upload the elevations only.")


def _check_text(text: str) -> str:
    text = (text or "").strip()
    if not text:
        raise DrawingExtractionError("Type the windows and doors first.")
    if len(text) > MAX_TEXT_CHARS:
        raise DrawingExtractionError(f"That description is longer than {MAX_TEXT_CHARS} characters; split it up.")
    return text


def extract_openings(pdf: bytes, *, address: str = "", progress: Optional[Callable[[int, int], None]] = None) -> dict[str, Any]:
    """Draft measure-sheet rows from a permit-drawing PDF. progress(page, pages) is called per page (Ollama)."""
    _check_pdf(pdf)
    if provider() == "ollama":
        return _ollama_drawings(pdf, address, progress)

    prompt = "List every exterior window and door opening on these permit drawings."
    if address:
        prompt += f" The drawings are for {address}."
    answer = _claude_json(SYSTEM_PROMPT, [
        {"type": "document", "source": {
            "type": "base64", "media_type": "application/pdf",
            "data": base64.standard_b64encode(pdf).decode("ascii"),
        }},
        {"type": "text", "text": prompt},
    ], unavailable="Drawing reading needs Anthropic credentials on the server (ANTHROPIC_API_KEY).")
    return _finish(answer, model=MODEL)


def extract_from_text(text: str) -> dict[str, Any]:
    """Draft measure-sheet rows from a typed description such as "kitchen 28x51 right hinge"."""
    text = _check_text(text)
    if provider() == "ollama":
        model = text_model()
        try:
            answer = _ollama_json(model, TEXT_SYSTEM_PROMPT, text)
        except _UnreadableAnswer as exc:
            raise DrawingExtractionError(f"The local model could not read that description: {exc}. Try again or shorten it.") from exc
    else:
        model = MODEL
        answer = _claude_json(TEXT_SYSTEM_PROMPT, [{"type": "text", "text": text}],
                              unavailable="Reading typed openings needs Anthropic credentials on the server (ANTHROPIC_API_KEY).")
    return _finish(answer, label_other_elevation=False, model=model)


# ------------------------------------------------------------------ background jobs
# A local model takes minutes per drawing set, longer than the frontend proxy
# waits for one response, so the frontend starts a job and polls it. One worker:
# the CPU runs one model call at a time anyway.
JOB_TTL_SECONDS = 3600
_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="drawings")


def _update_job(job_id: str, **changes: Any) -> None:
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id].update(changes)


def _run_job(job_id: str, pdf: Optional[bytes], text: str, address: str) -> None:
    _update_job(job_id, status="running")
    try:
        if pdf is not None:
            result = extract_openings(pdf, address=address, progress=lambda page, pages: _update_job(job_id, page=page, pages=pages))
        else:
            result = extract_from_text(text)
        _update_job(job_id, status="done", result=result)
    except DrawingExtractionError as exc:
        _update_job(job_id, status="error", error=str(exc))
    except Exception:  # noqa: BLE001 - the job must always finish
        logger.exception("drawing job %s failed", job_id)
        _update_job(job_id, status="error", error="The drawing reader failed unexpectedly; see the API log.")
    finally:
        _update_job(job_id, finished=time.time())


def start_job(*, pdf: Optional[bytes] = None, text: str = "", address: str = "") -> str:
    """Queue a drawing PDF or a typed description; returns the job id to poll."""
    if pdf is not None:
        _check_pdf(pdf)
    else:
        text = _check_text(text)
    now = time.time()
    job_id = uuid.uuid4().hex
    with _jobs_lock:
        for stale in [key for key, job in _jobs.items() if job.get("finished") and now - job["finished"] > JOB_TTL_SECONDS]:
            del _jobs[stale]
        _jobs[job_id] = {
            "id": job_id, "kind": "drawings" if pdf is not None else "text", "status": "queued",
            "page": 0, "pages": 0, "result": None, "error": None, "finished": None,
        }
    _executor.submit(_run_job, job_id, pdf, text, address)
    return job_id


def job_status(job_id: str) -> Optional[dict[str, Any]]:
    with _jobs_lock:
        job = _jobs.get(job_id)
        return None if job is None else {key: value for key, value in job.items() if key != "finished"}
