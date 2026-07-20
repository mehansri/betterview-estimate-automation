# Phase 1 Architecture — Pricing Platform

## Pipeline

```
PDF/JSON (uploads/)
  → services/import_pipeline.py
  → parser (Keystone / default profiles)
  → normalize + validation
  → features + rules (config/pricing_rules.yaml)
  → DB: estimates, windows (1 row each), import_logs
  → similarity / analytics
  → services/pricing.predict_price()
  → POST /api/quote
  → frontend/
```

## Quote methods

| method | When |
|--------|------|
| `similarity` | ≥ `quote.min_neighbors` historical neighbors |
| `ml_fallback` | Sparse neighbors and CatBoost joblib loaded |
| `global_average` | No neighbors and no model |

Response contract is stable — swap engines inside `predict_price` only.

## Key endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/import-estimate` | Upload PDF/JSON |
| POST | `/api/import-estimate/batch` | Process `uploads/` |
| POST | `/api/estimates/{id}/reprocess` | Re-run pipeline |
| POST | `/api/quote` | Single window quote |
| POST | `/api/quote/batch` | Multi-line quote |
| POST | `/api/similar` | Neighbor search |
| GET | `/api/estimates` | Admin list |
| GET | `/api/windows` | Search/filter |
| GET | `/api/analytics` | Aggregates |
| GET | `/api/import-logs` | Import audit |
| POST | `/api/exports/windows` | CSV under `exports/` |
| POST | `/api/predict` | Legacy ML-only path |

## Config

Edit `config/pricing_rules.yaml` for oversized thresholds, glass layers, similarity weights, and quote neighbor settings.

## Local run

```bash
# API (SQLite)
DATABASE_URL=sqlite:///data/local.db make api

# Frontend
cd frontend && npm run dev

# Schema upgrade
make db-init
```

## Adding ML later

Implement or replace logic inside `services/pricing.py` → `_try_ml` / branch order. Do not change `/api/quote` response fields.
