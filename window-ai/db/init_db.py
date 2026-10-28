"""Create tables if they do not exist and add columns introduced later."""
from __future__ import annotations

import hashlib
import json

from sqlalchemy import delete, inspect, insert, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateIndex, CreateTable

from db.models import Base, SchemaState
from db.session import get_engine
from utils.logging import get_logger

logger = get_logger("windowai.db")


def _default_sql(column) -> str | None:
    """A literal DEFAULT so NOT NULL columns can be added to populated tables."""
    default = column.default
    if default is None:
        return None
    arg = default.arg
    if callable(arg):
        # list/dict factories for JSON columns
        try:
            arg = arg(None)
        except TypeError:
            arg = arg()
    if isinstance(arg, bool):
        # Postgres rejects an integer default on a BOOLEAN column; SQLite
        # accepts TRUE/FALSE too.
        return "TRUE" if arg else "FALSE"
    if isinstance(arg, (int, float)):
        return str(arg)
    if isinstance(arg, str):
        return "'" + arg.replace("'", "''") + "'"
    if isinstance(arg, (list, dict)):
        return "'" + json.dumps(arg) + "'"
    return None


def _add_missing_columns(engine: Engine) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            present = {column["name"] for column in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in present:
                    continue
                column_type = column.type.compile(dialect=engine.dialect)
                default = _default_sql(column)
                ddl = f'ALTER TABLE {table.name} ADD COLUMN {column.name} {column_type}'
                if default is not None:
                    ddl += f" DEFAULT {default}"
                    if not column.nullable:
                        ddl += " NOT NULL"
                connection.execute(text(ddl))
                if column.unique:
                    connection.execute(text(
                        f"CREATE UNIQUE INDEX IF NOT EXISTS uq_{table.name}_{column.name} "
                        f"ON {table.name} ({column.name})"
                    ))
                logger.info("Added column %s.%s", table.name, column.name)
            # create_all skips existing tables, so add indexes introduced later.
            for index in table.indexes:
                index.create(bind=connection, checkfirst=True)


def init_db() -> None:
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    _add_missing_columns(engine)
    logger.info("Database tables ensured at %s", engine.url.render_as_string(hide_password=True))


_SCHEMA_KEY = "models"


def schema_fingerprint(engine: Engine) -> str:
    """Hash of the DDL init_db() would create, so any model change alters it."""
    digest = hashlib.sha256()
    for table in Base.metadata.sorted_tables:
        digest.update(str(CreateTable(table).compile(dialect=engine.dialect)).encode())
        for index in sorted(table.indexes, key=lambda index: index.name or ""):
            digest.update(str(CreateIndex(index).compile(dialect=engine.dialect)).encode())
    return digest.hexdigest()


def ensure_schema() -> bool:
    """Run init_db() only when the models changed since it last ran; True if it ran.

    init_db() inspects every table (about a hundred queries), which serverless
    API instances would otherwise repeat on every cold start.
    """
    engine = get_engine()
    fingerprint = schema_fingerprint(engine)
    try:
        with engine.connect() as connection:
            applied = connection.execute(
                select(SchemaState.fingerprint).where(SchemaState.key == _SCHEMA_KEY)
            ).scalar_one_or_none()
    except Exception:  # databases from before schema_state existed
        applied = None
    if applied == fingerprint:
        return False
    init_db()
    with engine.begin() as connection:
        connection.execute(delete(SchemaState).where(SchemaState.key == _SCHEMA_KEY))
        connection.execute(insert(SchemaState).values(key=_SCHEMA_KEY, fingerprint=fingerprint))
    return True


if __name__ == "__main__":
    init_db()
