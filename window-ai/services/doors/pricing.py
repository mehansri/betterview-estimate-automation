"""Deterministic Palma Door pricing engine."""

from __future__ import annotations

import json
import re
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

from . import catalog


CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "door_pricing.json"
LAYOUTS = {
    "single_door": (1, 0),
    "single_1_sidelite": (1, 1),
    "single_2_sidelites": (1, 2),
    "double_door": (2, 0),
    "double_2_sidelites": (2, 2),
}


class DoorValidationError(Exception):
    """Raised when an opening does not satisfy the wizard prerequisites."""


DoorLookupError = catalog.DoorLookupError


def money(value: Any) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def load_config() -> dict[str, Any]:
    with CONFIG_PATH.open(encoding="utf-8") as handle:
        raw = json.load(handle)
    return {key: value for key, value in raw.items() if not key.startswith("_")}


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise DoorValidationError(message)


def _validate_part(part: dict[str, Any], label: str) -> None:
    _require(isinstance(part, dict), f"{label} is required.")
    _require(part.get("series") or part.get("glass"), f"{label} needs a series or decorative glass.")
    if part.get("glass"):
        # The series is derived from the glass; size/panel then select one row.
        _require(
            part.get("glass_size") is not None or part.get("panel") is not None,
            f"{label} needs a glass size or panel selection.",
        )
    if part.get("qty") is not None:
        _require(int(part["qty"]) >= 1, f"{label} quantity must be at least 1.")


def _validate_opening(spec: dict[str, Any]) -> None:
    opening_type = spec.get("opening_type")
    _require(opening_type in LAYOUTS, "Choose a valid opening type.")
    material = spec.get("material")
    _require(material in catalog.FINISHES, "Choose fiberglass or steel.")

    expected_doors, expected_sidelites = LAYOUTS[opening_type]
    _validate_part(spec.get("door"), "Door")
    has_second = bool(spec.get("door2"))
    _require(has_second == (expected_doors == 2), "Opening type and door leaves do not match.")
    if has_second:
        _validate_part(spec["door2"], "Second door")

    sidelites = spec.get("sidelites") or []
    _require(
        len(sidelites) == expected_sidelites,
        "Opening type and sidelite count do not match.",
    )
    for index, sidelite in enumerate(sidelites, start=1):
        _validate_part(sidelite, f"Sidelite {index}")

    if spec.get("transom"):
        transom = spec["transom"]
        _require(transom.get("shape") in {"rectangle", "shapes"}, "Choose a valid transom shape.")
        if transom.get("glass"):
            _require(float(transom.get("sq_ft", 0)) > 0, "Transom glass area must be greater than zero.")

    for index, pull in enumerate(spec.get("pull_bars") or [], start=1):
        _require(pull.get("block"), f"Pull bar {index} needs a hardware block.")


class DoorQuote:
    def __init__(self, spec: dict[str, Any], config: dict[str, Any]):
        self.spec = spec
        self.config = config
        self.material = spec["material"]
        finish_value = spec.get("finish") or config["default_finish"][self.material]
        self.finish = catalog.resolve_finish(finish_value, self.material)
        self.items: list[dict[str, Any]] = []
        self.notes: list[str] = []

    def add(self, row: str, description: str, unit: float, qty: int = 1, source: str | None = None) -> None:
        self.items.append(
            {
                "row": row,
                "description": description,
                "customer_description": _customer_text(description),
                "qty": qty,
                "unit_list": money(unit),
                "list": money(unit * qty),
                "source": source,
            }
        )

    def _series_for(self, part: dict[str, Any]) -> tuple[str, str | None]:
        if part.get("series"):
            return part["series"], None
        series, record = catalog.series_for_glass(part["glass"])
        return series, record["name"]

    def add_slab(self, part: dict[str, Any], row_label: str, component: str) -> None:
        series, glass_note = self._series_for(part)
        height = part.get("height", '6\'8"')
        record = catalog.find_slab(
            self.material,
            series,
            component=component,
            glass_size=part.get("glass_size"),
            panel=part.get("panel"),
            height=height,
        )
        price = record["prices"][self.finish]
        label = " ".join(value for value in (record.get("glass_size"), record.get("panel")) if value)
        description = f"{record['series_label']} — {label}"
        if glass_note:
            description = f"{glass_note} ({record['series_label']}) — {label}"
        # The design names the pattern for the order spec; the pricing group
        # (series) alone sets the price, so a rep can lock a number before the
        # customer has picked the exact glass.
        design = part.get("design")
        if design:
            description = f"{description}, design: {design}"
        elif record["series"] in {"group_a", "group_b", "group_c", "group_d"} and not glass_note:
            self.notes.append(
                f"{row_label}: glass design to be selected — price is set by the "
                f"{record['series_label']} group and will not change with the design."
            )
        self.add(
            row_label,
            f"{description}, {catalog.FINISH_LABELS[self.finish]}",
            price,
            int(part.get("qty", 1)),
            f"{self.material} p{record['source_page']}",
        )

    def add_panel_upcharge(self, part: dict[str, Any]) -> None:
        record, choice = catalog.panel_upcharge(
            self.material,
            code=part.get("code"),
            panel=part.get("panel"),
            height=part.get("height", '6\'8"'),
            width=float(part.get("width", 36)),
        )
        if not choice["upcharge"]:
            self.notes.append(f"{record['panel']} ({record['code']}) carries no upcharge.")
            return
        self.add(
            "Upcharge Option",
            f"Panel upcharge — {record['panel']} {record['code']} ({choice['sizes']})",
            choice["upcharge"],
            int(part.get("qty", 1)),
            f"{self.material} p{record['source_page']}",
        )

    def add_option(self, option: dict[str, Any]) -> None:
        record = catalog.find_option(self.material, option.get("category"), option["item"])
        price = catalog.option_price(record, option.get("column"))
        row_by_category = {
            "hinges": "Hinges",
            "sills": "Sill",
            "jambs_brickmould": "Brickmould",
            "glass_frame_options": "Upcharge Option",
            "ferco_multi_point_locks_handles": "Multipoint",
            "other_multi_point_handles": "Multipoint",
            "ferco_smart_lock": "Multipoint",
            "parts_other": "Hinges",
        }
        self.add(
            option.get("row") or row_by_category.get(record["category"], "Extras 1"),
            record["item"],
            price,
            int(option.get("qty", 1)),
            f"{self.material} p{record['source_page']}",
        )

    def add_transom(self, transom: dict[str, Any]) -> None:
        record = catalog.transom(self.material, transom.get("shape", "rectangle"))
        frame = record["frame"][self.finish]
        self.add(
            "Transom",
            f"{record['shape_label']} transom frame, {catalog.FINISH_LABELS[self.finish]}",
            frame,
            int(transom.get("qty", 1)),
            f"{self.material} p{record['source_page']}",
        )
        glass = transom.get("glass")
        if glass:
            rates = record["glass_per_sqft"]
            key = next((key for key in rates if catalog._norm(glass) in catalog._norm(key)), None)
            if key is None:
                raise DoorLookupError(
                    f"Unknown transom glass {glass!r}. Options: {', '.join(rates)}"
                )
            actual_sq_ft = float(transom.get("sq_ft", 0))
            minimums = record.get("minimum_sqft") or [0]
            floor = minimums[0] if len(minimums) == 1 or self.spec["opening_type"] == "single_door" else minimums[-1]
            billed_sq_ft = max(actual_sq_ft, floor)
            if billed_sq_ft > actual_sq_ft:
                self.notes.append(
                    f"Transom glass billed at the {floor:g} sq.ft. minimum (actual {actual_sq_ft:g} sq.ft.)."
                )
            self.add(
                "Transom",
                f"{rates[key]['label']} — {billed_sq_ft:g} sq.ft. @ ${rates[key]['rate']:g}",
                rates[key]["rate"] * billed_sq_ft,
                int(transom.get("qty", 1)),
                f"{self.material} p{record['source_page']}",
            )
        if transom.get("tempered"):
            self.add(
                "Transom",
                f"{record['shape_label']} transom — tempered glass",
                record["tempering_per_unit"],
                int(transom.get("qty", 1)),
                f"{self.material} p{record['source_page']}",
            )

    def add_pull_bar(self, pull: dict[str, Any]) -> None:
        record = catalog.pull_bar(
            self.material,
            style=pull.get("style", "straight"),
            block=pull.get("block"),
            length_in=int(pull.get("length_in", 36)),
            finish=pull.get("finish", "satin"),
            shape=pull.get("shape", "round"),
        )
        description = (
            f"{record['style'].title()} pull bar {record['length_in']}\" "
            f"{record['finish_label']} {record['shape']}, {record['block_label']}"
        )
        self.add(
            "Multipoint",
            description,
            record["price"],
            int(pull.get("qty", 1)),
            f"{self.material} p{record['source_page']}",
        )

    # -- standing defaults --------------------------------------------------

    def apply_defaults(self) -> None:
        """Add the lines every real order carries whether or not they're asked for.

        A quote built only from what the customer says out loud reliably misses
        the sill, hinges and brickmould — on a recent real order that was $415
        of list. These go on automatically; a spec silences one by pricing that
        row itself or by naming it in ``skip_defaults``.
        """
        defaults = self.config.get("quote_defaults") or {}
        if not defaults:
            return
        skip = {str(entry).lower() for entry in self.spec.get("skip_defaults") or []}
        rows = {item["row"] for item in self.items}

        if defaults.get("sill") and "Sill" not in rows and "sill" not in skip:
            self.add_option({"category": "sills", "item": defaults["sill"]})

        if defaults.get("hd_hinges") and "Hinges" not in rows and "hinges" not in skip:
            slab_count = sum(1 for key in ("door", "door2") if self.spec.get(key))
            if slab_count:
                self.add_option(
                    {"category": "hinges", "item": "Heavy-Duty", "qty": slab_count}
                )

        if (
            defaults.get("brickmould")
            and "Brickmould" not in rows
            and "brickmould" not in skip
        ):
            self._add_default_brickmould(int(defaults.get("brickmould_qty", 3)))

    def _add_default_brickmould(self, qty: int) -> None:
        length = '101"' if self._tall_opening() else '84"'
        if self.finish == "factory_white":
            word = "White"
        elif self.finish.startswith("stain"):
            word = "Stained"
        else:
            word = "Painted"
        try:
            self.add_option(
                {
                    "category": "jambs_brickmould",
                    "item": f'{length} Regular 2" or Flat 1-1/2" {word}',
                    "qty": qty,
                }
            )
        except DoorLookupError:
            # Standard white brickmould is not a priced line — only painted,
            # stained and the 101" lengths are upcharges — so it ships
            # included. Say so rather than leaving the quote silent.
            self.notes.append(
                f'{length} {word.lower()} brickmould is included at no charge '
                f'(the book prices only painted, stained and 101" as upcharges).'
            )

    def _tall_opening(self) -> bool:
        """True when the opening needs 101" brickmould rather than 84"."""
        if self.spec.get("transom"):
            return True
        for key in ("door", "door2"):
            part = self.spec.get(key) or {}
            if part.get("height") in ("7'0\"", "8'0\""):
                return True
        for option in self.spec.get("options") or []:
            if re.search(r"[78]'\s*System", str(option.get("item", ""))):
                return True
        return False

    def totals(self) -> dict[str, Any]:
        list_total = money(sum(item["list"] for item in self.items))
        discount = float(self.config["discount"])
        material_cost = money(list_total * discount)
        install = money(self.config["install"][self.spec["opening_type"]])
        if self.spec.get("transom"):
            install = money(install + self.config["install"].get("transom_adder", 0))
        subtotal = money(material_cost + install)
        markup = float(self.config["markup"])
        sell = money(subtotal * (1 + markup))
        hst_rate = float(self.config["hst"])
        hst = money(sell * hst_rate)
        return {
            "label": self.spec.get("label") or "Opening",
            "opening_type": self.spec["opening_type"],
            "material": self.material,
            "finish": self.finish,
            "finish_label": catalog.FINISH_LABELS[self.finish],
            "line_items": self.items,
            "list_total": list_total,
            "discount": discount,
            "material_cost": material_cost,
            "install_tier": self.spec["opening_type"],
            "install": install,
            "cost_subtotal": subtotal,
            "markup": markup,
            "markup_amount": money(sell - subtotal),
            "sell": sell,
            "hst_rate": hst_rate,
            "hst": hst,
            "customer_total": money(sell + hst),
            "notes": self.notes,
        }


def _customer_text(description: str) -> str:
    text = description
    text = re.sub(r"\s*\([^)]*\)", "", text)
    text = re.sub(r"\s*/\s*(box|door|sidelite|doorlite|pc|side|set)\b", "", text)
    replacements = {
        "Hight Performance": "High Performance",
        "compatiable": "compatible",
        "Accesories": "Accessories",
        "Panles": "Panels",
    }
    for wrong, right in replacements.items():
        text = text.replace(wrong, right)
    return re.sub(r"\s{2,}", " ", text).strip(" -—,")


def quote(spec: dict[str, Any], config: dict[str, Any] | None = None) -> dict[str, Any]:
    _validate_opening(spec)
    cfg = config or load_config()
    quote_obj = DoorQuote(spec, cfg)
    quote_obj.add_slab(spec["door"], "Door Slab", "door")
    if spec.get("door2"):
        quote_obj.add_slab(spec["door2"], "Door Slab 2", "door")
    if spec.get("panel_upcharge"):
        quote_obj.add_panel_upcharge(spec["panel_upcharge"])
    for index, sidelite in enumerate(spec.get("sidelites") or []):
        component = "direct_glazed_sidelite" if sidelite.get("direct_glazed") else "sidelite"
        quote_obj.add_slab(sidelite, "Sidelite" if index == 0 else "Sidelite 2", component)
    if spec.get("transom"):
        quote_obj.add_transom(spec["transom"])
    for pull in spec.get("pull_bars") or []:
        quote_obj.add_pull_bar(pull)
    for option in spec.get("options") or []:
        quote_obj.add_option(option)
    quote_obj.apply_defaults()
    return quote_obj.totals()


def quote_project(specs: list[dict[str, Any]], config: dict[str, Any] | None = None) -> dict[str, Any]:
    if not specs:
        raise DoorValidationError("At least one door opening is required.")
    cfg = config or load_config()
    openings = [quote(spec, cfg) for spec in specs]
    keys = (
        "list_total",
        "material_cost",
        "install",
        "cost_subtotal",
        "markup_amount",
        "sell",
        "hst",
        "customer_total",
    )
    return {
        "openings": openings,
        "totals": {key: money(sum(opening[key] for opening in openings)) for key in keys},
    }
