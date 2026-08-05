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

Supported line types are `window`, `combination`, `patio_sliding`,
`patio_swing`, and `bay_bow`. Responses include component list/dealer values,
installation, markup, HST, customer total, catalog source pages, configuration
version, and review warnings.

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

The old `/api/predict`, `/api/quote`, and `/api/quote/batch` endpoints remain
available for historical/admin compatibility. New customer quoting should use
`/api/quotes/price`.

## Verification

```bash
make catalog-verify
make test
```

The catalog tests cover source metadata, tier pricing, installation, sample
golden totals, fail-closed invalid lookups, and unsupported-option review flags.
The source catalog data lives under `services/windowcity/data/`; price-book
business knobs live in `services/windowcity/config.json`, while protected sales
presets live in `services/windowcity/sales_config.json`.

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
