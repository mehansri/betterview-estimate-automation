"""End-to-end coverage for tax, job adders, tiers, the customer portal,
revisions, photos, templates, settings, price books, reconciliation, reports."""
from __future__ import annotations

import copy
import json

import pytest
from sqlalchemy import create_engine, inspect, text

from tests.test_customer_estimates import _client, _draft

ADMIN = {"X-Pricing-Admin-Token": "manager-secret"}
PNG_SIGNATURE = "data:image/png;base64," + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PRICING_ADMIN_TOKEN", "manager-secret")
    from services.settings_store import clear_cache

    clear_cache()
    yield _client(tmp_path, monkeypatch)
    clear_cache()


def _create(client, draft: dict) -> dict:
    created = client.post("/api/customer-estimates", json=draft)
    assert created.status_code == 200, created.text
    return created.json()


def _price(client, estimate_id: str) -> dict:
    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200, priced.text
    return priced.json()


def _finalized(client, draft: dict) -> dict:
    estimate = _create(client, draft)
    _price(client, estimate["id"])
    finalized = client.post(f"/api/customer-estimates/{estimate['id']}/finalize")
    assert finalized.status_code == 200, finalized.text
    return finalized.json()


def _activate_adders(client, **prices: tuple[float, float]) -> None:
    adders = client.get("/api/job-adders").json()["adders"]
    for adder in adders:
        if adder["id"] in prices:
            adder["cost"], adder["price"] = prices[adder["id"]]
            adder["active"] = True
    saved = client.put("/api/admin/job-adders", json={"adders": adders}, headers=ADMIN)
    assert saved.status_code == 200, saved.text


def test_province_tax_components(client):
    draft = _draft(mixed=False)
    draft["province"] = "QC"
    pricing = _price(client, _create(client, draft)["id"])["pricing"]
    totals = pricing["totals"]
    assert [line["label"] for line in totals["tax_lines"]] == ["GST (5%)", "QST (9.975%)"]
    assert totals["hst"] == pytest.approx(sum(line["amount"] for line in totals["tax_lines"]))
    assert totals["total"] == round(totals["subtotal"] + totals["hst"], 2)
    assert totals["tax_label"] == "GST + QST"

    draft["province"] = "ZZ"
    bad = client.post(f"/api/customer-estimates/{_create(client, draft)['id']}/price")
    assert bad.status_code == 422


@pytest.mark.usefixtures("no_profit_floor")
def test_job_adders_are_priced_counted_and_protected(client):
    # Seeded catalog items start inactive with no price.
    adders = {item["id"]: item for item in client.get("/api/job-adders").json()["adders"]}
    assert adders["removal_disposal"]["active"] is False
    assert client.put("/api/admin/job-adders", json={"adders": list(adders.values())}).status_code == 403

    draft = _draft()
    draft["windows"][0]["spec"]["qty"] = 4
    draft["adders"] = [{"adder_id": "removal_disposal"}]
    inactive = client.post(f"/api/customer-estimates/{_create(client, draft)['id']}/price")
    assert inactive.status_code == 422

    _activate_adders(client, removal_disposal=(20.0, 45.0), permit=(150.0, 250.0))
    draft["adders"] = [
        {"adder_id": "removal_disposal"},                    # per opening: 4 windows + 1 door
        {"adder_id": "permit"},                              # per job
        {"custom": True, "name": "Remove old awning", "cost": 50, "price": 120, "qty": 1},
    ]
    pricing = _price(client, _create(client, draft)["id"])["pricing"]
    lines = pricing["sections"]["adders"]["lines"]
    assert [line["qty"] for line in lines] == [5, 1, 1]
    assert pricing["sections"]["adders"]["subtotal"] == pytest.approx(5 * 45 + 250 + 120)
    assert "unit_cost" not in lines[0]  # customer section never carries cost
    profitability = pricing["profitability"]
    assert profitability["breakdown"]["adders"] == {"cost": 5 * 20 + 150 + 50, "sell": 5 * 45 + 250 + 120}
    subtotal = sum(pricing["sections"][name]["subtotal"] for name in ("windows", "doors", "adders"))
    assert pricing["totals"]["subtotal"] == pytest.approx(subtotal)

    # Agreed total: adders and doors are fixed; only window merchandise moves.
    agreed = round(pricing["totals"]["total"] - 100, 2)
    draft["commercial"]["agreed_customer_total"] = agreed
    agreed_pricing = _price(client, _create(client, draft)["id"])["pricing"]
    assert agreed_pricing["totals"]["total"] == pytest.approx(agreed, abs=0.05)
    assert agreed_pricing["sections"]["adders"]["subtotal"] == pricing["sections"]["adders"]["subtotal"]


def test_good_better_best_tiers(client):
    draft = _draft()
    draft["tiers"] = [
        {"id": "good", "name": "Good", "window_overrides": {"glazing": {}}},
        {"id": "best", "name": "Best", "description": "Triple pane", "window_overrides": {"glazing": {"triple": True}}},
        {"id": "broken", "name": "Unavailable", "window_overrides": {"colour_ext": "forest green"}},
    ]
    estimate = _create(client, draft)
    pricing = _price(client, estimate["id"])["pricing"]
    tiers = {tier["id"]: tier for tier in pricing["tiers"]}
    assert tiers["good"]["total"] == pricing["totals"]["total"]
    assert tiers["best"]["total"] > tiers["good"]["total"]
    assert "error" in tiers["broken"]

    draft["selected_tier"] = "best"
    selected = _price(client, client.put(f"/api/customer-estimates/{estimate['id']}", json=draft).json()["id"])
    assert selected["pricing"]["totals"]["total"] == tiers["best"]["total"]
    assert selected["pricing"]["selected_tier"] == "best"


def test_customer_portal_send_view_accept(client):
    draft = _draft()
    draft["tiers"] = [
        {"id": "good", "name": "Good"},
        {"id": "best", "name": "Best", "window_overrides": {"glazing": {"triple": True}}},
    ]
    estimate = _finalized(client, draft)
    token = estimate["public_token"]
    assert token and estimate["status"] == "finalized"

    sent = client.post(f"/api/customer-estimates/{estimate['id']}/send",
                       json={"portal_base_url": "https://app.example.com"})
    assert sent.status_code == 200, sent.text
    body = sent.json()
    assert body["delivered"] is False  # SMTP not configured in tests
    assert body["link"] == f"https://app.example.com/estimate/{token}"
    assert body["estimate"]["status"] == "sent"
    assert body["estimate"]["follow_up_on"]

    public = client.get(f"/api/public/estimates/{token}")
    assert public.status_code == 200
    view = public.json()
    raw = json.dumps(view)
    for secret in ("dealer", "profit", "margin", "window_quote", "floor", "cost"):
        assert secret not in raw, secret
    assert view["can_accept"] is True
    assert client.get(f"/api/customer-estimates/{estimate['id']}").json()["status"] == "viewed"

    pdf = client.get(f"/api/public/estimates/{token}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    no_option = client.post(f"/api/public/estimates/{token}/accept",
                            json={"name": "Ada Lovelace", "signature": PNG_SIGNATURE, "accepted_terms": True})
    assert no_option.status_code == 422
    best_total = next(tier["total"] for tier in view["tiers"] if tier["id"] == "best")
    accepted = client.post(f"/api/public/estimates/{token}/accept",
                           json={"name": "Ada Lovelace", "signature": PNG_SIGNATURE, "accepted_terms": True, "tier_id": "best"})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["accepted"]["total"] == best_total
    again = client.post(f"/api/public/estimates/{token}/accept",
                        json={"name": "Ada Lovelace", "signature": PNG_SIGNATURE, "accepted_terms": True, "tier_id": "best"})
    assert again.status_code == 409

    internal = client.get(f"/api/customer-estimates/{estimate['id']}").json()
    assert internal["status"] == "accepted"
    # The signed document now describes the option bought, at the price shown.
    assert internal["pricing"]["totals"]["total"] == best_total
    assert "Triple pane" in internal["pricing"]["sections"]["windows"]["lines"][0]["description"]
    assert internal["pricing"]["selected_tier"] == "best"
    accepted_view = client.get(f"/api/public/estimates/{token}").json()
    assert accepted_view["totals"]["total"] == best_total
    assert "scope" not in json.dumps(accepted_view["tiers"])
    assert "signature" not in internal["acceptance"]
    kinds = [event["kind"] for event in client.get(f"/api/customer-estimates/{estimate['id']}/events").json()]
    for kind in ("accepted", "viewed", "sent", "finalized", "created"):
        assert kind in kinds
    signed_pdf = client.get(f"/api/customer-estimates/{estimate['id']}/pdf")
    assert signed_pdf.content.startswith(b"%PDF")
    assert client.get("/api/public/estimates/not-a-real-token-value").status_code == 404


def test_revision_supersedes_old_link_and_lost_flow(client):
    original = _finalized(client, _draft(mixed=False))
    assert client.put(f"/api/customer-estimates/{original['id']}", json=_draft(mixed=False)).status_code == 409

    revision = client.post(f"/api/customer-estimates/{original['id']}/revise")
    assert revision.status_code == 200, revision.text
    revised = revision.json()
    assert revised["revision_of"] == original["id"] and revised["revision_number"] == 2
    draft = _draft(mixed=False)
    draft["windows"][0]["spec"]["width"] = 36
    client.put(f"/api/customer-estimates/{revised['id']}", json=draft)
    _price(client, revised["id"])
    final_revision = client.post(f"/api/customer-estimates/{revised['id']}/finalize").json()
    assert final_revision["estimate_number"] == f"{original['estimate_number']}-R2"
    revisions = client.get(f"/api/customer-estimates/{original['id']}/revisions").json()
    assert [row["revision_number"] for row in revisions] == [1, 2]

    old_view = client.get(f"/api/public/estimates/{original['public_token']}").json()
    assert old_view["superseded_by"] == final_revision["public_token"]
    assert old_view["can_accept"] is False

    lost = client.post(f"/api/customer-estimates/{final_revision['id']}/lost", json={"reason": "Price"})
    assert lost.json()["status"] == "lost"
    reopened = client.post(f"/api/customer-estimates/{final_revision['id']}/reopen")
    assert reopened.json()["status"] == "finalized"


def test_photos_templates_and_follow_up_queue(client):
    estimate = _create(client, _draft(mixed=False))
    upload = client.post(
        f"/api/customer-estimates/{estimate['id']}/photos",
        files={"file": ("opening.png", b"\x89PNG fake", "image/png")},
        data={"line_id": "w1", "caption": "Living room opening"},
    )
    assert upload.status_code == 200, upload.text
    photos = client.get(f"/api/customer-estimates/{estimate['id']}/photos").json()
    assert photos[0]["line_id"] == "w1"
    assert client.get(photos[0]["url"]).content == b"\x89PNG fake"
    rejected = client.post(f"/api/customer-estimates/{estimate['id']}/photos",
                           files={"file": ("notes.txt", b"hello", "text/plain")})
    assert rejected.status_code == 415
    assert client.delete(photos[0]["url"]).status_code == 204

    template = client.post("/api/templates", json={"name": "Bedroom casement", "kind": "window",
                                                   "payload": _draft()["windows"][0]["spec"]})
    assert template.status_code == 200
    assert [row["name"] for row in client.get("/api/templates?kind=window").json()] == ["Bedroom casement"]
    assert client.delete(f"/api/templates/{template.json()['id']}").status_code == 204

    final = _finalized(client, _draft(mixed=False))
    client.put(f"/api/customer-estimates/{final['id']}/follow-up", json={"follow_up_on": "2000-01-01"})
    queue = client.get("/api/customer-estimates/queues/follow-ups").json()
    assert [row["id"] for row in queue] == [final["id"]]


def test_settings_require_token_and_changes_make_prices_stale(client):
    settings = client.get("/api/settings").json()
    assert settings["tax"]["rates"]["ON"]["components"][0]["rate"] == 13.0
    estimate = _create(client, _draft(mixed=False))
    _price(client, estimate["id"])

    tax = copy.deepcopy(settings["tax"])
    tax["rates"]["ON"]["components"][0]["rate"] = 13.5
    assert client.put("/api/admin/settings/tax", json=tax).status_code == 403
    saved = client.put("/api/admin/settings/tax", json=tax, headers=ADMIN)
    assert saved.status_code == 200, saved.text
    tax["rates"]["ON"]["components"][0]["rate"] = 150
    assert client.put("/api/admin/settings/tax", json=tax, headers=ADMIN).status_code == 422

    from services.settings_store import clear_cache

    clear_cache()
    stale = client.post(f"/api/customer-estimates/{estimate['id']}/finalize")
    assert stale.status_code == 409
    repriced = _price(client, estimate["id"])
    assert repriced["pricing"]["totals"]["tax_lines"][0]["rate"] == 13.5

    financing = settings["financing"] | {"enabled": True, "apr_percent": 9.99, "terms_months": [60]}
    client.put("/api/admin/settings/financing", json=financing, headers=ADMIN)
    clear_cache()
    pricing = _price(client, estimate["id"])["pricing"]
    payment = pricing["financing"]["options"][0]
    assert payment["months"] == 60 and 0 < payment["monthly_payment"] < pricing["totals"]["total"]


def test_price_book_import_publish_and_revert(client):
    from services import price_books

    spec = {"lines": [{"type": "window", "style": "WC-100", "width": 30, "height": 60, "glazing": {"loe180": True}}]}
    before = client.post("/api/quotes/price", json=spec).json()["totals"]["dealer_cost"]

    windows = client.get("/api/admin/price-books/windowcity/windows/current").json()
    raised = copy.deepcopy(windows)
    style = next(row for row in raised["styles"] if row["code"] == "WC-100")
    for tier in style["tiers"]:
        for key, value in list(tier.items()):
            if key == "base_white" and isinstance(value, (int, float)):
                tier[key] = round(value * 1.1, 2)
    upload = client.post(
        "/api/admin/price-books",
        data={"dataset": "windowcity/windows", "label": "2027 update"},
        files={"file": ("windows.json", json.dumps(raised).encode(), "application/json")},
        headers=ADMIN,
    )
    assert upload.status_code == 200, upload.text
    version = upload.json()
    assert version["summary"]["changed"] > 0 and version["active"] is False

    wrong_shape = client.post("/api/admin/price-books", data={"dataset": "windowcity/windows"},
                              files={"file": ("x.json", b"[]", "application/json")}, headers=ADMIN)
    assert wrong_shape.status_code == 422

    client.post(f"/api/admin/price-books/{version['id']}/publish", headers=ADMIN)
    price_books._invalidate()
    after = client.post("/api/quotes/price", json=spec).json()["totals"]["dealer_cost"]
    assert after > before

    client.post("/api/admin/price-books/revert", json={"dataset": "windowcity/windows"}, headers=ADMIN)
    price_books._invalidate()
    assert client.post("/api/quotes/price", json=spec).json()["totals"]["dealer_cost"] == before


def test_supplier_cost_reconciliation(client):
    engine = client.post("/api/quotes/price", json={"lines": [
        {"type": "window", "style": "WC-100", "width": 30, "height": 60, "glazing": {"loe180": True, "gas": "argon"}}
    ]}).json()["lines"][0]["dealer_each"]
    csv_text = (
        "ref,style,width,height,qty,loe180,gas,supplier_unit_cost\n"
        f"A1,WC-100,30,60,2,yes,argon,{engine}\n"
        f"A2,WC-100,30,60,1,yes,argon,{engine * 1.2:.2f}\n"
        "A3,NOPE-1,30,60,1,yes,argon,100\n"
    )
    result = client.post("/api/admin/reconcile", files={"file": ("order.csv", csv_text.encode(), "text/csv")})
    assert result.status_code == 200, result.text
    statuses = [line["status"] for line in result.json()["lines"]]
    assert statuses == ["ok", "drift", "error"]
    assert result.json()["summary"]["matched"] == 1


def test_reports_summary(client):
    won = _finalized(client, _draft(mixed=False))
    client.post(f"/api/customer-estimates/{won['id']}/send", json={})
    client.post(f"/api/public/estimates/{won['public_token']}/accept",
                json={"name": "Ada Lovelace", "signature": PNG_SIGNATURE, "accepted_terms": True})
    lost = _finalized(client, _draft(mixed=False))
    client.post(f"/api/customer-estimates/{lost['id']}/lost", json={"reason": "Went with competitor"})
    _create(client, _draft(mixed=False))

    report = client.get("/api/reports/summary?days=30").json()
    assert report["won"]["count"] == 1 and report["lost"]["count"] == 1
    assert report["close_rate"] == 50.0
    assert report["pipeline"]["draft"]["count"] == 1
    assert report["lost"]["reasons"][0][0] == "Went with competitor"
    rep = report["by_salesperson"][0]
    assert rep["won"] == 1 and rep["average_margin_percent"] is not None


def test_preview_pricing_does_not_write_audit_records(client):
    spec = {"lines": [{"type": "window", "style": "WC-100", "width": 30, "height": 60}]}
    preview = client.post("/api/quotes/price?record=false", json=spec)
    assert preview.status_code == 200 and preview.json()["quote_id"] is None
    assert client.get("/api/quotes").json() == []
    assert client.post("/api/quotes/price", json=spec).json()["quote_id"]
    assert len(client.get("/api/quotes").json()) == 1


def test_init_db_adds_new_columns_to_an_existing_database(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'old.db'}"
    legacy = create_engine(url)
    with legacy.begin() as connection:
        connection.execute(text(
            "CREATE TABLE customer_estimates (id CHAR(32) PRIMARY KEY, status VARCHAR(32) NOT NULL, "
            "windows JSON NOT NULL, doors JSON NOT NULL, commercial JSON NOT NULL, "
            "created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)"
        ))
        connection.execute(text(
            "INSERT INTO customer_estimates VALUES ('abc', 'draft', '[]', '[]', '{}', '2025-01-01', '2025-01-01')"
        ))
    legacy.dispose()

    monkeypatch.setenv("DATABASE_URL", url)
    from db.init_db import init_db
    from db.session import reset_engine

    reset_engine()
    init_db()
    engine = create_engine(url)
    columns = {column["name"] for column in inspect(engine).get_columns("customer_estimates")}
    assert {"province", "adders", "tiers", "public_token", "deleted_at", "revision_number"} <= columns
    with engine.connect() as connection:
        province, adders = connection.execute(text("SELECT province, adders FROM customer_estimates")).one()
    assert province == "ON" and json.loads(adders) == []
    engine.dispose()
    reset_engine()


def test_follow_up_draft_uses_template_without_ai(client, monkeypatch):
    monkeypatch.setenv("FOLLOW_UP_AI", "off")
    estimate = _finalized(client, _draft(mixed=False))
    client.post(f"/api/customer-estimates/{estimate['id']}/send", json={})
    draft = client.post(f"/api/customer-estimates/{estimate['id']}/follow-up-draft")
    assert draft.status_code == 200, draft.text
    body = draft.json()
    assert body["source"] == "template"
    assert body["subject"].endswith(estimate["estimate_number"])
    assert body["body"].startswith("Hi Ada,")
    assert body["to"] == "ada@example.com"
    for secret in ("dealer", "margin", "profit"):
        assert secret not in body["body"].lower()
    draft_only = _create(client, _draft(mixed=False))
    assert client.post(f"/api/customer-estimates/{draft_only['id']}/follow-up-draft").status_code == 409
