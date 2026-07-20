"""Create tables if they do not exist."""
from __future__ import annotations

from db.models import Base
from db.session import get_engine
from utils.logging import get_logger

logger = get_logger("windowai.db")


def init_db() -> None:
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ensured at %s", engine.url.render_as_string(hide_password=True))


if __name__ == "__main__":
    init_db()
