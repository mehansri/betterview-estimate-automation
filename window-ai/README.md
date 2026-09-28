# Window City deterministic quoting

This application prices supported Window City products from the v18 (2023)
price book. Historical PDFs remain available for parsing, audit, similarity,
and future calibration; the legacy ML predictor is not the source of customer
quote totals.

```
structured quote → catalog engine → component breakdown → install/markup/HST → customer total
historical PDFs → parser/database → audit and calibration data
```

## Quick start

```bash
cd window-ai
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

DATABASE_URL=sqlite:///data/local.db python -m db.init_db
DATABASE_URL=sqlite:///data/local.db uvicorn api.main:app --reload --port 8000
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 for the guided quote builder and
http://localhost:8000/docs for the API.

## Deterministic quote API

`GET /api/quotes/catalog` returns the supported styles, accessories, shapes,
patio-door sizes, and bay/bow choices used by the UI.

`POST /api/quotes/price` accepts canonical Window City lines:

```json
{
  "lines": [
    {
      "type": "window",
      "style": "WC-100",
      "width": 30,
      "height": 60,
      "qty": 1,
      "colour_ext": "white",
      "glazing": {"loe180": true, "gas": "argon"}
    }
  ]
}
```

Supported line types are `unit`, `window`, `combination`, `patio_sliding`,
`patio_swing`, and `bay_bow`. Responses include component list/dealer values,
installation, markup, HST, customer total, catalog source pages, configuration
version, and review warnings.

### Layout-first window units

A `unit` line describes a window the way Window City's order system does. It
has an overall frame size, divisions, and a type for each section:

```json
{
  "type": "unit", "series": "classic", "width": 72, "height": 72,
  "glazing": {"loe180": true, "gas": "argon"},
  "accessories": [{"kind": "brickmould", "name": "(classic)"}],
  "layout": {"split": "rows", "sizes": ["2/3", "*"], "children": [
    {"op": "fixed"},
    {"split": "cols", "children": [{"op": "awning"}, {"op": "awning"}]}
  ]}
}
```

- **Splits:** `cols` places sections side by side and `rows` stacks them.
- **Sizes:** each entry is inches (`24`, `"23 1/2"`), a share (`"1/3"`, `"25%"`), or `"*"` for an equal share of the rest.
- **Sections:** a leaf is `{"op", "hinge"}`. Hinge is as viewed from outside. `style` and `glazing` can be overridden per section.
- **Series:** the series maps each operation to a catalog style (`services/windowcity/layout.py`).
- **Presets:** common configurations are in `GET /api/quotes/catalog` under `layout.presets`.
- **Pricing:** each section is priced as a single-frame window, billed at its division size plus 2x the assembly brickmould. Brickmould and jambs wrap the assembly once. Joints that span the whole unit get steel mullions per the book 64-65 chart.
- **Calibration:** `tests/test_window_units.py` reproduces Window City order 125401186 to the cent.
- **Response:** priced unit lines return `unit.sections` with each section's product, size, and certified energy rating (`data/energy.json`).

### Protected sales pricing

`GET /api/quotes/sales-presets` returns the active manager-configured strategies:
Standard (30% markup), Competitive (25%), and Floor (20%). Add commercial
settings to a quote request:

```json
{
  "commercial": {
    "preset_id": "competitive",
    "negotiated_discount_percent": 3.0,
    "presentation_mode": "internal"
  }
}
```

Markup is applied to dealer cost and installation. Negotiated discounts reduce
merchandise sell price only; installation remains protected. The server rejects
concessions below the configured 20% minimum markup floor and reports the
maximum permitted discount. Internal responses include cost, profit, margin,
floor, and headroom. Customer responses include sell prices, the negotiated
discount, HST, and the final total without dealer cost or margin.

Manager-only preset changes use `PUT /api/admin/sales-presets` with the
`X-Pricing-Admin-Token` header. A floor override also requires that token and a
reason. Set `PRICING_ADMIN_TOKEN` in the server environment; all commercial
inputs and calculated values remain in the quote audit record.

The canonical glazing option accepts `90/5` gas and preserves the configured
price-book deal for the 90/5 mix when selected.

Quotes are recorded in `quote_records`. Approved or actual amounts are recorded
separately with `POST /api/quotes/{quote_id}/outcome`, so training labels never
overwrite the original deterministic result.

## Historical PDF workflow

1. Copy manufacturer PDFs into `data/raw/` or upload them through the import API.
2. Parse and import them:

   ```bash
   python -m parser data/raw --import-db
   ```

3. Use the resulting estimates and windows for audit, similarity, and future
   held-out calibration. Do not treat every parsed line as an independent
   training label when a PDF contains parent/child assembly rows.

The old `/api/predict` and `/api/similar` endpoints remain available for
historical/admin work. The legacy `/api/quote` and `/api/quote/batch` estimators
were retired; customer quoting uses `/api/quotes/price` and project estimates.

## Verification

```bash
make catalog-verify
make test
```

The catalog tests cover source metadata, tier pricing, installation, sample
golden totals, fail-closed invalid lookups, and unsupported-option review flags.
The source catalog data lives under `services/windowcity/data/`; price-book
business knobs live in `services/windowcity/config.json`. Sales presets ship
as defaults in `services/windowcity/sales_config.json`; once a manager saves
them in Settings they live in the database (`app_settings`).

## Sales workflow

1. **Estimate** — a project holds windows, doors, job items (removal, capping,
   permits… priced in Settings → Job items catalog), the province for sales
   tax, and optional Good / Better / Best options. The measure sheet
   (`/projects/<id>/measure`) adds windows quickly on site, converting rough
   openings to unit sizes and attaching photos.
2. **Price** — every change re-prices on the server. Internal views show cost,
   profit, and margin for the whole job; the minimum-markup floor and manager
   override (`PRICING_ADMIN_TOKEN`) still apply.
3. **Finalize** — locks the estimate, assigns `BV-EST-YYYY-NNNN`, and creates
   the customer link. Changes after that go into a revision (`-R2`, `-R3`…);
   older links then point the customer to the newest version.
4. **Send** — emails the customer a link plus the PDF (SMTP settings in
   `.env.example`). Without SMTP the salesperson copies the link or opens their
   own mail app. A follow-up date is set automatically.
5. **Customer** — `/estimate/<token>` shows the estimate, options, financing,
   and deposit; the customer picks an option, signs, and accepts. Opening the
   link marks the estimate *viewed*; acceptance locks in the price shown.
6. **Close out** — mark lost with a reason, reopen, or draft a follow-up
   email (AI-assisted when `ANTHROPIC_API_KEY` is set, otherwise a template).
   The dashboard (`/dashboard`) reports pipeline, close rate, margins,
   discounts, overrides, and follow-ups per salesperson.

Admin tools: **Price books** (`/admin/price-books`) import a replacement
supplier dataset, show every price change, and publish or revert it — already
priced drafts must then be repriced before finalizing. **Supplier cost check**
(`/admin/reconcile`) compares an order confirmation CSV with the engine's
dealer cost to catch drift.

Database changes are applied automatically at API startup (new tables and
columns are added in place); no manual migration step is needed.

## Project layout

```
window-ai/
  api/                 FastAPI service and quote contracts
  services/windowcity/ deterministic catalog engine and v18 data
  parser/              PDF/JSON normalization pipeline
  training/            optional historical ML pipeline
  db/                  estimates, quote audit records, and outcomes
  frontend/            Next.js quote builder and admin screens
  data/raw/            historical PDF inputs
  data/processed/      parsed estimate JSON
  models/              optional ML artifacts
  tests/               deterministic, API, parser, and legacy service tests
```

Unsupported grille, paint, sealed-unit, and bay/bow projection options produce
manual-review warnings. The engine never silently substitutes a historical ML
guess for an exact catalog price.
