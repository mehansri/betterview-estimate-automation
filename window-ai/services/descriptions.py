"""Customer-facing product descriptions for estimate lines."""
from __future__ import annotations

from typing import Any


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _pretty(value: Any) -> str:
    return _text(value).replace("_", " ").strip()


def _join(parts: list[str]) -> str:
    seen: set[str] = set()
    result: list[str] = []
    for part in parts:
        value = _text(part)
        key = value.casefold()
        if value and key not in seen:
            result.append(value)
            seen.add(key)
    return " - ".join(result)


def _with_custom_prefix(custom: Any, generated: str) -> str:
    prefix = _text(custom)
    if not prefix:
        return generated
    if not generated or generated.casefold() in prefix.casefold():
        return prefix
    return _join([prefix, generated])


def _size(spec: dict[str, Any]) -> str:
    width = spec.get("width")
    height = spec.get("height")
    if width is None and height is None:
        return ""
    if width is None:
        return f"{height} in high"
    if height is None:
        return f"{width} in wide"
    return f"{width} x {height} in"


def _window_options(spec: dict[str, Any]) -> list[str]:
    glazing = spec.get("glazing") or {}
    options: list[str] = []
    labels = (
        ("loe180", "LoE 180"),
        ("i89", "i89"),
        ("triple", "Triple pane"),
        ("tri_pane_lami", "Tri-pane laminated"),
        ("frost_tint", "Frost / tint"),
    )
    if isinstance(glazing, dict):
        options.extend(label for key, label in labels if glazing.get(key))
        gas = _pretty(glazing.get("gas"))
        if gas:
            options.append(f"{gas.title()} gas")
    product = "patio" if spec.get("type") in ("patio_sliding", "patio_swing") else "window"
    for accessory in spec.get("accessories") or []:
        if isinstance(accessory, dict):
            name = accessory_text(accessory, product)
            if name:
                options.append(name)
    if spec.get("kick_lock"):
        options.append("Kick lock")
    return options


def _fraction(value: float) -> str:
    """5.5 -> '5 1/2', 4.75 -> '4 3/4' (sixteenths), matching fmtInches()."""
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


def accessory_text(accessory: dict[str, Any], product: str = "window") -> str:
    """Customer text for an accessory; wood jambs read '5 1/2" primed wood jamb'
    (or 'unfinished' past the product's priming limit, see wood_jamb_finish)."""
    import re

    from services.windowcity.quote import wood_jamb_finish

    name = _text(accessory.get("name"))
    if accessory.get("kind") == "wood_jamb":
        depth = accessory.get("depth_in")
        if depth is not None:
            size = f'{_fraction(float(depth))}"'
        else:
            match = re.match(r'([\d/ ]+)"', name)
            size = f'{match.group(1).strip()}"' if match else ""
        return f"{size} {wood_jamb_finish(accessory, product)} wood jamb".strip()
    return name or _pretty(accessory.get("kind"))


def colour_text(specs: list[dict[str, Any]]) -> list[str]:
    """'Exterior colour: black' plus 'Interior colour: black' when not white."""
    exterior = _join([_text(item.get("colour_ext") or item.get("color")) for item in specs])
    interior = _join([
        _text(item.get("colour_int")) for item in specs
        if _text(item.get("colour_int")).lower() not in ("", "white")
    ])
    return [f"Exterior colour: {exterior}" if exterior else "",
            f"Interior colour: {interior}" if interior else ""]


def _num(value: Any) -> str:
    # Matches the frontend's fmt(): at most three decimals, no trailing zeros.
    return f"{round(float(value), 3):g}"


def energy_summary(ratings: list[dict[str, Any] | None]) -> str:
    """'ENERGY STAR Most Efficient - ER 38-44 - U-factor 0.17-0.18' when every part is rated."""
    if not ratings or any(r is None for r in ratings):
        return ""
    stars = {r.get("energy_star") for r in ratings}
    if stars == {"most_efficient"}:
        star = "ENERGY STAR Most Efficient"
    elif None not in stars:
        star = "ENERGY STAR qualified"
    else:
        star = ""
    ers = sorted({r["er"] for r in ratings})
    us = sorted({r["u_ip"] for r in ratings})
    er = f"ER {ers[0]}" if len(ers) == 1 else f"ER {ers[0]}-{ers[-1]}"
    u = f"U-factor {us[0]:g}" if len(us) == 1 else f"U-factor {us[0]:g}-{us[-1]:g}"
    return _join([star, er, u])


def unit_description(spec: dict[str, Any], common: list[str]) -> str:
    """Layout-first unit: series, size, section layout and each section's size."""
    from services.windowcity import layout
    from services.windowcity.catalog import CatalogError
    from services.windowcity.quote import _unit_sections

    series = layout.SERIES.get(spec.get("series") or layout.DEFAULT_SERIES, {})
    label = series.get("label", "Window")
    try:
        resolved, section_lines = _unit_sections(spec)
    except (CatalogError, KeyError, TypeError, ValueError):
        return _join([f"{label} window", _size(spec), *common])
    count = len(resolved.sections)
    if count == 1:
        head = f"{label} {layout.section_label(resolved.sections[0]).lower()} window"
        parts = [head, _size(spec)]
    else:
        parts = [
            f"{label} {count}-section window unit",
            _size(spec),
            layout.summary(spec.get("layout"), resolved.width, resolved.height),
            "Sections: " + ", ".join(
                f"{layout.section_label(sec)} {_num(sec.width)} x {_num(sec.height)}"
                for sec in resolved.sections),
        ]
    return _join([*parts, *common])


def bay_description(spec: dict[str, Any], common: list[str]) -> str:
    """Layout-first bay or bow: series, lite count, size and each lite."""
    from services.windowcity import layout
    from services.windowcity.catalog import CatalogError

    series = layout.SERIES.get(spec.get("series") or layout.DEFAULT_SERIES, {})
    kind = "Bow" if str(spec.get("style") or "bay").lower() == "bow" else "Bay"
    try:
        resolved = layout.resolve(spec.get("layout"), float(spec["width"]), float(spec["height"]))
    except (CatalogError, KeyError, TypeError, ValueError):
        return _join([f"{kind} window", _size(spec), *common])
    return _join([
        f"{series.get('label', 'Window')} {kind.lower()} window, {len(resolved.sections)} lites",
        _size(spec),
        "Lites: " + ", ".join(
            f"{layout.section_label(sec)} {_num(sec.width)} x {_num(sec.height)}" for sec in resolved.sections),
        _text(spec.get("head_seat")) and f"Head & seat: {_text(spec.get('head_seat'))}",
        *common,
    ])


def line_energy(spec: dict[str, Any]) -> str:
    """Energy summary for a unit or single window, '' when any part is unrated."""
    from services.windowcity.catalog import CatalogError, energy_rating, style
    from services.windowcity.quote import _unit_sections

    try:
        if spec.get("type") == "unit":
            _, section_lines = _unit_sections(spec)
            return energy_summary([energy_rating(l["style"], l["glazing"]) for l in section_lines])
        if spec.get("type", "window") == "window" and spec.get("style"):
            return energy_summary([energy_rating(style(str(spec["style"]))["code"], spec.get("glazing"))])
    except (CatalogError, KeyError, TypeError, ValueError):
        return ""
    return ""


def window_description(project_line: dict[str, Any]) -> str:
    """Return a complete customer-facing description for a window line."""
    spec = project_line.get("spec") or project_line
    line_type = _pretty(spec.get("type") or "window")
    nested_lites = [lite for lite in spec.get("lites") or [] if isinstance(lite, dict)]
    all_specs = [spec, *nested_lites]
    common = colour_text(all_specs)
    for item in all_specs:
        common.extend(_window_options(item))

    if line_type == "unit":
        generated = unit_description(spec, common)
    elif line_type == "window":
        generated = _join([_text(spec.get("style")) or "Window", _size(spec), *common])
    elif line_type == "patio sliding":
        nominal = spec.get("nominal_ft")
        generated = _join(
            [
                "Sliding patio door",
                f"{nominal} ft" if nominal is not None else "",
                _text(spec.get("operation")).upper(),
                *common,
            ]
        )
    elif line_type == "patio swing":
        generated = _join(
            [
                f"{_text(spec.get('kind')) or 'Swing'} patio door",
                _size(spec),
                *common,
            ]
        )
    elif line_type == "combination":
        lites = nested_lites
        styles = _join([_text(lite.get("style")) for lite in lites])
        generated = _join(
            [
                "Combination window assembly",
                f"Styles: {styles}" if styles else "",
                _size(lites[0]) if lites else "",
                *common,
            ]
        )
    elif line_type == "bay bow" and spec.get("layout"):
        generated = bay_description(spec, common)
    elif line_type == "bay bow":
        lites = nested_lites
        styles = _join([_text(lite.get("style")) for lite in lites])
        generated = _join(
            [
                "Bay / bow window assembly",
                f"{len(lites)} lites" if lites else "",
                f"Styles: {styles}" if styles else "",
                _text(spec.get("head_seat")),
                *common,
            ]
        )
    else:
        generated = _join([line_type.title(), _size(spec), *common])

    return _with_custom_prefix(project_line.get("description"), generated)


OPENING_TYPE_LABELS = {
    "single_door": "Single door",
    "single_1_sidelite": "Single + 1 sidelite",
    "single_2_sidelites": "Single + 2 sidelites",
    "double_door": "Double door",
    "double_2_sidelites": "Double + 2 sidelites",
}


def _door_part(part: dict[str, Any] | None) -> str:
    if not part:
        return ""
    glass = _text(part.get("glass"))
    glass_size = _text(part.get("glass_size"))
    panel = _text(part.get("panel"))
    series = _pretty(part.get("series"))
    details = [panel or series, glass, glass_size, _text(part.get("height"))]
    return _join(details)


def door_description(
    project_opening: dict[str, Any] | None,
    quote_opening: dict[str, Any] | None = None,
) -> str:
    """Return a complete customer-facing description for a door opening."""
    project_opening = project_opening or {}
    quote_opening = quote_opening or {}
    spec = project_opening.get("spec") or {}
    custom = _text(project_opening.get("description"))
    label = custom or _text(spec.get("label")) or _text(quote_opening.get("label"))
    material = _pretty(spec.get("material") or quote_opening.get("material"))
    opening_type = OPENING_TYPE_LABELS.get(
        _text(spec.get("opening_type") or quote_opening.get("opening_type")),
        _pretty(spec.get("opening_type") or quote_opening.get("opening_type")),
    )
    finish = _text(quote_opening.get("finish_label")) or _pretty(spec.get("finish"))
    if spec.get("pipeline"):
        from services.doors.pipeline import pipeline_summary

        generated = _join(pipeline_summary(spec["pipeline"]))
        return _with_custom_prefix(label if not custom else custom, generated)
    details = [material.title() if material else "Door", opening_type, finish]

    door = _door_part(spec.get("door"))
    if door:
        details.append(f"Door: {door}")
    door2 = _door_part(spec.get("door2"))
    if door2:
        details.append(f"Second door: {door2}")
    for index, sidelite in enumerate(spec.get("sidelites") or [], start=1):
        part = _door_part(sidelite)
        if part:
            details.append(f"Sidelite {index}: {part}")

    transom = spec.get("transom") or {}
    if transom:
        transom_details = ["Transom", _pretty(transom.get("shape")), _pretty(transom.get("glass"))]
        if transom.get("tempered"):
            transom_details.append("Tempered")
        details.append(_join(transom_details))

    panel_upcharge = spec.get("panel_upcharge") or {}
    if panel_upcharge:
        details.append(
            _join(["Panel upcharge", _text(panel_upcharge.get("panel")), _text(panel_upcharge.get("code"))])
        )
    for pull in spec.get("pull_bars") or []:
        if isinstance(pull, dict):
            details.append(
                _join(
                    [
                        "Pull bar",
                        _text(pull.get("length_in")) + ' in' if pull.get("length_in") else "",
                        _pretty(pull.get("finish")),
                        _pretty(pull.get("shape")),
                        _pretty(pull.get("block")),
                    ]
                )
            )
    for option in spec.get("options") or []:
        if isinstance(option, dict):
            value = _text(option.get("item"))
            if value:
                column = _text(option.get("column"))
                details.append(f"Option: {value}{f' ({column})' if column else ''}")

    if not spec:
        # Standalone door quotes do not retain the source spec in their
        # sanitized response; preserve their priced component choices here.
        details.extend(
            _text(item.get("customer_description") or item.get("description"))
            for item in quote_opening.get("line_items") or []
            if isinstance(item, dict)
        )

    generated = _join(details)
    return _with_custom_prefix(label if not custom else custom, generated)
