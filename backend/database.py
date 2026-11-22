from pathlib import Path
from typing import AsyncGenerator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from utils.config import get_settings

DB_PATH = Path(__file__).parent / "resume_history.db"


def _database_url() -> str:
    """
    Local dev: a SQLite file next to this module.
    Deployed: DATABASE_URL (Neon Postgres), given exactly as Neon shows it
    (postgresql://user:pass@host/db?sslmode=require&channel_binding=require).
    asyncpg names the SSL option `ssl` and doesn't know `channel_binding`, so convert.
    """
    url = get_settings().database_url
    if not url:
        return f"sqlite+aiosqlite:///{DB_PATH}"
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query.pop("channel_binding", None)
    if "sslmode" in query:
        query["ssl"] = query.pop("sslmode")
    return urlunsplit(("postgresql+asyncpg", parts.netloc, parts.path, urlencode(query), ""))


engine = create_async_engine(_database_url(), echo=False, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# Columns added after the first release. create_all() makes new tables but never alters
# existing ones, so an older database gets them added here. (Small enough not to need a
# migration tool; switch to Alembic if the schema starts changing often.)
ADDED_COLUMNS = {"resume_records": {"job_description": "TEXT", "match_report": "TEXT", "outreach": "TEXT", "fit_check": "TEXT", "qa": "TEXT", "status": "VARCHAR(32)"}}


def _add_missing_columns(sync_conn) -> None:
    inspector = inspect(sync_conn)
    for table, columns in ADDED_COLUMNS.items():
        if not inspector.has_table(table):
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        for name, sql_type in columns.items():
            if name not in existing:
                sync_conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"))


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_columns)


async def close_db() -> None:
    await engine.dispose()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
