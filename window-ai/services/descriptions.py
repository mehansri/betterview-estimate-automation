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
    for accessory in spec.get("accessories") or []:
        if isinstance(accessory, dict):
            name = _text(accessory.get("name") or accessory.get("kind"))
            if name:
                options.append(name)
    return options


def window_description(project_line: dict[str, Any]) -> str:
    """Return a complete customer-facing description for a window line."""
    spec = project_line.get("spec") or project_line
    line_type = _pretty(spec.get("type") or "window")
    nested_lites = [lite for lite in spec.get("lites") or [] if isinstance(lite, dict)]
    all_specs = [spec, *nested_lites]
    colours = _join([_text(item.get("colour_ext") or item.get("color")) for item in all_specs])
    common = [f"Exterior colour: {colours}" if colours else ""]
    for item in all_specs:
        common.extend(_window_options(item))

    if line_type == "window":
        generated = _join([_text(spec.get("style")) or "Window", _size(spec), *common])
    elif line_type == "patio sliding":
        nominal = spec.get("nominal_ft")
        generated = _join(
            [
                "Sliding patio door",
                f"{nominal} ft" if nominal is not None else "",
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
