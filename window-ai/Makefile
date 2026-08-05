.PHONY: help install up down db-init seed train api test catalog-verify parse nightly frontend-install frontend-dev bootstrap

export PYTHONPATH := $(CURDIR)
export DATABASE_URL ?= postgresql://windowai:windowai@localhost:5432/windowai

help:
	@echo "Targets:"
	@echo "  install           - pip install requirements"
	@echo "  up                - docker compose up Postgres (+ API)"
	@echo "  down              - docker compose down"
	@echo "  db-init           - create tables"
	@echo "  seed              - seed synthetic estimates"
	@echo "  train             - train models and export best"
	@echo "  api               - run FastAPI locally"
	@echo "  parse             - parse data/raw into processed (+ --import-db)"
	@echo "  nightly           - retrain + promote"
	@echo "  test              - pytest"
	@echo "  catalog-verify    - deterministic Window City catalog tests"
	@echo "  bootstrap         - sqlite seed + train (no Docker)"
	@echo "  frontend-install  - npm install in frontend/"
	@echo "  frontend-dev      - next dev"
	@echo "  app-install       - alias for frontend-install"
	@echo "  app-dev           - alias for frontend-dev"

install:
	python3 -m pip install -r requirements.txt

up:
	docker compose up -d --build

down:
	docker compose down

db-init:
	python3 -m db.init_db
	python3 -m db.migrate_phase1

seed:
	python3 -m db.seed_synthetic

train:
	python3 -m training.pipeline

api:
	uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

parse:
	python3 -m parser --import-db

nightly:
	python3 -m training.nightly_retrain

test:
	python3 -m pytest tests/ -q

catalog-verify:
	python3 -m pytest tests/test_windowcity_engine.py -q

bootstrap:
	@mkdir -p data models uploads exports
	python3 -m db.seed_synthetic --sqlite data/local.db --n 400
	DATABASE_URL=sqlite:///data/local.db python3 -m training.pipeline --sqlite data/local.db
	@echo "Bootstrap complete. Run: DATABASE_URL=sqlite:///data/local.db make api"

frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

# Backward-compatible aliases
app-install: frontend-install
app-dev: frontend-dev
