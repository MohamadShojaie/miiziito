#!/usr/bin/env python3
"""Import existing JSON data files into PostgreSQL collections."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

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

DEFAULTS = {
    "orders": [],
    "invoices": [],
    "tables": {"regions": [], "states": {}},
    "menu_overrides": {},
    "sessions": {},
    "reservations": [],
    "payment_terminals": [],
    "payments": [],
    "payment_attempts": [],
}


def db_url() -> str:
    return (
        os.environ.get("MIIZIITO_DATABASE_URL")
        or os.environ.get("LUMIERE_DATABASE_URL")
        or os.environ.get("DATABASE_URL")
        or ""
    ).strip()


def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def discover_sandboxes() -> list[str]:
    sandboxes = [""]
    if not DATA.is_dir():
        return sandboxes
    for child in sorted(DATA.iterdir()):
        if child.is_dir() and child.name.startswith("dev"):
            sandboxes.append(child.name)
    return sandboxes


def normalize_existing(raw):
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return None
    return raw


def is_empty_payload(collection: str, data) -> bool:
    return data == DEFAULTS.get(collection)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing non-empty DB collections from JSON",
    )
    args = parser.parse_args()

    url = db_url()
    if not url:
        print("Set MIIZIITO_DATABASE_URL before running migration.", file=sys.stderr)
        return 1

    try:
        import psycopg2
    except ImportError:
        print("Install psycopg2-binary: pip install -r requirements.txt", file=sys.stderr)
        return 1

    conn = psycopg2.connect(url)
    conn.autocommit = False

    try:
        with conn.cursor() as cur:
            for sandbox in discover_sandboxes():
                base = DATA if sandbox == "" else DATA / sandbox
                print(f"Migrating sandbox '{sandbox or 'live'}'…")
                wrote = 0
                for collection, filename in COLLECTION_FILES.items():
                    path = base / filename
                    payload = load_json(path, DEFAULTS[collection])

                    cur.execute(
                        """
                        SELECT data FROM collections
                        WHERE sandbox_id = %s AND name = %s
                        """,
                        (sandbox, collection),
                    )
                    row = cur.fetchone()
                    existing = normalize_existing(row[0]) if row else None

                    if (
                        existing is not None
                        and not args.force
                        and not is_empty_payload(collection, existing)
                    ):
                        print(
                            f"  skip {collection} (already has data; use --force to overwrite)"
                        )
                        continue

                    cur.execute(
                        """
                        INSERT INTO collections (sandbox_id, name, data, updated_at)
                        VALUES (%s, %s, %s::jsonb, now())
                        ON CONFLICT (sandbox_id, name)
                        DO UPDATE SET data = EXCLUDED.data, updated_at = now()
                        """,
                        (sandbox, collection, json.dumps(payload, ensure_ascii=False)),
                    )
                    wrote += 1
                    print(f"  upserted {collection} from {path.name}")

                if wrote:
                    cur.execute(
                        "INSERT INTO change_log (sandbox_id) VALUES (%s)",
                        (sandbox,),
                    )

        conn.commit()
        print("Migration complete.")
        return 0
    except Exception as exc:
        conn.rollback()
        print(f"Migration failed: {exc}", file=sys.stderr)
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
