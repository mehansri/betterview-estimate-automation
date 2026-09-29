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

LOGO_PATH = Path(__file__).resolve().parents[1] / "frontend" / "public" / "branding" / "better-view-solutions.png"


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


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
            "windows": sections.get("windows") or {"lines": [], "subtotal": 0},
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


def window_drawing_flowable(geometry: dict[str, Any] | None, max_width: float, max_height: float):
    """A small elevation of a window line, viewed from outside (reportlab points).

    Matches frontend/components/WindowUnitDrawing.tsx: swing lines meet at the
    hinge side, sliders and hung sashes get an arrow on the moving sash.
    """
    if not geometry or not geometry.get("sections"):
        return None
    from reportlab.graphics.shapes import Drawing, Line, PolyLine, Rect
    from reportlab.lib import colors

    W, H = float(geometry["width"]), float(geometry["height"])
    if W <= 0 or H <= 0:
        return None
    scale = min(max_width / W, max_height / H)
    frame = colors.HexColor("#334155")
    glass = colors.HexColor("#e0f2fe")
    mark = colors.HexColor("#64748b")
    d = Drawing(W * scale, H * scale)
    d.add(Rect(0, 0, W * scale, H * scale, fillColor=frame, strokeColor=None))
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
        if not (doors == 2 and index == 1):
            handle_x = cursor + slab_w - 3.2 if index == 0 else cursor + 3.2
            d.add(Circle(handle_x * scale, (total_h - door_top - slab_h * 0.48) * scale, max(1.2 * scale, 0.8), fillColor=colors.HexColor("#111827"), strokeColor=None))
        cursor += slab_w
    d.add(Rect(0, 0, total_w * scale, max(1.5 * scale, 0.8), fillColor=colors.HexColor("#111827"), strokeColor=None))
    return d


def render_pdf(view: dict[str, Any], *, signature_data_url: str | None = None) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    brand = colors.HexColor("#1d4ed8")
    ink = colors.HexColor("#0f172a")
    muted = colors.HexColor("#64748b")
    rule = colors.HexColor("#e2e8f0")
    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9, leading=12, textColor=ink)
    small = ParagraphStyle("small", parent=body, fontSize=8, leading=10, textColor=muted)
    label = ParagraphStyle("label", parent=small, fontName="Helvetica-Bold", textColor=brand, spaceAfter=2)
    h1 = ParagraphStyle("h1", parent=body, fontName="Helvetica-Bold", fontSize=18, leading=22, alignment=TA_RIGHT)
    h2 = ParagraphStyle("h2", parent=body, fontName="Helvetica-Bold", fontSize=12, leading=15, spaceBefore=10, spaceAfter=4)
    right = ParagraphStyle("right", parent=body, alignment=TA_RIGHT)

    def p(text: Any, style=body) -> Paragraph:
        escaped = str(text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
        return Paragraph(escaped, style)

    company = view.get("company") or {}
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=LETTER, leftMargin=0.6 * inch, rightMargin=0.6 * inch,
        topMargin=0.55 * inch, bottomMargin=0.6 * inch,
        title=f"Estimate {view.get('estimate_number') or ''}".strip(), author=company.get("name", ""),
    )
    width = doc.width
    story: list[Any] = []

    logo = Image(str(LOGO_PATH), width=1.9 * inch, height=0.6 * inch, kind="proportional") if LOGO_PATH.exists() else p(company.get("name"), h2)
    title = "Accepted Estimate" if view.get("status") == "accepted" else "Estimate"
    number = view.get("estimate_number") or "Draft"
    if (view.get("revision_number") or 1) > 1:
        number += f" · Rev {view['revision_number']}"
    header = Table([[logo, [p(title, h1), p(number, right)]]], colWidths=[width * 0.55, width * 0.45])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story += [header, Spacer(1, 4)]
    story.append(p(" · ".join(filter(None, [company.get("name"), company.get("phone"), company.get("email"), company.get("address")])), small))
    story.append(Spacer(1, 10))

    customer = [p("PREPARED FOR", label), p(view.get("customer_name"), ParagraphStyle("c", parent=body, fontName="Helvetica-Bold"))]
    for line in (view.get("company_name"), view.get("email"), view.get("phone"), view.get("project_address")):
        if line:
            customer.append(p(line))
    project = [p("PROJECT", label)]
    for key, text in (("Project", view.get("project_name")), ("Estimate date", view.get("estimate_date")),
                      ("Valid until", view.get("valid_until")), ("Salesperson", view.get("salesperson"))):
        if text:
            project.append(p(f"{key}: {text}"))
    info = Table([[customer, project]], colWidths=[width / 2, width / 2])
    info.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOX", (0, 0), (-1, -1), 0.5, rule),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, rule), ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story += [info, Spacer(1, 8)]
    if view.get("description"):
        story += [p("PROJECT DESCRIPTION", label), p(view["description"]), Spacer(1, 4)]

    def table(rows: list[list[Any]], widths: list[float], numeric_columns: int = 3) -> Table:
        t = Table(rows, colWidths=widths, repeatRows=1)
        t.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8), ("TEXTCOLOR", (0, 0), (-1, 0), muted),
            ("LINEBELOW", (0, 0), (-1, 0), 0.75, brand), ("LINEBELOW", (0, 1), (-1, -1), 0.25, rule),
            ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (-numeric_columns, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        return t

    sections = view.get("sections") or {}
    windows = (sections.get("windows") or {}).get("lines") or []
    if windows:
        story.append(p(f"Windows — {_money(sections['windows'].get('subtotal'))}", h2))
        rows = [["#", "Description", "Location", "Qty", "Unit", "Amount"]]
        for index, line in enumerate(windows, start=1):
            cell: list[Any] = []
            sketch = window_drawing_flowable(line.get("drawing"), 1.1 * inch, 0.9 * inch)
            if sketch is not None:
                sketch.hAlign = "LEFT"
                cell += [sketch, Spacer(1, 3)]
            cell.append(p(line.get("description")))
            if line.get("energy"):
                cell.append(p(line["energy"], small))
            rows.append([str(index), cell, p(line.get("location") or "—", small), str(line.get("qty")),
                         _money(line.get("unit_price")), _money(line.get("line_total"))])
        story.append(table(rows, [0.3 * inch, width - 3.9 * inch, 1.2 * inch, 0.5 * inch, 0.9 * inch, 1.0 * inch]))

    openings = (sections.get("doors") or {}).get("openings") or []
    if openings:
        story.append(p(f"Doors — {_money(sections['doors'].get('subtotal'))}", h2))
        for index, opening in enumerate(openings, start=1):
            heading = f"Item {index} · {opening.get('label')}"
            detail = " · ".join(filter(None, [opening.get("location"), opening.get("material"), opening.get("finish_label")]))
            rows = [["Description", "Qty", "Unit", "Amount"]]
            for item in opening.get("items") or []:
                rows.append([p(item.get("description")), str(item.get("qty")), _money(item.get("unit_price")), _money(item.get("line_total"))])
            head: Any = [p(heading, ParagraphStyle("dh", parent=body, fontName="Helvetica-Bold")), p(detail, small)]
            sketch = door_drawing_flowable(opening.get("drawing"), 1.3 * inch, 1.1 * inch)
            if sketch is not None:
                head = Table([[sketch, head]], colWidths=[1.45 * inch, width - 1.45 * inch])
                head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (0, 0), 0)]))
                head = [head]
            story.append(KeepTogether([
                *head,
                table(rows, [width - 2.9 * inch, 0.5 * inch, 1.2 * inch, 1.2 * inch]), Spacer(1, 6),
            ]))

    adders = (sections.get("adders") or {}).get("lines") or []
    if adders:
        story.append(p(f"Additional work — {_money(sections['adders'].get('subtotal'))}", h2))
        rows = [["Description", "Qty", "Unit", "Amount"]]
        for line in adders:
            text = line.get("name") + (f" — {line['note']}" if line.get("note") else "")
            rows.append([p(text), f"{float(line.get('qty') or 0):g}", _money(line.get("unit_price")), _money(line.get("line_total"))])
        story.append(table(rows, [width - 2.9 * inch, 0.5 * inch, 1.2 * inch, 1.2 * inch]))

    totals = view.get("totals") or {}
    total_rows: list[list[Any]] = []
    if float(totals.get("discount") or 0) > 0:
        total_rows.append(["Original subtotal", _money(totals.get("base_subtotal"))])
        total_rows.append(["Offer discount", f"-{_money(totals.get('discount'))}"])
    total_rows.append(["Subtotal", _money(totals.get("subtotal"))])
    for tax in totals.get("tax_lines") or [{"label": "HST", "amount": totals.get("hst")}]:
        total_rows.append([tax.get("label"), _money(tax.get("amount"))])
    total_rows.append(["Total", _money(totals.get("total"))])
    deposit = float(view.get("deposit") or 0)
    if deposit > 0:
        total_rows.append(["Deposit due on acceptance", _money(deposit)])
    totals_table = Table(total_rows, colWidths=[2.2 * inch, 1.3 * inch], hAlign="RIGHT")
    last = len(total_rows) - (2 if deposit > 0 else 1)
    totals_table.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"), ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
        ("FONT", (0, last), (-1, last), "Helvetica-Bold", 11), ("LINEABOVE", (0, last), (-1, last), 1, brand),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story += [Spacer(1, 10), totals_table]

    tiers = view.get("tiers") or []
    if tiers:
        rows = [["Option", "Description", "Total"]]
        for tier in tiers:
            name = tier.get("name") + (" (selected)" if tier.get("selected") else "")
            rows.append([p(name, ParagraphStyle("tn", parent=body, fontName="Helvetica-Bold")), p(tier.get("description"), small), _money(tier.get("total"))])
        story.append(KeepTogether([p("Your options", h2), table(rows, [1.6 * inch, width - 2.8 * inch, 1.2 * inch], numeric_columns=1)]))

    financing = view.get("financing")
    if financing and financing.get("options"):
        payments = "; ".join(f"{option['months']} months: {_money(option['monthly_payment'])}/mo" for option in financing["options"])
        story += [Spacer(1, 8), p("FINANCING AVAILABLE", label),
                  p(f"{payments} at {financing.get('apr_percent', 0):g}% APR."), p(financing.get("disclaimer"), small)]

    for heading, text in (("NOTES", view.get("notes")), ("TERMS", view.get("terms"))):
        if text:
            story += [Spacer(1, 8), p(heading, label), p(text, small)]

    accepted = view.get("accepted")
    if accepted:
        block: list[Any] = [Spacer(1, 12), p("ACCEPTANCE", label)]
        summary = f"Accepted by {accepted.get('name')} on {str(accepted.get('accepted_at') or '')[:10]}"
        if accepted.get("tier_name"):
            summary += f" — option: {accepted['tier_name']}"
        summary += f" — total {_money(accepted.get('total'))}"
        block.append(p(summary))
        if signature_data_url and "," in signature_data_url:
            try:
                raw = base64.b64decode(signature_data_url.split(",", 1)[1])
                block.append(Image(io.BytesIO(raw), width=2.4 * inch, height=0.8 * inch, kind="proportional"))
            except Exception:  # an unreadable signature image never blocks the document
                pass
        story.append(KeepTogether(block))

    def footer(canvas, document) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(muted)
        canvas.drawString(document.leftMargin, 0.35 * inch, " · ".join(filter(None, [company.get("name"), company.get("phone"), company.get("email")])))
        canvas.drawRightString(document.leftMargin + document.width, 0.35 * inch, f"Page {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()
