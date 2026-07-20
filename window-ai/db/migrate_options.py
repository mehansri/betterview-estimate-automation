"""Add manufacturer option columns to existing SQLite/Postgres windows table."""
from __future__ import annotations

from sqlalchemy import inspect, text

from db.session import get_engine
from utils.logging import get_logger

logger = get_logger("windowai.migrate")

COLUMNS = {
    "brickmould": "BOOLEAN DEFAULT 0 NOT NULL",
    "wood_jamb": "BOOLEAN DEFAULT 0 NOT NULL",
    "screen": "BOOLEAN DEFAULT 0 NOT NULL",
    "mulled": "BOOLEAN DEFAULT 0 NOT NULL",
    "nailing_flange": "BOOLEAN DEFAULT 0 NOT NULL",
    "gas_fill": "VARCHAR(32)",
}


def migrate() -> None:
    engine = get_engine()
    insp = inspect(engine)
    existing = {c["name"] for c in insp.get_columns("windows")}
    with engine.begin() as conn:
        for name, ddl in COLUMNS.items():
            if name in existing:
                continue
            conn.execute(text(f"ALTER TABLE windows ADD COLUMN {name} {ddl}"))
            logger.info("Added column windows.%s", name)
    logger.info("Migration complete")


if __name__ == "__main__":
    migrate()
