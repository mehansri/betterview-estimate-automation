"""Lightweight Phase 1 schema upgrades for SQLite/Postgres (add missing columns/tables)."""
from __future__ import annotations

from sqlalchemy import inspect, text

from db.init_db import init_db
from db.session import get_engine
from utils.logging import get_logger

logger = get_logger("windowai.db.migrate")

# column_name -> SQL type for SQLite/Postgres-ish ADD COLUMN
WINDOW_COLUMNS = {
    "window_number": "INTEGER",
    "perimeter": "NUMERIC(12,3)",
    "aspect_ratio": "FLOAT",
    "oversized": "BOOLEAN DEFAULT 0",
    "wide_window": "BOOLEAN DEFAULT 0",
    "tall_window": "BOOLEAN DEFAULT 0",
    "spacer": "VARCHAR(64)",
    "low_e": "VARCHAR(64)",
    "interior_finish": "VARCHAR(64)",
    "exterior_finish": "VARCHAR(64)",
    "glass_layers": "INTEGER",
    "extras": "JSON",
}

ESTIMATE_COLUMNS = {
    "project_name": "VARCHAR(255)",
    "salesperson": "VARCHAR(255)",
    "created_at": "TIMESTAMP",
}


def migrate() -> None:
    init_db()
    engine = get_engine()
    insp = inspect(engine)
    with engine.begin() as conn:
        if "windows" in insp.get_table_names():
            existing = {c["name"] for c in insp.get_columns("windows")}
            for col, typ in WINDOW_COLUMNS.items():
                if col not in existing:
                    conn.execute(text(f"ALTER TABLE windows ADD COLUMN {col} {typ}"))
                    logger.info("Added windows.%s", col)
        if "estimates" in insp.get_table_names():
            existing = {c["name"] for c in insp.get_columns("estimates")}
            for col, typ in ESTIMATE_COLUMNS.items():
                if col not in existing:
                    conn.execute(text(f"ALTER TABLE estimates ADD COLUMN {col} {typ}"))
                    logger.info("Added estimates.%s", col)
    # import_logs created by init_db create_all
    logger.info("Phase 1 migration complete")


if __name__ == "__main__":
    migrate()
