"""Window City "Order Checklist" PDF -> estimate window lines, no LLM.

The checklist PDF has real text. Each item starts with ``<item#> <qty> <room>``
followed by its configuration line (``C1- Casement (left) SINGLE FRAME cl``,
``F1 - Fixed ...``, ``C2 - Casement (left)+Casement (right) clcr``,
``Patio Door 5 ft XO5``). Mulled units list their sections as separate items
(``18.1``, ``18.2``) anywhere in the document; those become the children of
the parent's ``cols`` layout and are not lines of their own.

Hinges, like the order's drawings, are as viewed from outside.

Output is the ``windows[]`` shape /api/customer-estimates accepts:
``{"location", "description", "spec", "details"}``.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from typing import Any

from . import layout

# Window City style code -> (series, operation). Units carry the series and an
# op per section; the layout resolves the code back.
STYLE_OPS: dict[str, tuple[str, str]] = {
    code: (series, op)
    for series, entry in layout.SERIES.items()
    for op, code in entry["styles"].items()
}

ITEM_HEADER = re.compile(r"^(\d+(?:\.\d+)?)\s+(\d+)\s+(\S.*?)\s*$")
CONFIG_LINE = re.compile(r"^(?:[A-Z]{1,3}\d+\s*-|Patio Door\b)")
FRAME_SIZE = re.compile(r"Frame Size W:\s*([\d.]+)\s*x\s*H:\s*([\d.]+)")
DIVISION = re.compile(r"^Division\s+([\d.:\s]+?)\s*inch", re.M)
STYLE_CODE = re.compile(r"\b((?:WC|HC)-\d{3})\b")
COLOUR = re.compile(r"Color:\s*outside:\s*(.+?)\s*/\s*inside:\s*(.+?)\s*(?:\b[a-z]{1,3})?\s*$", re.M)
HINGE = re.compile(r"^(left|right|top)\s+hinge\b", re.M)
WOOD_JAMB = re.compile(r"-wood jamb\s+([\d.]+)''\s*,\s*color:\s*([A-Za-z]+)")
BRICKMOULD = re.compile(r"\b(Classic|Heritage)\s+BM\s*-\s*([\d /]+?)\s*inch", re.I)
SCREEN = re.compile(r"-\s*Full Screen\s*,?\s*Color:\s*([^,]+),\s*Mesh Color\s*:\s*(\S+)")
SPACER = re.compile(r"^-(.+?)\s+Spacer\b", re.M)
PATIO = re.compile(r"Patio Door\s+(\d+)\s*ft\s+(XO|OX|OXXO|XOOX|OXO|XOX)\d*", re.I)
SECTION_NAME = re.compile(r"(Casement|Fixed|Awning|Slider|Picture)\s*(?:\((left|right)\))?", re.I)

# Configuration-line words -> layout op (mulled units with no section items).
NAMED_OPS = {"casement": "casement", "fixed": "fixed", "picture": "fixed", "awning": "awning",
             "slider": "single_slider"}


class OrderChecklistError(ValueError):
    """The document is not a Window City order checklist this parser can read."""


@dataclass
class Item:
    number: str
    qty: int
    room: str
    lines: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(self.lines)

    @property
    def parent(self) -> str | None:
        return self.number.split(".")[0] if "." in self.number else None

    @property
    def config(self) -> str:
        return self.lines[0] if self.lines else ""


def pdf_text(content: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _fraction(value: float) -> str:
    """6.25 -> '6 1/4', 4.5 -> '4 1/2', 9 -> '9' (sixteenths)."""
    whole = int(value)
    sixteenths = round((value - whole) * 16)
    if sixteenths == 16:
        whole, sixteenths = whole + 1, 0
    if not sixteenths:
        return str(whole)
    num, den = sixteenths, 16
    while num % 2 == 0:
        num, den = num // 2, den // 2
    return f"{whole} {num}/{den}" if whole else f"{num}/{den}"


def _number(value: str) -> float | int:
    number = float(value)
    return int(number) if number.is_integer() else round(number, 4)


def split_items(text: str) -> tuple[dict[str, Any], list[Item]]:
    """Order header facts and the items in document order."""
    rows = [row.rstrip() for row in text.replace("\r", "").split("\n")]
    header: dict[str, Any] = {}
    for row in rows[:40]:
        if not header.get("order_number") and re.fullmatch(r"\d{9}", row.strip()):
            header["order_number"] = row.strip()
        m = re.match(r"Client information:\s*(.*)", row)
        if m:
            header["client"] = m.group(1).strip()
    if "Order Checklist" not in text:
        raise OrderChecklistError("This PDF is not a Window City order checklist.")

    items: list[Item] = []
    current: Item | None = None
    for index, row in enumerate(rows):
        stripped = row.strip()
        m = ITEM_HEADER.match(stripped)
        following = next((r.strip() for r in rows[index + 1:index + 3] if r.strip()), "")
        if m and CONFIG_LINE.match(following):
            current = Item(m.group(1), int(m.group(2)), m.group(3))
            items.append(current)
            continue
        if m and CONFIG_LINE.match(m.group(3)):
            # No room name: the configuration shares the item line
            # ("1 8 F1 - Fixed SINGLE FRAME p", order 125401082).
            current = Item(m.group(1), int(m.group(2)), "", [m.group(3)])
            items.append(current)
            continue
        if "Total Qty" in stripped:
            current = None
            continue
        if current is not None and stripped:
            current.lines.append(stripped)
    if not items:
        raise OrderChecklistError("No order items were found in this PDF.")
    return header, items


def _colours(text: str) -> tuple[str, str]:
    m = COLOUR.search(text)
    if not m:
        return "white", "white"
    return m.group(1).strip().lower(), m.group(2).strip().lower()


def _glazing(text: str) -> dict[str, Any]:
    lowered = text.lower()
    # "Low E 180", "Low E180" and "LowE 180  Neat Glass" (order 125400662) all name LoE 180.
    glazing: dict[str, Any] = {"loe180": bool(re.search(r"low\s*e\s*180", lowered))}
    if "i89" in lowered:
        glazing["i89"] = True
    if "triple pane" in lowered:
        glazing["triple"] = True
    gas = re.search(r"gas option\s*-\s*(.+?)\s+gas filled", lowered)
    if gas:
        mix = gas.group(1)
        argon = re.search(r"(\d+)%\s*argon", mix)
        krypton = re.search(r"(\d+)%\s*krypton", mix)
        if argon and krypton:
            glazing["gas"] = f"{argon.group(1)}/{krypton.group(1)}"
        elif krypton or "krypton" in mix:
            glazing["gas"] = "krypton"
        else:
            glazing["gas"] = "argon"
    else:
        glazing["gas"] = "argon"
    return glazing


def _accessories(text: str, *, patio: bool, warnings: list[str], tag: str) -> list[dict[str, Any]]:
    accessories: list[dict[str, Any]] = []
    if re.search(r"-brickmould\b", text):
        bm = BRICKMOULD.search(text)
        if patio:
            accessories.append({"kind": "brickmould", "name": "Brickmould EP326 installed"})
        elif bm:
            size = bm.group(2).strip()
            if size == "0" and "EP326" in text:
                # "Classic BM - 0 inch, EP326-0" (order 125401101) is the
                # installed 1" Classic brickmould, EP326.
                size = "1"
            accessories.append({"kind": "brickmould",
                                "name": f'{size}" brickmould ({bm.group(1).lower()})'})
        else:
            warnings.append(f"Item {tag}: brickmould type not recognised; add it by hand")
    jamb = WOOD_JAMB.search(text)
    if jamb:
        depth = float(jamb.group(1))
        finish = "primed" if jamb.group(2).lower().startswith("primed") else "unfinished"
        accessories.append({"kind": "wood_jamb", "name": f'{_fraction(depth)}"', "depth_in": _number(jamb.group(1)),
                            "finish": finish})
    if not patio and re.search(r"-\s*nailing flange\b", text, re.I):
        # "-nailing flange , lenght 23 ft. nail_flang" (order 125401151)
        accessories.append({"kind": "misc", "name": "Nailing Flange"})
    return accessories


def _details(item: Item, *, notes: list[str]) -> dict[str, Any]:
    text = item.text
    details: dict[str, Any] = {"tag": item.number}
    screen = SCREEN.search(text)
    details["screen"] = ({"frame_colour": screen.group(1).strip().lower(), "mesh_colour": screen.group(2).strip().lower()}
                         if screen else None)
    hardware = []
    if re.search(r"fold away handle", text, re.I):
        m = re.search(r"-fold away handle\s*,\s*(\w+)", text, re.I)
        hardware.append(f"Fold-away handle{', ' + m.group(1).lower() if m else ''}")
    m = re.search(r"^(Twin Point .+?)$", text, re.M)
    if m:
        hardware.append(m.group(1).strip())
    if hardware:
        details["hardware"] = "; ".join(hardware)
    spacer = SPACER.search(text)
    if spacer:
        details["spacer"] = spacer.group(1).strip()
    jamb = WOOD_JAMB.search(text)
    if jamb:
        details["jamb_finish"] = "primed" if jamb.group(2).lower().startswith("primed") else "unfinished"
    if notes:
        details["notes"] = "; ".join(notes)
    return details


GRILLE_FIELD = re.compile(r"-grill\s+field#\s*\d+\s*,\s*type\s+(.+?)\s+Grill\s*,\s*Color-\s*(\w+)", re.I)
GRILLE_GRID = re.compile(r"\b(\d+)\s+by\s+(\d+)\s+grid\b", re.I)
GRILLE_COLOURS = {"white": "white", "ww": "white", "black": "black", "jj": "black", "jw": "two-tone"}


def _grilles(text: str, warnings: list[str], tag: str) -> dict[str, Any] | None:
    """'-grill field# 1, type Colonial Grill, Color- black' + '2 by 2 grid' -> 4 squares."""
    field_match = GRILLE_FIELD.search(text)
    if not field_match:
        return None
    kind, colour = field_match.group(1).lower(), field_match.group(2).lower()
    squares = sum(int(a) * int(b) for a, b in GRILLE_GRID.findall(text))
    if not squares:
        warnings.append(f"Item {tag}: grilles without a readable grid; add them by hand")
        return None
    if "simulated" in kind:
        style = "sdl heritage" if re.search(r"\bHC-\d{3}", text) else "sdl classic"
    elif "two-tone" in kind or "two tone" in kind:
        style, colour = "colonial", "two-tone"
    else:
        style = "georgian" if "georgian" in kind else "pencil" if "pencil" in kind else "colonial"
    return {"style": style, "colour": GRILLE_COLOURS.get(colour, colour), "squares": squares}


def _leaf_from_section(item: Item, warnings: list[str]) -> dict[str, Any]:
    code = STYLE_CODE.search(item.text)
    op = STYLE_OPS.get(code.group(1), (None, None))[1] if code else None
    if op is None:
        op = _ops_from_config(item.config)[0]["op"]
    leaf: dict[str, Any] = {"op": op}
    grilles = _grilles(item.text, warnings, item.number)
    if grilles:
        leaf["grilles"] = grilles
    hinge = HINGE.search(item.text)
    if op in ("casement", "single_slider") and hinge:
        leaf["hinge"] = hinge.group(1)
    elif op == "awning":
        leaf["hinge"] = "top"
    elif op == "casement":
        warnings.append(f"Item {item.number}: casement hinge side not found")
    return leaf


def _ops_from_config(config: str) -> list[dict[str, Any]]:
    """'C4 - Casement (left)+Fixed clp' -> [casement left, fixed]."""
    body = re.sub(r"^[A-Z]{1,3}\d+\s*-\s*", "", config)
    leaves = []
    for part in body.split("+"):
        m = SECTION_NAME.search(part)
        if not m:
            continue
        op = NAMED_OPS[m.group(1).lower()]
        leaf: dict[str, Any] = {"op": op}
        if m.group(2):
            leaf["hinge"] = m.group(2).lower()
        elif op == "awning":
            leaf["hinge"] = "top"
        leaves.append(leaf)
    return leaves


def _window_line(item: Item, sections: list[Item], warnings: list[str]) -> dict[str, Any]:
    text = item.text
    size = FRAME_SIZE.search(text)
    if not size:
        raise OrderChecklistError(f"Item {item.number}: no frame size")
    width, height = _number(size.group(1)), _number(size.group(2))
    code = STYLE_CODE.search(text)
    mulled = "mulled units" in text.lower() or bool(sections)
    series = None
    if code and code.group(1) in STYLE_OPS:
        series = STYLE_OPS[code.group(1)][0]
    if series is None:
        for section in sections:
            sc = STYLE_CODE.search(section.text)
            if sc and sc.group(1) in STYLE_OPS:
                series = STYLE_OPS[sc.group(1)][0]
                break
    if series is None:
        series = "heritage" if re.search(r"heritage", text, re.I) else layout.DEFAULT_SERIES
        if not mulled:
            warnings.append(f"Item {item.number}: style {code.group(1) if code else 'code'} not recognised; "
                            f"priced as {series} — check it")

    notes: list[str] = []
    if mulled:
        children = [_leaf_from_section(s, warnings) for s in sorted(sections, key=lambda s: float(s.number))]
        if not children:
            children = _ops_from_config(item.config)
            if children:
                warnings.append(f"Item {item.number}: section details missing; layout read from "
                                f"'{item.config}'")
        division = DIVISION.search(text)
        parts = [float(p) for p in division.group(1).split(":")] if division else []
        # "Fixed over Awning" stacks its sections; everything else sits side by side.
        stacked = " over " in item.config.lower()
        # Each section item carries its own frame size. The Division line is
        # not always in section order (order 125401151 item 1, "Fixed +
        # Casement (right)", Division 24:48, has the 48" fixed as section 1.1),
        # so each section takes the Division value nearest its own frame --
        # frames run 0.025" under nominal and the book bills the nominal size.
        section_sizes = []
        for section in sorted(sections, key=lambda s: float(s.number)):
            frame = FRAME_SIZE.search(section.text)
            section_sizes.append(float(frame.group(2 if stacked else 1)) if frame else None)
        if children and len(section_sizes) == len(children) and None not in section_sizes:
            remaining = list(parts) if len(parts) == len(children) else []
            nominal = []
            for size in section_sizes:
                if remaining:
                    match = min(remaining, key=lambda p: abs(p - size))
                    remaining.remove(match)
                    nominal.append(match)
                else:
                    nominal.append(size + 0.025)
            sizes: list[Any] = [_number(str(round(p, 4))) for p in nominal[:-1]] + ["*"]
        elif len(parts) == len(children):
            sizes = [_number(str(p)) for p in parts[:-1]] + ["*"]
            warnings.append(f"Item {item.number}: section sizes read from the Division line; "
                            "check the order of the sections")
        else:
            if parts:
                warnings.append(f"Item {item.number}: {len(parts)} divisions for {len(children)} sections")
            sizes = ["*"] * len(children)
        tree: dict[str, Any] = {"split": "rows" if stacked else "cols", "sizes": sizes, "children": children}
        if division:
            notes.append(f"Division {':'.join(_fraction(p) for p in parts)}")
        if len(children) < 2:
            raise OrderChecklistError(f"Item {item.number}: mulled unit without readable sections")
    else:
        tree = _leaf_from_section(item, warnings)

    colour_ext, colour_int = _colours(text)
    spec = {
        "type": "unit",
        "series": series,
        "width": width,
        "height": height,
        "qty": item.qty,
        "colour_ext": colour_ext,
        "colour_int": colour_int,
        "glazing": _glazing(text if not mulled else "\n".join([text, *(s.text for s in sections)])),
        "accessories": _accessories(text, patio=False, warnings=warnings, tag=item.number),
        "layout": tree,
    }
    detail_source = Item(item.number, item.qty, item.room, [*item.lines, *(l for s in sections for l in s.lines)])
    return {"location": item.room, "description": "", "spec": spec,
            "details": _details(detail_source, notes=notes)}


def _patio_line(item: Item, warnings: list[str]) -> dict[str, Any]:
    text = item.text
    m = PATIO.search(item.config)
    if not m:
        raise OrderChecklistError(f"Item {item.number}: patio door size/operation not readable "
                                  f"('{item.config}')")
    colour_ext, colour_int = _colours(text)
    glazing = _glazing(text)
    accessories = _accessories(text, patio=True, warnings=warnings, tag=item.number)
    for accessory in accessories:
        if accessory["kind"] == "wood_jamb":
            accessory.pop("name", None)
    notes = []
    size = FRAME_SIZE.search(text)
    if size:
        notes.append(f"Frame {_fraction(float(size.group(1)))} x {_fraction(float(size.group(2)))}")
    spec: dict[str, Any] = {
        "type": "patio_sliding",
        "nominal_ft": int(m.group(1)),
        "operation": m.group(2).upper(),
        "qty": item.qty,
        "colour_ext": colour_ext,
        "colour_int": colour_int,
        "glazing": glazing,
        "assembled": bool(re.search(r"-assembled\b", text)) or bool(accessories),
        "kick_lock": bool(re.search(r"kick lock", text, re.I)),
        "accessories": accessories,
    }
    return {"location": item.room, "description": "", "spec": spec, "details": _details(item, notes=notes)}


def lines_from_text(text: str) -> dict[str, Any]:
    """Parse checklist text into ``{"order": {...}, "windows": [...], "warnings": [...]}``."""
    header, items = split_items(text)
    warnings: list[str] = []
    sections: dict[str, list[Item]] = {}
    for item in items:
        if item.parent:
            sections.setdefault(item.parent, []).append(item)
    tops = sorted((item for item in items if not item.parent), key=lambda item: float(item.number))
    numbers = {item.number for item in tops}
    for parent in sections:
        if parent not in numbers:
            warnings.append(f"Sections {', '.join(s.number for s in sections[parent])} have no item {parent}; "
                            "skipped")

    windows: list[dict[str, Any]] = []
    for item in tops:
        try:
            if item.config.lower().startswith("patio door") or "WC-500" in item.text:
                windows.append(_patio_line(item, warnings))
            else:
                windows.append(_window_line(item, sections.get(item.number, []), warnings))
        except OrderChecklistError as exc:
            warnings.append(str(exc))

    units = sum(int(line["spec"].get("qty", 1)) for line in windows)
    return {"order": {**header, "lines": len(windows), "units": units}, "windows": windows, "warnings": warnings}


def lines_from_pdf(content: bytes) -> dict[str, Any]:
    try:
        text = pdf_text(content)
    except Exception as exc:  # pypdf raises a zoo of errors on non-PDF input
        raise OrderChecklistError("The file could not be read as a PDF.") from exc
    return lines_from_text(text)
