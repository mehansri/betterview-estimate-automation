# Window AI Quote Prediction

Predict manufacturer window quote prices within **MAPE ≤ 4%** so sales reps get instant estimates without remoting into manufacturer software.

```
PDF estimates → parser → Postgres → feature engineering → ML models → FastAPI → Next.js quote builder
```

## Quick start (no Docker)

```bash
cd window-ai
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Seed synthetic history + train model (SQLite)
make bootstrap

# API
DATABASE_URL=sqlite:///data/local.db uvicorn api.main:app --reload --port 8000

# Quote UI (separate terminal)
cd app && npm install && npm run dev
```

Open http://localhost:3000 for the quote builder and http://localhost:8000/docs for the API.

## Quick start (Postgres + Docker)

```bash
cp .env.example .env
make up          # Postgres + API
# in another shell with venv:
export DATABASE_URL=postgresql://windowai:windowai@localhost:5432/windowai
make seed
make train
# restart API or POST /api/reload-model
```

## Drop real PDF estimates

1. Copy manufacturer estimate PDFs into `data/raw/`
2. Parse and import:
   ```bash
   python -m parser data/raw --import-db
   ```
3. Retrain:
   ```bash
   make train
   # or nightly gate:
   make nightly
   ```

The default PDF layout profile lives in `parser/layout_profiles/default.py`. After you add 1–3 real PDFs, tweak regexes there (or add a manufacturer-specific profile).

## API

### `POST /api/predict`

```json
{
  "type": "Casement",
  "width": 48,
  "height": 60,
  "frame": "Aluminum",
  "glass": "Triple",
  "color": "Black",
  "tempered": true,
  "grid": "None",
  "quantity": 1
}
```

Response:

```json
{
  "predicted_price": 1485.24,
  "confidence": 96.8,
  "low": 1440.0,
  "high": 1522.0,
  "currency": "CAD",
  "model_version": "...",
  "line_total": 1485.24
}
```

Also available: `POST /api/predict/batch`, `GET /health`, `GET /api/metrics`, `POST /api/reload-model`.

## Training

Models compared: Ridge, Random Forest, XGBoost, LightGBM, CatBoost.  
Best model selected by validation **MAPE**, exported to `models/quote_predictor.joblib`.

```bash
make train
python -m training.tune --trials 40   # optional Optuna
python -m training.nightly_retrain    # import raw → train → promote if better
```

Primary target: **test MAPE ≤ 4%**.

## Project layout

```
window-ai/
  api/           FastAPI service
  parser/        PDF/JSON estimate parser
  training/      clean, features, train, tune, nightly
  db/            SQLAlchemy models + synthetic seed
  app/           Next.js quote builder
  data/raw/      drop PDFs here
  models/        trained artifacts
  tests/
```

## Notes

- Synthetic seed data uses a noisy pricing function so the full pipeline works before real PDFs arrive. Replace with historical estimates ASAP for production accuracy.
- Currency defaults to **CAD**.
- Never trains on future estimates (time-based split).
- On macOS, XGBoost/LightGBM need OpenMP: `brew install libomp`. Training still runs with Ridge, Random Forest, and CatBoost without it.

## Example training results (synthetic)

| Model | Test MAPE |
|-------|-----------|
| Ridge | ~12% |
| Random Forest | ~9% |
| **CatBoost** | **~3.5%** (meets ≤4% target) |
