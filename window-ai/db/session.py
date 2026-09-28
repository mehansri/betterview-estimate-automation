"""Database engine and session helpers."""
from __future__ import annotations

import os
import time
from contextlib import contextmanager
from typing import Generator, Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None
_availability: dict[str, tuple[float, bool]] = {}
_AVAILABILITY_TTL = 30.0


def get_database_url() -> str:
    return os.getenv(
        "DATABASE_URL",
        "postgresql://windowai:windowai@localhost:5432/windowai",
    )


def get_engine(echo: bool = False) -> Engine:
    global _engine, _SessionLocal
    if _engine is None:
        url = get_database_url()
        # SQLite needs check_same_thread=False for tests
        connect_args = {}
        if url.startswith("sqlite"):
            connect_args["check_same_thread"] = False
        _engine = create_engine(url, echo=echo, future=True, connect_args=connect_args)
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    get_engine()
    assert _SessionLocal is not None
    return _SessionLocal


@contextmanager
def get_session() -> Iterator[Session]:
    factory = get_session_factory()
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def database_available() -> bool:
    """Whether the configured database answers (cached briefly).

    Optional database-backed settings use this so code paths that run without
    a database (scripts, pure pricing tests) don't wait on connection timeouts.
    """
    url = get_database_url()
    now = time.monotonic()
    hit = _availability.get(url)
    if hit and now - hit[0] < _AVAILABILITY_TTL:
        return hit[1]
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
        available = True
    except Exception:
        available = False
    _availability[url] = (now, available)
    return available


def reset_engine() -> None:
    """Reset global engine (useful in tests)."""
    global _engine, _SessionLocal
    _availability.clear()
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None
