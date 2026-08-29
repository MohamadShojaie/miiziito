"""PostgreSQL storage for tools/local_api.py — mirrors api/storage.php."""

from __future__ import annotations

import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Any

_lock = threading.Lock()
_pdo = None
_pdo_failed_at = 0.0

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

COLLECTION_FILES = {
    "orders": "orders.json",
    "invoices": "invoices.json",
    "tables": "tables.json",
    "menu_overrides": "menu-overrides.json",
    "sessions": "sessions.json",
    "reservations": "reservations.json",
    "payment_terminals": "payment_terminals.json",
    "payments": "payments.json",
    "payment_attempts": "payment_attempts.json",
}


class StorageError(Exception):
    """Raised when a DB-mapped collection cannot be read/written."""


def db_url() -> str:
    return (
        os.environ.get("MIIZIITO_DATABASE_URL")
        or os.environ.get("LUMIERE_DATABASE_URL")
        or os.environ.get("DATABASE_URL")
        or ""
    ).strip()


def db_enabled() -> bool:
    return bool(db_url())


def _reset_connection() -> None:
    global _pdo, _pdo_failed_at
    if _pdo is not None:
        try:
            _pdo.close()
        except Exception:
            pass
    _pdo = None
    _pdo_failed_at = time.time()


def _connect():
    global _pdo, _pdo_failed_at
    if _pdo is not None:
        return _pdo

    if _pdo_failed_at and (time.time() - _pdo_failed_at) < 3:
        return None

    url = db_url()
    if not url:
        return None
    try:
        import psycopg2

        _pdo = psycopg2.connect(url)
        _pdo.autocommit = True
        _pdo_failed_at = 0.0
        return _pdo
    except Exception:
        _pdo = None
        _pdo_failed_at = time.time()
        return None


def storage_map(path: Path) -> tuple[str, str] | None:
    text = str(path).replace("\\", "/")
    m = re.search(
        r"/data/(dev[0-9]*)/(orders|invoices|tables|menu-overrides|reservations|payment_terminals|payments|payment_attempts)\.json$",
        text,
    )
    if m:
        name = "menu_overrides" if m.group(2) == "menu-overrides" else m.group(2)
        return m.group(1), name
    m = re.search(
        r"/data/(orders|invoices|tables|menu-overrides|reservations|payment_terminals|payments|payment_attempts)\.json$",
        text,
    )
    if m:
        name = "menu_overrides" if m.group(1) == "menu-overrides" else m.group(1)
        return "", name
    if text.endswith("/data/sessions.json"):
        return "", "sessions"
    return None


def sandbox_from_path(path: Path) -> str:
    mapped = storage_map(path)
    return mapped[0] if mapped else ""


def storage_read(path: Path, default: Any) -> Any | None:
    """Read a mapped collection from Postgres.

    Returns None if the path is not DB-mapped (caller should use files).
    Raises StorageError when DB is required but unavailable / query fails.
    """
    mapped = storage_map(path)
    if not mapped:
        return None
    sandbox, collection = mapped
    conn = _connect()
    if not conn:
        raise StorageError("connection_failed")
    try:
        with _lock:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT data FROM collections WHERE sandbox_id = %s AND name = %s",
                    (sandbox, collection),
                )
                row = cur.fetchone()
                if not row:
                    return default
                data = row[0]
                if isinstance(data, (dict, list)):
                    return data
                return json.loads(data) if data else default
    except StorageError:
        raise
    except Exception as exc:
        _reset_connection()
        raise StorageError(str(exc)) from exc


def storage_write(path: Path, data: Any) -> bool:
    """Write a mapped collection. Returns False if path is not mapped.

    Raises StorageError when DB is required but write fails.
    """
    mapped = storage_map(path)
    if not mapped:
        return False
    sandbox, collection = mapped
    conn = _connect()
    if not conn:
        raise StorageError("connection_failed")
    try:
        payload = json.dumps(data, ensure_ascii=False)
        with _lock:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO collections (sandbox_id, name, data, updated_at)
                    VALUES (%s, %s, %s::jsonb, now())
                    ON CONFLICT (sandbox_id, name)
                    DO UPDATE SET data = EXCLUDED.data, updated_at = now()
                    """,
                    (sandbox, collection, payload),
                )
                cur.execute(
                    "INSERT INTO change_log (sandbox_id) VALUES (%s)",
                    (sandbox,),
                )
                # Bound growth: keep recent rows per sandbox.
                cur.execute(
                    """
                    DELETE FROM change_log
                    WHERE sandbox_id = %s
                      AND id < COALESCE(
                        (SELECT id FROM change_log
                         WHERE sandbox_id = %s
                         ORDER BY id DESC OFFSET 2000 LIMIT 1),
                        0
                      )
                    """,
                    (sandbox, sandbox),
                )
        return True
    except StorageError:
        raise
    except Exception as exc:
        _reset_connection()
        raise StorageError(str(exc)) from exc


def live_stamp(sandbox: str = "") -> int:
    conn = _connect()
    if not conn:
        return 0
    try:
        with _lock:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT GREATEST(
                      COALESCE((SELECT EXTRACT(EPOCH FROM MAX(updated_at)) * 1000
                                FROM collections WHERE sandbox_id = %s), 0),
                      COALESCE((SELECT EXTRACT(EPOCH FROM MAX(happened_at)) * 1000
                                FROM change_log WHERE sandbox_id = %s), 0)
                    )::bigint
                    """,
                    (sandbox, sandbox),
                )
                row = cur.fetchone()
                return int(row[0]) if row and row[0] else 0
    except Exception:
        _reset_connection()
        return 0


def storage_health() -> dict:
    if not db_enabled():
        return {"database": "json_files"}
    conn = _connect()
    if not conn:
        return {"database": "error", "detail": "connection_failed"}
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return {"database": "postgresql", "ok": True}
    except Exception:
        _reset_connection()
        return {"database": "error", "detail": "query_failed"}
