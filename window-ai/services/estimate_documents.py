"""Customer-safe estimate view and the server-rendered PDF.

``customer_view`` is the only shape that leaves the business: it never
includes dealer cost, profit, floors, or the raw engine responses.
"""
from __future__ import annotations

import base64
import io
import re
from datetime import date
from pathlib import Path
from typing import Any

from services import business_settings
from services.doors.pipeline import door_lites
from services.windowcity.layout import exterior_colour

# A copy of frontend/public/branding/better-view-solutions.png: the API's Vercel
# bundle does not include frontend/, so the PDF printed the name instead of the logo.
LOGO_PATH = Path(__file__).resolve().parent / "assets" / "better-view-solutions.png"


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _with_window_colours(windows: dict[str, Any], row, pricing: dict[str, Any]) -> dict[str, Any]:
    """Snapshots priced before drawings carried a colour take it from the saved line."""
    lines = windows.get("lines") or []
    if all(not line.get("drawing") or line["drawing"].get("exterior_colour") for line in lines):
        return windows
    from services.customer_estimates import apply_tier

    tier = next((t for t in row.tiers or [] if str(t.get("id")) == str(pricing.get("selected_tier"))), None)
    specs = {str(line.get("id")): line.get("spec") or {} for line in apply_tier(row.windows or [], tier)}
    return {**windows, "lines": [
        {**line, "drawing": {**line["drawing"], "exterior_colour": exterior_colour(specs.get(str(line.get("id"))) or {})}}
        if line.get("drawing") and not line["drawing"].get("exterior_colour") else line
        for line in lines
    ]}


def customer_view(row) -> dict[str, Any]:
    pricing = row.pricing_snapshot or {}
    sections = pricing.get("sections") or {}
    tiers = [
        {key: tier.get(key) for key in ("id", "name", "description", "subtotal", "hst", "total", "financing", "deposit", "selected")}
        for tier in pricing.get("tiers") or []
        if not tier.get("error")
    ]
    acceptance = row.acceptance or None
    expired = bool(row.valid_until and row.valid_until < date.today())
    return {
        "estimate_number": row.estimate_number,
        "status": row.status,
        "revision_number": row.revision_number or 1,
        # Openings taken from a same-model home, not yet measured on site.
        "preliminary": bool(getattr(row, "is_preliminary", False)),
        "customer_name": row.customer_name or "",
        "company_name": row.company_name or "",
        "email": row.email or "",
        "phone": row.phone or "",
        "project_name": row.project_name or "",
        "project_address": row.project_address or "",
        "salesperson": row.salesperson or "",
        "estimate_date": _iso(row.estimate_date),
        "valid_until": _iso(row.valid_until),
        "expired": expired,
        "description": row.description or "",
        "notes": row.notes or "",
        "terms": row.terms or "",
        "sections": {
            "windows": _with_window_colours(sections.get("windows") or {"lines": [], "subtotal": 0}, row, pricing),
            "doors": sections.get("doors") or {"openings": [], "subtotal": 0},
            "adders": sections.get("adders") or {"lines": [], "subtotal": 0},
        },
        "totals": {
            key: (pricing.get("totals") or {}).get(key)
            for key in ("subtotal", "hst", "tax_label", "tax_lines", "total", "base_subtotal", "discount", "currency")
        },
        "tiers": tiers,
        "selected_tier": pricing.get("selected_tier"),
        "financing": pricing.get("financing"),
        "deposit": pricing.get("deposit") or 0,
        "company": business_settings.get_group("company"),
        "accepted": {
            "name": acceptance.get("name"),
            "accepted_at": acceptance.get("accepted_at"),
            "tier_name": acceptance.get("tier_name"),
            "total": acceptance.get("total"),
            "deposit": acceptance.get("deposit"),
        } if acceptance else None,
    }


# ------------------------------------------------------------------ PDF
def _money(value: Any) -> str:
    return f"${float(value or 0):,.2f}"


# Exterior capstock frame fill and edge, as in frontend/components/WindowUnitDrawing.tsx.
WINDOW_FRAME_COLOURS: dict[str, tuple[str, str]] = {
    "white": ("#f8fafc", "#64748b"),
    "black": ("#1f2328", "#0b0d10"),
    "dark bronze": ("#4a3a2c", "#2a2018"),
    "charcoal": ("#3b4146", "#23272a"),
    "sandstone": ("#d4c5a3", "#8f8161"),
    "sandalwood": ("#c9b48f", "#877454"),
}


def window_frame_colours(name: Any) -> tuple[str, str]:
    """Frame (fill, edge) for an exterior colour name; Cantor names like 'Jet Black' match 'black'."""
    key = str(name or "white").strip().lower()
    if key not in WINDOW_FRAME_COLOURS:
        key = next((known for known in sorted(WINDOW_FRAME_COLOURS, key=len, reverse=True) if known in key), "white")
    return WINDOW_FRAME_COLOURS[key]


def window_drawing_flowable(geometry: dict[str, Any] | None, max_width: float, max_height: float):
    """A small elevation of a window line, viewed from outside (reportlab points).

    Matches frontend/components/WindowUnitDrawing.tsx: the frame is drawn in the
    exterior colour, swing lines meet at the hinge side, sliders and hung sashes
    get an arrow on the moving sash.
    """
    if not geometry or not geometry.get("sections"):
        return None
    from reportlab.graphics.shapes import Drawing, Line, PolyLine, Rect
    from reportlab.lib import colors

    W, H = float(geometry["width"]), float(geometry["height"])
    if W <= 0 or H <= 0:
        return None
    scale = min(max_width / W, max_height / H)
    fill, edge = window_frame_colours(geometry.get("exterior_colour"))
    frame = colors.HexColor(edge)
    glass = colors.HexColor("#e0f2fe")
    mark = colors.HexColor("#64748b")
    d = Drawing(W * scale, H * scale)
    d.add(Rect(0, 0, W * scale, H * scale, fillColor=colors.HexColor(fill), strokeColor=frame, strokeWidth=0.5))
    inset = max(min(W, H) * scale * 0.035, 1.2)

    def pt(x: float, y: float) -> tuple[float, float]:
        return x * scale, (H - y) * scale  # drawings are top-down, reportlab bottom-up

    for sec in geometry["sections"]:
        x0, y0 = pt(sec["x"], sec["y"] + sec["height"])
        w, h = sec["width"] * scale, sec["height"] * scale
        x, y, iw, ih = x0 + inset, y0 + inset, max(w - 2 * inset, 0), max(h - 2 * inset, 0)
        d.add(Rect(x, y, iw, ih, fillColor=glass, strokeColor=colors.HexColor("#94a3b8"), strokeWidth=0.3))
        op, hinge = sec.get("op"), sec.get("hinge")
        dash = dict(strokeColor=mark, strokeWidth=0.5, strokeDashArray=[2, 1.5])
        if op == "casement":
            pts = ([x, y + ih, x + iw, y + ih / 2, x, y] if hinge == "right"
                   else [x + iw, y + ih, x, y + ih / 2, x + iw, y])
            d.add(PolyLine(pts, **dash))
        elif op == "awning":
            d.add(PolyLine([x, y, x + iw / 2, y + ih, x + iw, y], **dash))
        elif op in ("single_slider", "double_slider"):
            d.add(Line(x + iw / 2, y, x + iw / 2, y + ih, strokeColor=frame, strokeWidth=0.8))
            cy = y + ih / 2
            if op == "double_slider" or hinge != "right":
                d.add(Line(x + iw * 0.1, cy, x + iw * 0.4, cy, strokeColor=mark, strokeWidth=0.6))
            if op == "double_slider" or hinge == "right":
                d.add(Line(x + iw * 0.6, cy, x + iw * 0.9, cy, strokeColor=mark, strokeWidth=0.6))
        elif op in ("single_hung", "double_hung"):
            d.add(Line(x, y + ih / 2, x + iw, y + ih / 2, strokeColor=frame, strokeWidth=0.8))
            d.add(Line(x + iw / 2, y + ih * 0.1, x + iw / 2, y + ih * 0.4, strokeColor=mark, strokeWidth=0.6))
    return d


def door_drawing_flowable(geometry: dict[str, Any] | None, max_width: float, max_height: float):
    """A small elevation of a door opening, viewed from outside (reportlab points).

    Matches frontend/components/DoorDrawing.tsx: frame and brickmould, transom,
    sidelites, slab colour, glass lites, handle and sill.
    """
    if not geometry or not geometry.get("doors"):
        return None
    from reportlab.graphics.shapes import Circle, Drawing, Ellipse, Rect, Wedge
    from reportlab.lib import colors

    doors = int(geometry["doors"])
    sidelites = int(geometry.get("sidelites") or 0)
    # Snapshots priced before the CRM sections were added kept the slab in width/height.
    slab_w = float(geometry.get("slab_width") or geometry.get("width") or 36)
    slab_h = float(geometry.get("slab_height") or geometry.get("height") or 80)
    frame, mull, side_w = 2.0, 1.5, 14.0
    transom_h = 14.0 if geometry.get("transom") else 0.0
    inner_w = doors * slab_w + sidelites * (side_w + mull)
    total_w = inner_w + frame * 2
    total_h = slab_h + transom_h + (mull if transom_h else 0) + frame + 1.5
    scale = min(max_width / total_w, max_height / total_h)
    ink = colors.HexColor("#334155")
    glass_fill = colors.HexColor("#bae6fd")
    frosted = colors.HexColor("#e2e8f0")
    slab_colour = colors.HexColor(geometry.get("slab_colour") or "#f8fafc")
    frame_colour = colors.HexColor(geometry.get("frame_colour") or "#f8fafc")
    d = Drawing(total_w * scale, total_h * scale)

    def rect(x: float, y: float, w: float, h: float, fill, stroke=ink, width=0.4) -> None:
        d.add(Rect(x * scale, (total_h - y - h) * scale, w * scale, h * scale, fillColor=fill, strokeColor=stroke, strokeWidth=width))

    def lites(ox: float, oy: float, w: float, h: float, glass: dict[str, Any] | None) -> None:
        if not glass:
            return
        fill = frosted if glass.get("family") in ("sandblast", "obscure") else glass_fill
        for lx, ly, lw, lh, shape in door_lites(glass.get("size"), w, h):
            x, y = (ox + lx) * scale, (total_h - oy - ly - lh) * scale
            if shape == "oval":
                d.add(Ellipse(x + lw * scale / 2, y + lh * scale / 2, lw * scale / 2, lh * scale / 2, fillColor=fill, strokeColor=ink, strokeWidth=0.3))
            elif shape == "half":
                d.add(Wedge(x + lw * scale / 2, y, lw * scale / 2, 0, 180, fillColor=fill, strokeColor=ink, strokeWidth=0.3))
            else:
                d.add(Rect(x, y, lw * scale, lh * scale, fillColor=fill, strokeColor=ink, strokeWidth=0.3))

    rect(0, 0, total_w, total_h, frame_colour)
    door_top = frame + transom_h + (mull if transom_h else 0)
    if transom_h:
        rect(frame + 2, frame + 2, inner_w - 4, transom_h - 4, glass_fill if geometry.get("transom_glass") else frosted, width=0.3)
    sidelite_glass = list(geometry.get("sidelite_glass") or [])
    parts: list[tuple[str, int]] = []
    if sidelites:
        parts.append(("sidelite", 0))
    parts += [("door", index) for index in range(doors)]
    if sidelites == 2:
        parts.append(("sidelite", 1))
    cursor = frame
    for kind, index in parts:
        if kind == "sidelite":
            rect(cursor, door_top, side_w, slab_h, slab_colour)
            lites(cursor, door_top, side_w, slab_h, sidelite_glass[index] if index < len(sidelite_glass) else None)
            cursor += side_w + mull
            continue
        rect(cursor, door_top, slab_w, slab_h, slab_colour, width=0.5)
        lites(cursor, door_top, slab_w, slab_h, geometry.get("door_glass"))
        handle_x = cursor + slab_w - 3.2 if index == 0 else cursor + 3.2
        pull_bar = float(geometry.get("pull_bar_in") or 0) if geometry.get("lock") == "pull_bar" else 0.0
        if pull_bar:
            # To scale, as in DoorDrawing.tsx pullBarTop(): centred ~42" off the floor, 4" inside the slab.
            bar = min(pull_bar, slab_h - 8)
            centre = max(42.0, bar / 2 + 6)
            if centre + bar / 2 > slab_h - 4:
                centre = slab_h - 4 - bar / 2
            top = door_top + slab_h - (centre + bar / 2)
            d.add(Rect((handle_x - 0.7) * scale, (total_h - top - bar) * scale, 1.4 * scale, bar * scale, fillColor=colors.HexColor("#111827"), strokeColor=colors.HexColor("#cbd5e1"), strokeWidth=0.3))
        elif not (doors == 2 and index == 1):
            d.add(Circle(handle_x * scale, (total_h - door_top - slab_h * 0.48) * scale, max(1.2 * scale, 0.8), fillColor=colors.HexColor("#111827"), strokeColor=None))
        cursor += slab_w
    d.add(Rect(0, 0, total_w * scale, max(1.5 * scale, 0.8), fillColor=colors.HexColor("#111827"), strokeColor=None))
    return d


# Brand palette of the on-screen estimate (frontend/components/EstimateDocument.tsx
# and the .estimate-* rules in frontend/app/globals.css); the PDF mirrors it.
PDF_BRAND = {
    "blue": "#248fd0",
    "navy": "#08243a",
    "muted": "#5f7384",
    "line": "#d8e7f2",
    "soft": "#f2f9fe",
    "text": "#315269",
    "row": "#edf3f6",
}


def _document_title(view: dict[str, Any]) -> str:
    """Same title as the site preview: draft until finalized, accepted once signed."""
    status = view.get("status")
    if status == "accepted":
        return "Accepted Estimate"
    if view.get("preliminary"):
        return "Preliminary Estimate"
    if status in ("draft", "priced"):
        return "Draft Estimate"
    return "Estimate"


def _website(company: dict[str, Any]) -> str:
    """The company website, else the domain of its email (info@betterview.ca -> betterview.ca)."""
    website = str(company.get("website") or "").strip()
    if website:
        return re.sub(r"^https?://", "", website).rstrip("/")
    email = str(company.get("email") or "")
    return email.split("@", 1)[1] if "@" in email else ""


def render_pdf(view: dict[str, Any], *, signature_data_url: str | None = None) -> bytes:
    """The customer estimate as a PDF, laid out like the site preview (EstimateDocument.tsx)."""
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import CondPageBreak, Image, Indenter, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    blue, navy, muted = (colors.HexColor(PDF_BRAND[key]) for key in ("blue", "navy", "muted"))
    line_colour, soft, text_colour, row_rule = (colors.HexColor(PDF_BRAND[key]) for key in ("line", "soft", "text", "row"))

    body = ParagraphStyle("body", fontName="Helvetica", fontSize=8.5, leading=12, textColor=text_colour)
    small = ParagraphStyle("small", parent=body, fontSize=7.5, leading=10, textColor=muted)
    cell = ParagraphStyle("cell", parent=body, fontSize=8, leading=10.5)
    cell_right = ParagraphStyle("cell_right", parent=cell, alignment=TA_RIGHT)
    cell_strong = ParagraphStyle("cell_strong", parent=cell, fontName="Helvetica-Bold", textColor=navy)
    cell_strong_right = ParagraphStyle("cell_strong_right", parent=cell_strong, alignment=TA_RIGHT)
    head = ParagraphStyle("head", parent=small, fontName="Helvetica-Bold", fontSize=6.5, leading=8)
    head_right = ParagraphStyle("head_right", parent=head, alignment=TA_RIGHT)
    kicker = ParagraphStyle("kicker", parent=body, fontName="Helvetica-Bold", fontSize=6.5, leading=9, textColor=blue)
    kicker_right = ParagraphStyle("kicker_right", parent=kicker, alignment=TA_RIGHT)
    title_style = ParagraphStyle("title", parent=body, fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=navy, alignment=TA_RIGHT)
    number_style = ParagraphStyle("number", parent=small, fontSize=8, alignment=TA_RIGHT)
    company_style = ParagraphStyle("company", parent=small, fontName="Helvetica-Bold", fontSize=7)
    customer_style = ParagraphStyle("customer", parent=body, fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=navy)
    h2 = ParagraphStyle("h2", parent=body, fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=navy)
    h2_right = ParagraphStyle("h2_right", parent=h2, fontSize=10.5, alignment=TA_RIGHT)
    h3 = ParagraphStyle("h3", parent=body, fontName="Helvetica-Bold", fontSize=9.5, leading=12, textColor=navy)
    h3_right = ParagraphStyle("h3_right", parent=h3, alignment=TA_RIGHT)

    def p(text: Any, style=body) -> Paragraph:
        escaped = str(text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
        return Paragraph(escaped, style)

    def label(text: str, style=kicker) -> Paragraph:
        # Small bold capitals, as .estimate-section-label.
        return Paragraph(text.upper(), style)

    company = view.get("company") or {}
    buffer = io.BytesIO()
    margin = 0.5 * inch
    footer_height = 0.34 * inch
    doc = SimpleDocTemplate(
        buffer, pagesize=LETTER, leftMargin=margin, rightMargin=margin,
        topMargin=0.4 * inch, bottomMargin=margin + footer_height + 4,
        title=f"Estimate {view.get('estimate_number') or ''}".strip(), author=company.get("name", ""),
    )
    width = doc.width - 12  # the frame keeps 6pt of padding on each side
    pad = 16  # inner padding, like the preview's 2rem gutters inside the card
    story: list[Any] = []

    def padded(content: Any, top: float = 0, bottom: float = 0) -> list[Any]:
        """Content inset by the gutter (bands like the header run the full width); tables still split across pages."""
        items = content if isinstance(content, list) else [content]
        return [Spacer(1, top), Indenter(pad, pad), *items, Indenter(-pad, -pad), *([Spacer(1, bottom)] if bottom else [])]

    # Header: logo and company name | "Customer document" title block with a rule on its left.
    logo: Any = (Image(str(LOGO_PATH), width=2.2 * inch, height=0.62 * inch, kind="proportional")
                 if LOGO_PATH.exists() else p(company.get("name"), h2))
    if isinstance(logo, Image):
        logo.hAlign = "LEFT"
    number = view.get("estimate_number") or "Draft estimate"
    if (view.get("revision_number") or 1) > 1:
        number += f" · Rev {view['revision_number']}"
    brand_block = [logo, Spacer(1, 4), p(company.get("name"), company_style)]
    title_block = [label("Customer document", kicker_right), Spacer(1, 2), p(_document_title(view), title_style), p(number, number_style)]
    title_width = 2.35 * inch
    header = Table([[brand_block, title_block]], colWidths=[width - title_width, title_width])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (0, 0), pad), ("RIGHTPADDING", (-1, 0), (-1, 0), pad),
        ("LEFTPADDING", (1, 0), (1, 0), 14), ("LINEBEFORE", (1, 0), (1, 0), 0.75, line_colour),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(header)

    # Contact bar: blue top rule over a pale band.
    contact = [company.get("phone"), company.get("email"), company.get("address")]
    contact_text = " &nbsp; &nbsp; &nbsp; ".join(
        str(item).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;") for item in contact if item)
    bar = Table([[Paragraph(contact_text, small)]], colWidths=[width])
    bar.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), soft), ("LINEABOVE", (0, 0), (-1, -1), 2.25, blue),
        ("LINEBELOW", (0, 0), (-1, -1), 0.75, line_colour),
        ("LEFTPADDING", (0, 0), (-1, -1), pad), ("RIGHTPADDING", (0, 0), (-1, -1), pad),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(bar)

    if view.get("preliminary"):
        notice = [p("PRELIMINARY — SUBJECT TO SITE MEASURE", cell_strong), p(
            "Window and door sizes are based on the builder's plans for this home model. "
            "Final sizes and pricing will be confirmed after we measure your home.", body)]
        box = Table([[notice]], colWidths=[width - 2 * pad])
        box.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), soft), ("BOX", (0, 0), (-1, -1), 0.75, line_colour),
            ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.extend(padded(box, top=12))

    # Prepared for | project details (label column + value, a light rule under each row).
    customer = [label("Prepared for"), Spacer(1, 4), p(view.get("customer_name") or "—", customer_style)]
    for value in (view.get("company_name"), view.get("email"), view.get("phone"), view.get("project_address")):
        if value:
            customer += [Spacer(1, 2), p(value)]
    detail_rows = [[p(key, small), p(value or "—")] for key, value in (
        ("Project", view.get("project_name")), ("Estimate date", view.get("estimate_date")),
        ("Valid until", view.get("valid_until")), ("Salesperson", view.get("salesperson")))]
    right_width = (width - 2 * pad) * 0.4
    details = Table(detail_rows, colWidths=[0.95 * inch, right_width - 0.95 * inch])
    details.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, -1), 0.5, row_rule),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    meta = Table([[customer, details]], colWidths=[width - 2 * pad - right_width, right_width])
    meta.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (-1, 0), (-1, 0), 0),
    ]))
    story.extend(padded(meta, top=14))

    if view.get("description"):
        story.extend(padded([label("Project description"), Spacer(1, 4), p(view["description"])], top=14))

    def section_heading(eyebrow: str, title: str, amount: Any = None) -> list[Any]:
        """Eyebrow, title and amount over a blue rule; starts a new page rather than sit alone at the bottom."""
        left = [label(eyebrow), Spacer(1, 2), p(title, h2)]
        t = Table([[left, p(_money(amount), h2_right) if amount is not None else ""]],
                  colWidths=[width - 2 * pad - 1.6 * inch, 1.6 * inch])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LINEBELOW", (0, 0), (-1, -1), 1.5, blue),
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        return [CondPageBreak(1.6 * inch), t]

    def product_table(rows: list[list[Any]], widths: list[float], header: bool = True) -> Table:
        t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
        style = [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 1 if header else 0), (-1, -1), 0.5, row_rule),
            ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
        if header:
            style += [("LINEBELOW", (0, 0), (-1, 0), 0.75, line_colour),
                      ("TOPPADDING", (0, 0), (-1, 0), 7), ("BOTTOMPADDING", (0, 0), (-1, 0), 5)]
        t.setStyle(TableStyle(style))
        return t

    def heads(*names: str) -> list[Paragraph]:
        numeric = {"Qty", "Unit", "Amount", "Total"}
        return [label(name, head_right if name in numeric else head) for name in names]

    inner = width - 2 * pad
    sections = view.get("sections") or {}
    windows = (sections.get("windows") or {}).get("lines") or []
    if windows:
        rows: list[list[Any]] = [heads("#", "Description", "Location", "Qty", "Unit", "Amount")]
        for index, line in enumerate(windows, start=1):
            description: list[Any] = []
            # 84px in the preview's 850px-wide document
            sketch = window_drawing_flowable(line.get("drawing"), 0.8 * inch, 0.75 * inch)
            if sketch is not None:
                sketch.hAlign = "LEFT"
                description += [sketch, Spacer(1, 4)]
            description.append(p(line.get("description"), cell))
            if line.get("energy"):
                description.append(p(line["energy"], small))
            rows.append([p(index, cell_strong), description, p(line.get("location") or "—", cell),
                         p(line.get("qty"), cell_right), p(_money(line.get("unit_price")), cell_right),
                         p(_money(line.get("line_total")), cell_strong_right)])
        widths = [0.3 * inch, inner - 3.4 * inch, 1.0 * inch, 0.4 * inch, 0.85 * inch, 0.85 * inch]
        story.extend(padded([*section_heading("Scope of work", "Windows", sections["windows"].get("subtotal")),
                             product_table(rows, widths)], top=14))

    openings = (sections.get("doors") or {}).get("openings") or []
    if openings:
        story.extend(padded(section_heading("Scope of work", "Doors", sections["doors"].get("subtotal")), top=14))
        for index, opening in enumerate(openings, start=1):
            detail = " · ".join(filter(None, [opening.get("location"), opening.get("material"), opening.get("finish_label")]))
            title_cell = [p(f"Item {index} · {opening.get('label')}", h3), Spacer(1, 2), p(detail, small)]
            sketch = door_drawing_flowable(opening.get("drawing"), 1.3 * inch, 1.1 * inch)
            cells = ([sketch] if sketch is not None else []) + [title_cell, p(_money(opening.get("subtotal")), h3_right)]
            widths = ([1.45 * inch] if sketch is not None else []) + [0, 1.2 * inch]
            widths[-2] = inner - sum(widths)
            heading = Table([cells], colWidths=widths)
            heading.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]))
            items = [[p(item.get("description"), cell), p(item.get("qty"), cell_right),
                      p(_money(item.get("unit_price")), cell_right), p(_money(item.get("line_total")), cell_strong_right)]
                     for item in opening.get("items") or []]
            block: list[Any] = [heading]
            if items:
                block.append(product_table(items, [inner - 2.85 * inch, 0.45 * inch, 1.2 * inch, 1.2 * inch], header=False))
            story.extend(padded(KeepTogether(block), top=12))

    adders = (sections.get("adders") or {}).get("lines") or []
    if adders:
        rows = [heads("Description", "Qty", "Unit", "Amount")]
        for line in adders:
            description = [p(line.get("name"), cell)] + ([p(line["note"], small)] if line.get("note") else [])
            rows.append([description, p(f"{float(line.get('qty') or 0):g}", cell_right),
                         p(_money(line.get("unit_price")), cell_right), p(_money(line.get("line_total")), cell_strong_right)])
        story.extend(padded([*section_heading("Scope of work", "Additional work", sections["adders"].get("subtotal")),
                             product_table(rows, [inner - 2.85 * inch, 0.45 * inch, 1.2 * inch, 1.2 * inch])], top=18))

    # Totals: right-aligned block, a blue rule over the grand total.
    totals = view.get("totals") or {}
    total_style = ParagraphStyle("total", parent=body, fontSize=8.5)
    total_value = ParagraphStyle("total_value", parent=total_style, fontName="Helvetica-Bold", textColor=navy, alignment=TA_RIGHT)
    grand = ParagraphStyle("grand", parent=body, fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=navy)
    grand_value = ParagraphStyle("grand_value", parent=grand, alignment=TA_RIGHT)
    total_rows: list[list[Any]] = []
    if float(totals.get("base_subtotal") or 0) > float(totals.get("subtotal") or 0) + 0.01:
        total_rows.append([p("Original subtotal", total_style), p(_money(totals.get("base_subtotal")), total_value)])
    if float(totals.get("discount") or 0) > 0:
        total_rows.append([p("Offer discount", total_style), p(f"−{_money(totals.get('discount'))}", total_value)])
    total_rows.append([p("Subtotal", total_style), p(_money(totals.get("subtotal")), total_value)])
    for tax in totals.get("tax_lines") or [{"label": "HST", "amount": totals.get("hst")}]:
        total_rows.append([p(tax.get("label"), total_style), p(_money(tax.get("amount")), total_value)])
    grand_row = len(total_rows)
    total_rows.append([p("Total", grand), p(_money(totals.get("total")), grand_value)])
    deposit = float(view.get("deposit") or 0)
    if deposit > 0:
        total_rows.append([p("Deposit due on acceptance", total_style), p(_money(deposit), total_value)])
    totals_table = Table(total_rows, colWidths=[2.15 * inch, 1.35 * inch], hAlign="RIGHT")
    totals_table.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.75, line_colour),
        ("LINEABOVE", (0, grand_row), (-1, grand_row), 1.5, blue),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, 0), 8), ("TOPPADDING", (0, grand_row), (-1, grand_row), 8),
    ]))
    story.extend(padded(KeepTogether(totals_table), top=12))

    tiers = view.get("tiers") or []
    if tiers:
        rows = [heads("Option", "What changes", "Total")]
        for tier in tiers:
            name = tier.get("name") + (" (quoted above)" if tier.get("selected") else "")
            rows.append([p(name, cell_strong), p(tier.get("description") or "—", cell), p(_money(tier.get("total")), cell_strong_right)])
        story.extend(padded(KeepTogether([*section_heading("Choose your package", "Options"),
                                          product_table(rows, [1.6 * inch, inner - 2.8 * inch, 1.2 * inch])]), top=18))

    financing = view.get("financing")
    if financing and financing.get("options"):
        payments = " · ".join(f"{option['months']} months: {_money(option['monthly_payment'])}/mo" for option in financing["options"])
        story.extend(padded([label("Financing available"), Spacer(1, 4),
                             p(f"{payments} at {financing.get('apr_percent', 0):g}% APR."), p(financing.get("disclaimer"), small)], top=14))

    accepted = view.get("accepted")
    if accepted:
        summary = f"Accepted by {accepted.get('name')} on {str(accepted.get('accepted_at') or '')[:10]}"
        if accepted.get("tier_name"):
            summary += f" — option {accepted['tier_name']}"
        if accepted.get("total") is not None:
            summary += f" — {_money(accepted.get('total'))}"
        block = [label("Acceptance"), Spacer(1, 4), p(summary + ".")]
        if signature_data_url and "," in signature_data_url:
            try:
                raw = base64.b64decode(signature_data_url.split(",", 1)[1])
                signature = Image(io.BytesIO(raw), width=2.4 * inch, height=0.8 * inch, kind="proportional")
                signature.hAlign = "LEFT"
                block.append(signature)
            except Exception:  # an unreadable signature image never blocks the document
                pass
        story.extend(padded(KeepTogether(block), top=14))

    # Notes | Terms side by side, as .estimate-copy-grid.
    notes = [label("Notes"), Spacer(1, 4), p(view.get("notes") or "—", small)]
    terms = [label("Terms"), Spacer(1, 4), p(view.get("terms") or "—", small)]
    copy_grid = Table([[notes, terms]], colWidths=[inner * 0.5, inner * 0.5])
    copy_grid.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 14), ("RIGHTPADDING", (1, 0), (1, 0), 0),
    ]))
    story.extend(padded(copy_grid, top=14))

    footer_items = [company.get("name"), " · ".join(filter(None, [company.get("phone"), company.get("email")])), _website(company)]

    def footer(canvas, document) -> None:
        canvas.saveState()
        x, y = document.leftMargin + 6, margin
        canvas.setFillColor(soft)
        canvas.setStrokeColor(line_colour)
        canvas.setLineWidth(0.75)
        canvas.rect(x, y, width, footer_height, stroke=0, fill=1)
        canvas.line(x, y + footer_height, x + width, y + footer_height)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(muted)
        baseline = y + footer_height / 2 - 2.5
        canvas.drawString(x + pad, baseline, footer_items[0] or "")
        canvas.drawCentredString(x + width / 2, baseline, footer_items[1] or "")
        right_text = " · ".join(filter(None, [footer_items[2], f"Page {document.page}"]))
        canvas.drawRightString(x + width - pad, baseline, right_text)
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()
