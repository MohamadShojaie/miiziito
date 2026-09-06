#!/usr/bin/env python3
"""Local API for Miiziito Next.js dev — mirrors PHP routes using data/*.json."""

from __future__ import annotations

import json
import os
import re
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
UPLOADS = ROOT / "uploads"
BRANDING_UPLOADS = UPLOADS / "branding"
TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
from storage_db import (
    StorageError,
    db_enabled,
    live_stamp as db_live_stamp,
    storage_health,
    storage_map,
    storage_read,
    storage_write,
)
SECRET = DATA / "secret.php"
SESSIONS = DATA / "sessions.json"
ORDERS = DATA / "orders.json"
MENU = DATA / "menu-overrides.json"
TABLES = DATA / "tables.json"
INVOICES = DATA / "invoices.json"
SETTINGS = DATA / "settings.json"
CUSTOMERS = DATA / "customers.json"
COUPONS = DATA / "coupons.json"
HARDWARE = DATA / "hardware.json"
RESERVATIONS = DATA / "reservations.json"
PAYMENT_TERMINALS = DATA / "payment_terminals.json"
PAYMENTS = DATA / "payments.json"
PAYMENT_ATTEMPTS = DATA / "payment_attempts.json"
PORT = int(
    os.environ.get("PORT")
    or os.environ.get("MIIZIITO_API_PORT")
    or os.environ.get("LUMIERE_API_PORT")
    or "8787"
)
HOST = os.environ.get("MIIZIITO_API_HOST", "0.0.0.0")

_lock = threading.Lock()
# Per-request sandbox remapping (mirrors PHP apply_sandbox_store).
_request_ctx = threading.local()

# Collections remapped into data/{sandbox}/ for dev accounts.
_SANDBOX_FILENAMES = {
    "orders.json",
    "menu-overrides.json",
    "tables.json",
    "invoices.json",
    "customers.json",
    "reservations.json",
}

_TENANT_FILENAMES = _SANDBOX_FILENAMES | {
    "settings.json",
    "sessions.json",
}

try:
    from printer import (
        capabilities as printer_capabilities,
        delete_printer as printer_delete,
        discover as printer_discover,
        fingerprint as printer_fingerprint,
        print_receipt as printer_print_receipt,
        save_printer as printer_save,
        test_printer as printer_test,
        update_printer as printer_update,
    )
except Exception as _printer_import_err:  # pragma: no cover
    printer_capabilities = None
    printer_delete = None
    printer_discover = None
    printer_fingerprint = None
    printer_print_receipt = None
    printer_save = None
    printer_test = None
    printer_update = None
    print(f"[api] printer module unavailable: {_printer_import_err}")

try:
    from payment import (
        cancel_payment as payment_cancel,
        check_agent_request,
        discover as payment_discover,
        health as payment_health,
        inquiry_payment as payment_inquiry,
        list_providers as payment_list_providers,
        rate_limit_ok as payment_rate_limit_ok,
        reversal_payment as payment_reversal,
        sale as payment_sale,
        test_connection as payment_test_connection,
    )
    from payment.store import (
        apply_result_to_payment,
        can_retry_sale,
        clear_defaults as payment_clear_defaults,
        find_payment,
        find_terminal_index,
        new_attempt_id,
        new_payment_id,
        next_attempt_number,
        normalize_attempt,
        normalize_payment,
        normalize_terminal,
        sort_terminals,
    )
except Exception as _payment_import_err:  # pragma: no cover
    payment_cancel = None
    check_agent_request = None
    payment_discover = None
    payment_health = None
    payment_inquiry = None
    payment_list_providers = None
    payment_rate_limit_ok = None
    payment_reversal = None
    payment_sale = None
    payment_test_connection = None
    apply_result_to_payment = None
    can_retry_sale = None
    payment_clear_defaults = None
    find_payment = None
    find_terminal_index = None
    new_attempt_id = None
    new_payment_id = None
    next_attempt_number = None
    normalize_attempt = None
    normalize_payment = None
    normalize_terminal = None
    sort_terminals = None
    print(f"[api] payment module unavailable: {_payment_import_err}")

try:
    import super_admin as _super_admin_mod
    sa_handle = _super_admin_mod.handle
except Exception as _sa_import_err:  # pragma: no cover
    _super_admin_mod = None
    sa_handle = None
    print(f"[api] super_admin module unavailable: {_sa_import_err}")

try:
    from tenant_slug import (
        find_cafe_by_slug,
        is_cafe_live,
        provision_tenant,
        request_tenant_slug,
        verify_tenant_cashier_password,
    )
except Exception as _tenant_import_err:  # pragma: no cover
    find_cafe_by_slug = None
    is_cafe_live = None
    provision_tenant = None
    request_tenant_slug = None
    verify_tenant_cashier_password = None
    print(f"[api] tenant_slug module unavailable: {_tenant_import_err}")


def _sa_handle(method, route, item_id, body, qs, headers):
    """Reload super_admin in dev so panel API changes apply without restart."""
    if _super_admin_mod is None:
        return None
    import importlib

    importlib.reload(_super_admin_mod)
    return _super_admin_mod.handle(method, route, item_id, body, qs, headers)


def ensure_files() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    BRANDING_UPLOADS.mkdir(parents=True, exist_ok=True)
    for path, default in (
        (SESSIONS, "{}"),
        (ORDERS, "[]"),
        (MENU, "{}"),
        (TABLES, '{"regions":[],"states":{}}'),
        (INVOICES, "[]"),
        (SETTINGS, "{}"),
        (CUSTOMERS, "[]"),
        (COUPONS, "[]"),
        (HARDWARE, "[]"),
        (RESERVATIONS, "[]"),
        (PAYMENT_TERMINALS, "[]"),
        (PAYMENTS, "[]"),
        (PAYMENT_ATTEMPTS, "[]"),
    ):
        if not path.exists():
            path.write_text(default, encoding="utf-8")


def sanitize_sandbox_id(raw) -> str:
    sid = str(raw or "").strip().lower()
    if sid in ("1", "true"):
        return "dev"
    sid = re.sub(r"[^a-z0-9]", "", sid)
    if re.match(r"^dev[0-9]*$", sid):
        return sid
    return ""


def ensure_sandbox_store(sandbox_id: str) -> None:
    """Create data/{sandbox}/ files like PHP apply_sandbox_store."""
    sandbox_id = sanitize_sandbox_id(sandbox_id)
    if not sandbox_id:
        return
    base = DATA / sandbox_id
    base.mkdir(parents=True, exist_ok=True)
    seeds = {
        "orders.json": "[]",
        "menu-overrides.json": None,  # copy from live
        "tables.json": None,
        "invoices.json": "[]",
        "customers.json": "[]",
        "reservations.json": "[]",
    }
    for name, default in seeds.items():
        path = base / name
        if path.exists():
            continue
        if default is None:
            live = DATA / name
            if live.exists():
                try:
                    path.write_text(live.read_text(encoding="utf-8"), encoding="utf-8")
                    continue
                except Exception:
                    pass
            default = (
                '{"regions":[],"states":{}}' if name == "tables.json" else "{}"
            )
        path.write_text(default, encoding="utf-8")
    uploads = ROOT / "uploads" / sandbox_id
    uploads.mkdir(parents=True, exist_ok=True)


def set_request_sandbox(sandbox_id: str) -> None:
    sid = sanitize_sandbox_id(sandbox_id)
    _request_ctx.sandbox = sid
    if sid:
        ensure_sandbox_store(sid)


def clear_request_sandbox() -> None:
    _request_ctx.sandbox = ""
    _request_ctx.tenant = ""


def clear_request_tenant() -> None:
    _request_ctx.tenant = ""


def set_request_tenant(tenant_id: str) -> None:
    tid = re.sub(r"[^a-zA-Z0-9_-]", "", str(tenant_id or ""))
    _request_ctx.tenant = tid


def active_tenant() -> str:
    return str(getattr(_request_ctx, "tenant", "") or "")


def active_uploads_base() -> Path:
    tenant = active_tenant()
    if tenant:
        return UPLOADS / "tenants" / tenant
    sandbox = active_sandbox()
    if sandbox:
        return UPLOADS / sandbox
    return UPLOADS


def branding_uploads_dir() -> Path:
    path = active_uploads_base() / "branding"
    path.mkdir(parents=True, exist_ok=True)
    return path


def uploads_items_dir() -> Path:
    path = active_uploads_base() / "items"
    path.mkdir(parents=True, exist_ok=True)
    return path


def uploads_web_prefix(subdir: str = "items") -> str:
    tenant = active_tenant()
    if tenant:
        return f"uploads/tenants/{tenant}/{subdir}/"
    sandbox = active_sandbox()
    if sandbox:
        return f"uploads/{sandbox}/{subdir}/"
    return f"uploads/{subdir}/"


def active_sandbox() -> str:
    return str(getattr(_request_ctx, "sandbox", "") or "")


def store_path(path: Path) -> Path:
    """Remap live data/*.json into tenant or sandbox directories."""
    try:
        resolved = path.resolve()
        data_resolved = DATA.resolve()
    except Exception:
        return path
    if resolved.parent != data_resolved:
        return path

    tenant = active_tenant()
    if tenant and resolved.name in _TENANT_FILENAMES:
        return DATA / "tenants" / tenant / resolved.name

    sandbox = active_sandbox()
    if sandbox and resolved.name in _SANDBOX_FILENAMES:
        return DATA / sandbox / resolved.name
    return path


def read_json(path: Path, default):
    path = store_path(path)
    if db_enabled() and storage_map(path):
        return storage_read(path, default)
    with _lock:
        try:
            raw = path.read_text(encoding="utf-8").strip()
            if not raw:
                return default
            return json.loads(raw)
        except Exception:
            return default


def write_json(path: Path, data) -> None:
    path = store_path(path)
    if db_enabled() and storage_map(path):
        storage_write(path, data)
        return
    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_secrets() -> dict:
    text = SECRET.read_text(encoding="utf-8") if SECRET.exists() else ""
    out: dict[str, str] = {}
    for key in ("CASHIER_PASSWORD", "DEV_PASSWORD", "DEV_PASSWORD_2"):
        m = re.search(rf'\${key}\s*=\s*"([^"]*)"', text)
        if m:
            out[key] = m.group(1)
    return out


def secret_matches(expected: str, entered: str) -> bool:
    return bool(expected) and expected == entered


def live_stamp() -> int:
    sandbox = active_sandbox()
    if db_enabled():
        stamp = db_live_stamp(sandbox)
        if stamp > 0:
            return stamp
    stamp = 0
    for p in (ORDERS, TABLES, INVOICES, RESERVATIONS):
        try:
            stamp = max(stamp, int(store_path(p).stat().st_mtime * 1000))
        except OSError:
            pass
    return stamp


def default_regions():
    return [
        {"id": "green", "name": "اتاق سبز", "tables": [1, 2, 3, 4]},
        {"id": "blue", "name": "اتاق آبی", "tables": [6, 7, 8, 9, 10, 11]},
        {
            "id": "yard-up",
            "name": "حیاط بالا",
            "tables": [12, 13, 14, 15, 16, 17, 18, 19, 20],
        },
        {"id": "yard-down", "name": "حیاط پایین", "tables": [21, 22, 23, 24, 25]},
    ]


def sanitize_toppings(raw):
    if not isinstance(raw, list):
        return []
    cleaned = []
    for item in raw:
        if isinstance(item, str):
            name = item.strip()
            if not name:
                continue
            cleaned.append({"name": name[:80], "price": 0})
        elif isinstance(item, dict):
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            try:
                price = float(item.get("price") or 0)
            except (TypeError, ValueError):
                price = 0.0
            if price < 0:
                price = 0.0
            cleaned.append({"name": name[:80], "price": price})
        if len(cleaned) >= 24:
            break
    return cleaned


def sanitize_items(raw):
    if not isinstance(raw, list) or not raw:
        return None
    cleaned = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        try:
            count = int(item.get("count") or 1)
        except (TypeError, ValueError):
            count = 1
        if count < 1:
            count = 1
        if count > 99:
            count = 99
        price = item.get("price")
        if price is None:
            price = 0
        cleaned.append(
            {
                "id": str(item.get("id") or f"item-{i}"),
                "name": name[:200],
                "price": price,
                "count": count,
            }
        )
        tops = sanitize_toppings(item.get("toppings"))
        if tops:
            cleaned[-1]["toppings"] = tops
    return cleaned or None


def item_line_total(items: list) -> float:
    total = 0.0
    for it in items:
        try:
            price = float(re.sub(r"[^\d.]", "", str(it.get("price") or 0)) or 0)
        except (TypeError, ValueError):
            price = 0.0
        try:
            count = int(it.get("count") or 1)
        except (TypeError, ValueError):
            count = 1
        total += price * max(1, count)
    return total


def append_order_history(order: dict, action: str, status: str = "") -> None:
    history = order.get("history")
    if not isinstance(history, list):
        history = []
    history.append(
        {
            "at": int(time.time() * 1000),
            "action": action,
            "status": status or order.get("status") or "",
        }
    )
    order["history"] = history[-80:]


def parse_table_number(raw) -> str:
    s = re.sub(r"\D+", "", str(raw or ""))[:2]
    if not s:
        return ""
    n = int(s)
    if n < 1 or n > 99:
        return ""
    return str(n)


def slug_region_id(name: str, hint: str = "") -> str:
    base = re.sub(r"[^a-z0-9\-]", "", str(hint or name).strip().lower().replace(" ", "-"))
    if base:
        return base[:32]
    return f"region-{int(time.time() * 1000) % 100000000}"


def read_table_layout() -> dict:
    data = read_json(TABLES, {})
    if not isinstance(data, dict):
        data = {}
    if "regions" in data:
        regions = data.get("regions")
        if not isinstance(regions, list):
            regions = []
    elif active_tenant():
        regions = []
    else:
        regions = default_regions()
    states = data.get("states") or data.get("tables") or {}
    if not isinstance(states, dict):
        states = {}
    return {"regions": regions, "states": states}


def write_table_layout(layout: dict) -> None:
    regions = layout.get("regions")
    if not isinstance(regions, list):
        regions = []
    write_json(
        TABLES,
        {
            "regions": regions,
            "states": layout.get("states") or {},
        },
    )


def known_table_set(layout: dict) -> set[str]:
    out: set[str] = set()
    for region in layout.get("regions") or []:
        for num in region.get("tables") or []:
            t = parse_table_number(num)
            if t:
                out.add(t)
    return out


def add_table_to_region(layout: dict, region_id: str, table: str) -> bool:
    table = parse_table_number(table)
    region_id = re.sub(r"[^a-z0-9\-]", "", str(region_id or "").lower())
    if not table or not region_id:
        return False
    for region in layout.get("regions") or []:
        if region.get("id") != region_id:
            continue
        nums = [int(parse_table_number(n)) for n in region.get("tables") or []]
        nums = [n for n in nums if n > 0]
        if int(table) not in nums:
            nums.append(int(table))
        nums = sorted(set(nums))
        region["tables"] = nums
        return True
    return False


def add_region(layout: dict, name: str, region_id: str = "") -> bool:
    name = str(name or "").strip()
    if not name:
        return False
    region_id = re.sub(r"[^a-z0-9\-]", "", str(region_id or "").lower())
    if not region_id:
        region_id = slug_region_id(name)
    regions = layout.setdefault("regions", [])
    for region in regions:
        if region.get("id") == region_id:
            return False
    regions.append({"id": region_id, "name": name, "tables": []})
    return True


def rename_region(layout: dict, region_id: str, name: str) -> bool:
    name = str(name or "").strip()
    region_id = re.sub(r"[^a-z0-9\-]", "", str(region_id or "").lower())
    if not name or not region_id:
        return False
    for region in layout.get("regions") or []:
        if region.get("id") == region_id:
            region["name"] = name
            return True
    return False


def remove_region(layout: dict, region_id: str) -> bool:
    region_id = re.sub(r"[^a-z0-9\-]", "", str(region_id or "").lower())
    if not region_id:
        return False
    regions = layout.get("regions") or []
    next_regions = []
    removed = []
    found = False
    for region in regions:
        if region.get("id") == region_id:
            found = True
            for num in region.get("tables") or []:
                t = parse_table_number(num)
                if t:
                    removed.append(t)
            continue
        next_regions.append(region)
    if not found:
        return False
    layout["regions"] = next_regions
    states = layout.setdefault("states", {})
    for t in removed:
        states.pop(t, None)
    return True


def rename_table_number(layout: dict, old_table, new_table) -> str:
    old_table = parse_table_number(old_table)
    new_table = parse_table_number(new_table)
    if not old_table or not new_table:
        return "table_required"
    if old_table == new_table:
        return "ok"
    known = known_table_set(layout)
    if old_table not in known:
        return "table_unknown"
    if new_table in known:
        return "table_exists"
    for region in layout.get("regions") or []:
        nums = []
        changed = False
        for num in region.get("tables") or []:
            t = parse_table_number(num)
            if t == old_table:
                nums.append(int(new_table))
                changed = True
            elif t:
                nums.append(int(t))
        if changed:
            region["tables"] = sorted(set(n for n in nums if n > 0))
    states = layout.setdefault("states", {})
    if old_table in states:
        states[new_table] = states.pop(old_table)
    return "ok"


def tables_payload():
    sync_reservation_holds()
    layout = read_table_layout()
    return {"tables": layout["states"], "regions": layout["regions"]}


def normalize_phone(raw) -> str:
    digits = re.sub(r"\D+", "", str(raw or ""))
    return digits[:15]


def read_reservations() -> list:
    raw = read_json(RESERVATIONS, [])
    return raw if isinstance(raw, list) else []


def write_reservations(rows: list) -> None:
    write_json(RESERVATIONS, list(rows))


def reservation_is_open(status: str) -> bool:
    return status in ("pending", "accepted")


def find_open_reservation_for_table(rows: list, table: str):
    table = parse_table_number(table)
    for row in rows:
        if not isinstance(row, dict):
            continue
        if parse_table_number(row.get("table")) != table:
            continue
        if reservation_is_open(str(row.get("status") or "")):
            return row
    return None


def mark_table_reserved(table: str) -> dict:
    layout = read_table_layout()
    table = parse_table_number(table)
    if not table:
        return layout
    if (layout.get("states") or {}).get(table) == "disabled":
        return layout
    layout.setdefault("states", {})[table] = "reserved"
    write_table_layout(layout)
    return read_table_layout()


def clear_reserved_table(table: str) -> dict:
    layout = read_table_layout()
    table = parse_table_number(table)
    if not table:
        return layout
    states = layout.setdefault("states", {})
    if states.get(table) != "reserved":
        return layout
    states.pop(table, None)
    write_table_layout(layout)
    return read_table_layout()


def mark_table_full(table: str) -> dict:
    layout = read_table_layout()
    table = parse_table_number(table)
    if not table:
        return layout
    if (layout.get("states") or {}).get(table) == "disabled":
        return layout
    layout.setdefault("states", {})[table] = "full"
    write_table_layout(layout)
    return read_table_layout()


def seat_accepted_reservation(table: str):
    table = parse_table_number(table)
    rows = read_reservations()
    now = int(time.time() * 1000)
    seated = None
    for row in rows:
        if not isinstance(row, dict):
            continue
        if parse_table_number(row.get("table")) != table:
            continue
        if str(row.get("status") or "") != "accepted":
            continue
        row["status"] = "seated"
        row["updatedAt"] = now
        seated = row
        break
    if seated is not None:
        write_reservations(rows)
    return rows, seated


def cancel_open_reservations_for_table(table: str) -> list:
    table = parse_table_number(table)
    rows = read_reservations()
    now = int(time.time() * 1000)
    changed = False
    for row in rows:
        if not isinstance(row, dict):
            continue
        if parse_table_number(row.get("table")) != table:
            continue
        if not reservation_is_open(str(row.get("status") or "")):
            continue
        row["status"] = "cancelled"
        row["updatedAt"] = now
        changed = True
    if changed:
        write_reservations(rows)
    return rows


RESERVE_HOLD_BEFORE_MS = 30 * 60 * 1000  # lock table 30 min before reserved time


def parse_reservation_date(raw) -> str | None:
    """Accept YYYY-MM-DD; may be today or future (time checked separately)."""
    s = str(raw or "").strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return None
    try:
        import datetime as _dt

        y, m, d = (int(x) for x in s.split("-"))
        _dt.date(y, m, d)
    except Exception:
        return None
    today = time.strftime("%Y-%m-%d", time.localtime())
    if s < today:
        return None
    return s


def parse_reservation_time(raw) -> str | None:
    s = str(raw or "").strip()
    if not re.fullmatch(r"\d{1,2}:\d{2}", s):
        return None
    try:
        h, m = (int(x) for x in s.split(":"))
    except Exception:
        return None
    if h < 0 or h > 23 or m < 0 or m > 59:
        return None
    return f"{h:02d}:{m:02d}"


def reservation_at_ms(row: dict) -> int | None:
    if not isinstance(row, dict):
        return None
    try:
        if row.get("reservedAt") is not None:
            return int(row.get("reservedAt"))
    except (TypeError, ValueError):
        pass
    date = str(row.get("date") or "").strip()
    clock = str(row.get("time") or "").strip() or "00:00"
    if not date or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        return None
    clock = parse_reservation_time(clock) or "00:00"
    try:
        import datetime as _dt

        y, mo, d = (int(x) for x in date.split("-"))
        hh, mm = (int(x) for x in clock.split(":"))
        return int(_dt.datetime(y, mo, d, hh, mm).timestamp() * 1000)
    except Exception:
        return None


def reservation_hold_started(row: dict, now_ms: int | None = None) -> bool:
    """True from 30 minutes before reserved time (legacy rows without date/time = immediate)."""
    now_ms = int(now_ms if now_ms is not None else time.time() * 1000)
    at = reservation_at_ms(row)
    if at is None:
        return True
    return now_ms >= at - RESERVE_HOLD_BEFORE_MS


def reservation_time_reached(row: dict, now_ms: int | None = None) -> bool:
    """True once reserved clock time has arrived."""
    now_ms = int(now_ms if now_ms is not None else time.time() * 1000)
    at = reservation_at_ms(row)
    if at is None:
        return True
    return now_ms >= at


def sync_reservation_holds() -> None:
    """Mark tables reserved once we enter the 30-minute hold window."""
    rows = read_reservations()
    now = int(time.time() * 1000)
    layout = read_table_layout()
    states = layout.setdefault("states", {})
    changed = False
    for row in rows:
        if not isinstance(row, dict):
            continue
        if str(row.get("status") or "") != "accepted":
            continue
        if not reservation_hold_started(row, now):
            continue
        table = parse_table_number(row.get("table"))
        if not table:
            continue
        st = states.get(table) or "open"
        if st in ("disabled", "full", "reserved"):
            continue
        states[table] = "reserved"
        changed = True
    if changed:
        write_table_layout(layout)


def cancel_reservations_after_invoice(table: str) -> list:
    """Cancel accepted/seated reservation only if invoice is at/after reserved time."""
    table = parse_table_number(table)
    rows = read_reservations()
    now = int(time.time() * 1000)
    changed = False
    cancelled_hold = False
    for row in rows:
        if not isinstance(row, dict):
            continue
        if parse_table_number(row.get("table")) != table:
            continue
        st = str(row.get("status") or "")
        if st not in ("accepted", "seated"):
            continue
        if not reservation_time_reached(row, now):
            continue
        row["status"] = "cancelled"
        row["updatedAt"] = now
        changed = True
        cancelled_hold = True
    if changed:
        write_reservations(rows)
    if cancelled_hold:
        clear_reserved_table(table)
    return rows


def seat_accepted_reservation(table: str):
    """Seat only when inside the hold window (30 min before reserved time)."""
    table = parse_table_number(table)
    rows = read_reservations()
    now = int(time.time() * 1000)
    seated = None
    for row in rows:
        if not isinstance(row, dict):
            continue
        if parse_table_number(row.get("table")) != table:
            continue
        if str(row.get("status") or "") != "accepted":
            continue
        if not reservation_hold_started(row, now):
            continue
        row["status"] = "seated"
        row["updatedAt"] = now
        seated = row
        break
    if seated is not None:
        write_reservations(rows)
    return rows, seated


def reservations_payload(extra: dict | None = None) -> dict:
    sync_reservation_holds()
    payload = tables_payload()
    payload["reservations"] = read_reservations()
    if extra:
        payload.update(extra)
    return payload


def _day_start_ms(offset_days: int = 0) -> int:
    now = time.localtime()
    start = time.mktime(
        (now.tm_year, now.tm_mon, now.tm_mday, 0, 0, 0, now.tm_wday, now.tm_yday, now.tm_isdst)
    )
    return int((start + offset_days * 86400) * 1000)


def _week_start_ms() -> int:
    now = time.localtime()
    # Monday = 0 in ISO; Python tm_wday Monday=0
    return _day_start_ms(-now.tm_wday)


def _month_start_ms() -> int:
    now = time.localtime()
    start = time.mktime((now.tm_year, now.tm_mon, 1, 0, 0, 0, 0, 0, -1))
    return int(start * 1000)


def _invoice_refunded(inv: dict) -> int:
    total = 0
    for row in inv.get("refunds") or []:
        if isinstance(row, dict):
            try:
                total += int(round(float(row.get("amount") or 0)))
            except (TypeError, ValueError):
                pass
    return total


def compute_invoice_stats(invoices) -> dict:
    if not isinstance(invoices, list):
        invoices = []
    today = _day_start_ms(0)
    tomorrow = _day_start_ms(1)
    week = _week_start_ms()
    month = _month_start_ms()
    today_sales = week_sales = month_sales = 0
    today_count = paid_count = paid_sum = 0
    unpaid_count = unpaid_total = 0
    cash = card = online = discount_total = refund_total = 0
    hours = {h: 0 for h in range(24)}
    items: dict[str, int] = {}

    for inv in invoices:
        if not isinstance(inv, dict):
            continue
        st = str(inv.get("status") or "unpaid")
        if st == "cancelled":
            continue
        ts = int(inv.get("createdAt") or 0)
        try:
            total = int(round(float(inv.get("total") or 0)))
        except (TypeError, ValueError):
            total = 0
        refunded = _invoice_refunded(inv)
        net = max(0, total - refunded)
        try:
            discount_total += int(round(float(inv.get("discountAmount") or 0)))
        except (TypeError, ValueError):
            pass
        refund_total += refunded

        if st == "unpaid":
            unpaid_count += 1
            unpaid_total += total

        is_sales = st in ("paid", "partially_refunded", "refunded")
        if not is_sales:
            continue

        paid_count += 1
        paid_sum += net
        if today <= ts < tomorrow:
            today_sales += net
            today_count += 1
        if ts >= week:
            week_sales += net
        if ts >= month:
            month_sales += net
        if ts > 0:
            hour = int(time.localtime(ts / 1000).tm_hour)
            hours[hour] = hours.get(hour, 0) + 1

        for p in inv.get("payments") or []:
            if not isinstance(p, dict):
                continue
            try:
                amt = int(round(float(p.get("amount") or 0)))
            except (TypeError, ValueError):
                amt = 0
            method = str(p.get("method") or "")
            if method == "cash":
                cash += amt
            elif method == "card":
                card += amt
            elif method == "online":
                online += amt

        for item in inv.get("items") or []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            try:
                qty = int(item.get("count") or 1)
            except (TypeError, ValueError):
                qty = 1
            items[name] = items.get(name, 0) + max(1, qty)

    top = [
        {"name": name, "count": count}
        for name, count in sorted(items.items(), key=lambda x: x[1], reverse=True)[:8]
    ]
    peak_hour = 0
    peak_count = 0
    for h, c in hours.items():
        if c > peak_count:
            peak_count = c
            peak_hour = h

    return {
        "todaySales": today_sales,
        "weekSales": week_sales,
        "monthSales": month_sales,
        "todayCount": today_count,
        "invoiceCount": paid_count,
        "averageTotal": round(paid_sum / paid_count) if paid_count else 0,
        "unpaidCount": unpaid_count,
        "unpaidTotal": unpaid_total,
        "cashSales": cash,
        "cardSales": card,
        "onlineSales": online,
        "discountTotal": discount_total,
        "refundTotal": refund_total,
        "topItems": top,
        "peakHour": peak_hour,
        "hours": hours,
    }


def default_site_settings() -> dict:
    return {
        "restaurantNameFa": "کافه",
        "restaurantNameEn": "Cafe",
        "tagline": "قهوه تخصصی، طعمی متفاوت از غذا",
        "address": "",
        "phone": "",
        "logo": "",
        "backgroundImage": "",
        "primary": "#D8DAD3",
        "secondary": "#566347",
        "creditName": "Mohamad Shojaei",
        "telegram": "https://t.me/mo1hamad",
        "email": "mohamad.shojaie.bg@gmail.com",
        "showNewSection": True,
        "showFooterCredit": True,
        "showContactOnMenu": False,
        "showLogoOnMenu": True,
        "showLogoOnReceipt": False,
        "showContactOnReceipt": True,
        "receiptFooterMessage": "به امید دیدار مجدد",
        "showBackgroundOnMenu": True,
        "menuStructure": "classic",
        "updatedAt": 0,
    }


def normalize_hex_color(raw, fallback: str) -> str:
    v = str(raw or "").strip()
    if not re.fullmatch(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$", v):
        return fallback
    if len(v) == 4:
        return f"#{v[1]}{v[1]}{v[2]}{v[2]}{v[3]}{v[3]}".upper()
    return v.upper()


def normalize_asset_path(raw) -> str:
    s = str(raw or "").strip()
    if not s or s.startswith("data:"):
        return ""
    if s.startswith(("http://", "https://", "/", "uploads/")):
        return s[:300]
    return ""


def delete_branding_images(kind: str) -> None:
    kind = re.sub(r"[^a-z0-9_-]", "", str(kind or "").lower())
    if not kind:
        return
    branding_dir = branding_uploads_dir()
    if not branding_dir.exists():
        return
    for path in branding_dir.glob(f"{kind}.*"):
        try:
            path.unlink()
        except OSError:
            pass
    for path in branding_dir.glob(f"{kind}-*"):
        try:
            path.unlink()
        except OSError:
            pass


def save_branding_image(kind: str, data_url: str) -> str:
    kind = re.sub(r"[^a-z0-9_-]", "", str(kind or "").lower())
    if kind not in ("logo", "background"):
        return ""
    data_url = str(data_url or "")
    marker = "base64,"
    pos = data_url.find(marker)
    if pos < 0:
        return ""
    meta = data_url[:pos].lower()
    try:
        import base64

        raw = base64.b64decode(data_url[pos + len(marker) :])
    except Exception:
        return ""
    min_size = 40
    max_size = 2_500_000
    if len(raw) < min_size or len(raw) > max_size:
        return ""
    ext = "jpg"
    if "png" in meta:
        ext = "png"
    elif "webp" in meta:
        ext = "webp"
    elif "svg" in meta:
        return ""
    delete_branding_images(kind)
    name = f"{kind}-{int(time.time() * 1000)}.{ext}"
    path = branding_uploads_dir() / name
    path.write_bytes(raw)
    return f"{uploads_web_prefix('branding')}{name}"


def safe_item_id(raw) -> str:
    s = re.sub(r"[^a-zA-Z0-9._-]", "", str(raw or ""))
    return s[:80]


def allowed_preset_icon(path) -> str:
    path = str(path or "").replace("\\", "/").strip()
    if not re.match(
        r"^assets/category/[a-z0-9._-]+\.(png|svg|webp|jpe?g)$",
        path,
        re.I,
    ):
        return ""
    return path


def delete_item_images(item_id: str) -> None:
    item_id = safe_item_id(item_id)
    if not item_id:
        return
    base = active_uploads_base()
    if not base.exists():
        return
    for path in list(base.glob(f"{item_id}.*")) + list(base.glob(f"{item_id}-*")):
        try:
            path.unlink()
        except OSError:
            pass
    items_dir = uploads_items_dir()
    if items_dir.is_dir():
        for path in list(items_dir.glob(f"{item_id}.*")) + list(
            items_dir.glob(f"{item_id}-*")
        ):
            try:
                path.unlink()
            except OSError:
                pass


def save_item_image(item_id: str, data_url: str) -> str:
    item_id = safe_item_id(item_id)
    if not item_id:
        return ""
    data_url = str(data_url or "")
    marker = "base64,"
    pos = data_url.find(marker)
    if pos < 0:
        return ""
    meta = data_url[:pos].lower()
    try:
        import base64

        raw = base64.b64decode(data_url[pos + len(marker) :])
    except Exception:
        return ""
    is_svg = "svg" in meta
    min_size = 20 if is_svg else 40
    max_size = 200_000 if is_svg else 2_500_000
    if len(raw) < min_size or len(raw) > max_size:
        return ""
    if is_svg:
        text = raw.decode("utf-8", errors="ignore")
        if re.search(r"<script", text, re.I) or re.search(
            r"on\w+\s*=", text, re.I
        ) or re.search(r"javascript:", text, re.I):
            return ""
    items_dir = uploads_items_dir()
    delete_item_images(item_id)
    ext = "jpg"
    if is_svg:
        ext = "svg"
    elif "png" in meta:
        ext = "png"
    elif "webp" in meta:
        ext = "webp"
    name = f"{item_id}-{int(time.time())}.{ext}"
    path = items_dir / name
    path.write_bytes(raw)
    return f"{uploads_web_prefix('items')}{name}"


def set_category_icon_value(overrides: dict, category_index: int, icon: str, clear: bool) -> bool:
    key = str(category_index)
    if category_index >= 1000:
        added = overrides.get("_addedCategories")
        if not isinstance(added, dict) or not isinstance(added.get(key), dict):
            return False
        if clear:
            added[key].pop("icon", None)
        else:
            added[key]["icon"] = icon
        return True
    if category_index < 0 or category_index > 40:
        return False
    cats = overrides.get("_categories")
    if not isinstance(cats, dict):
        cats = {}
        overrides["_categories"] = cats
    meta = cats.get(key)
    if not isinstance(meta, dict):
        meta = {}
        cats[key] = meta
    if clear:
        meta.pop("icon", None)
    else:
        meta["icon"] = icon
    return True


def set_category_station_value(overrides: dict, category_index: int, station: str) -> bool:
    station = str(station or "").strip().lower()
    if station not in ("bar", "kitchen"):
        return False
    key = str(category_index)
    if category_index >= 1000:
        added = overrides.get("_addedCategories")
        if not isinstance(added, dict) or not isinstance(added.get(key), dict):
            return False
        added[key]["station"] = station
        return True
    if category_index < 0 or category_index > 40:
        return False
    cats = overrides.get("_categories")
    if not isinstance(cats, dict):
        cats = {}
        overrides["_categories"] = cats
    meta = cats.get(key)
    if not isinstance(meta, dict):
        meta = {}
        cats[key] = meta
    meta["station"] = station
    return True


def ensure_menu_overrides(overrides: dict) -> dict:
    if not isinstance(overrides, dict):
        overrides = {}
    if not isinstance(overrides.get("_added"), dict):
        overrides["_added"] = {}
    if not isinstance(overrides.get("_addedCategories"), dict):
        overrides["_addedCategories"] = {}
    if not isinstance(overrides.get("_categories"), dict):
        overrides["_categories"] = {}
    if not isinstance(overrides.get("_categoryOrder"), list):
        overrides["_categoryOrder"] = []
    return overrides


def category_order_append(overrides: dict, category_index: int) -> None:
    order = overrides.setdefault("_categoryOrder", [])
    if category_index not in order:
        order.append(category_index)


def category_order_remove(overrides: dict, category_index: int) -> None:
    order = overrides.get("_categoryOrder")
    if not isinstance(order, list):
        return
    overrides["_categoryOrder"] = [
        int(existing)
        for existing in order
        if int(existing) != int(category_index)
    ]


def tenant_default_site_settings(name_fa: str = "کافه", name_en: str = "Cafe") -> dict:
    return {
        "restaurantNameFa": name_fa,
        "restaurantNameEn": name_en,
        "tagline": "",
        "address": "",
        "phone": "",
        "logo": "",
        "backgroundImage": "",
        "primary": "#566347",
        "secondary": "#D8DAD3",
        "creditName": "",
        "telegram": "",
        "email": "",
        "showNewSection": True,
        "showFooterCredit": True,
        "showContactOnMenu": False,
        "showLogoOnMenu": True,
        "showLogoOnReceipt": False,
        "showContactOnReceipt": True,
        "receiptFooterMessage": "",
        "showBackgroundOnMenu": True,
        "menuStructure": "classic",
        "updatedAt": 0,
    }


def settings_defaults_for_store() -> dict:
    if active_tenant():
        raw = read_json(SETTINGS, {})
        if isinstance(raw, dict):
            name_fa = str(raw.get("restaurantNameFa") or raw.get("restaurantNameEn") or "کافه").strip() or "کافه"
            name_en = str(raw.get("restaurantNameEn") or name_fa).strip() or name_fa
            return tenant_default_site_settings(name_fa, name_en)
        return tenant_default_site_settings()
    return default_site_settings()


def merge_site_settings(base: dict, incoming: dict) -> dict:
    defaults = settings_defaults_for_store()
    out = {**defaults, **(base if isinstance(base, dict) else {})}
    if not isinstance(incoming, dict):
        return out
    incoming = dict(incoming)
    for old, new in (
        ("primaryColor", "primary"),
        ("secondaryColor", "secondary"),
        ("logoUrl", "logo"),
        ("backgroundUrl", "backgroundImage"),
    ):
        if new not in incoming and old in incoming:
            incoming[new] = incoming.pop(old)
    if "restaurantNameFa" in incoming:
        out["restaurantNameFa"] = str(incoming["restaurantNameFa"] or "")[:80].strip()
    if "restaurantNameEn" in incoming:
        out["restaurantNameEn"] = str(incoming["restaurantNameEn"] or "")[:80].strip()
    if "tagline" in incoming:
        out["tagline"] = str(incoming["tagline"] or "")[:200].strip()
    if "address" in incoming:
        out["address"] = str(incoming["address"] or "")[:200].strip()
    if "phone" in incoming:
        out["phone"] = str(incoming["phone"] or "")[:40].strip()
    if "logo" in incoming:
        raw_logo = incoming.get("logo")
        if isinstance(raw_logo, str) and raw_logo.startswith("data:"):
            saved = save_branding_image("logo", raw_logo)
            if saved:
                out["logo"] = saved
        elif raw_logo in ("", None):
            delete_branding_images("logo")
            out["logo"] = ""
        else:
            out["logo"] = normalize_asset_path(raw_logo)
    if "backgroundImage" in incoming:
        raw_bg = incoming.get("backgroundImage")
        if isinstance(raw_bg, str) and raw_bg.startswith("data:"):
            saved = save_branding_image("background", raw_bg)
            if saved:
                out["backgroundImage"] = saved
        elif raw_bg in ("", None):
            delete_branding_images("background")
            out["backgroundImage"] = ""
        else:
            out["backgroundImage"] = normalize_asset_path(raw_bg)
    if "primary" in incoming:
        out["primary"] = normalize_hex_color(incoming["primary"], out["primary"])
    if "secondary" in incoming:
        out["secondary"] = normalize_hex_color(incoming["secondary"], out["secondary"])
    if "creditName" in incoming:
        out["creditName"] = str(incoming["creditName"] or "")[:120].strip()
    if "telegram" in incoming:
        out["telegram"] = str(incoming["telegram"] or "")[:200].strip()
    if "email" in incoming:
        out["email"] = str(incoming["email"] or "")[:120].strip()
    if "showNewSection" in incoming:
        out["showNewSection"] = bool(incoming["showNewSection"])
    if "showFooterCredit" in incoming:
        out["showFooterCredit"] = bool(incoming["showFooterCredit"])
    if "showContactOnMenu" in incoming:
        out["showContactOnMenu"] = bool(incoming["showContactOnMenu"])
    if "showLogoOnMenu" in incoming:
        out["showLogoOnMenu"] = bool(incoming["showLogoOnMenu"])
    if "showLogoOnReceipt" in incoming:
        out["showLogoOnReceipt"] = bool(incoming["showLogoOnReceipt"])
    if "showContactOnReceipt" in incoming:
        out["showContactOnReceipt"] = bool(incoming["showContactOnReceipt"])
    if "receiptFooterMessage" in incoming:
        out["receiptFooterMessage"] = str(incoming["receiptFooterMessage"] or "")[:120].strip()
    if "showBackgroundOnMenu" in incoming:
        out["showBackgroundOnMenu"] = bool(incoming["showBackgroundOnMenu"])
    if "menuStructure" in incoming:
        structure = str(incoming.get("menuStructure") or "").strip()
        if structure in ("classic", "cards", "compact", "magazine", "personal"):
            out["menuStructure"] = structure
    if "updatedAt" in incoming:
        try:
            out["updatedAt"] = int(incoming["updatedAt"])
        except (TypeError, ValueError):
            pass
    for key, fallback in (
        ("restaurantNameFa", defaults["restaurantNameFa"]),
        ("restaurantNameEn", defaults["restaurantNameEn"]),
        ("tagline", defaults["tagline"]),
        ("creditName", defaults["creditName"]),
        ("receiptFooterMessage", defaults["receiptFooterMessage"]),
    ):
        if not out.get(key):
            out[key] = fallback
    return out


def read_site_settings() -> dict:
    raw = read_json(SETTINGS, {})
    base = settings_defaults_for_store()
    return merge_site_settings(base, raw if isinstance(raw, dict) else {})


def compute_settings_summary(orders, invoices, layout: dict) -> dict:
    customers_map: dict[str, dict] = {}
    if isinstance(invoices, list):
        for inv in invoices:
            if not isinstance(inv, dict):
                continue
            name = str(inv.get("customerName") or "").strip()
            if not name:
                continue
            entry = customers_map.setdefault(
                name, {"name": name, "invoices": 0, "phone": ""}
            )
            entry["invoices"] += 1
            phone = str(inv.get("customerPhone") or "").strip()
            if phone:
                entry["phone"] = phone
    customers = sorted(
        customers_map.values(), key=lambda x: x["invoices"], reverse=True
    )[:8]
    table_count = 0
    for region in (layout or {}).get("regions") or []:
        table_count += len(region.get("tables") or [])
    return {
        "orderCount": len(orders) if isinstance(orders, list) else 0,
        "invoiceCount": len(invoices) if isinstance(invoices, list) else 0,
        "tableCount": table_count,
        "customerCount": len(customers_map),
        "customers": customers,
    }


def read_customers() -> list:
    raw = read_json(CUSTOMERS, [])
    return raw if isinstance(raw, list) else []


def write_customers(customers: list) -> None:
    write_json(CUSTOMERS, customers if isinstance(customers, list) else [])


def new_customer_id() -> str:
    return f"cust_{secrets.token_hex(8)}"


def normalize_birthday(raw) -> str:
    s = str(raw or "").strip()
    if not s:
        return ""
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if not m:
        return ""
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        import datetime as _dt

        _dt.date(y, mo, d)
        return f"{y:04d}-{mo:02d}-{d:02d}"
    except ValueError:
        return ""


def normalize_customer(raw: dict, fallback_id: str = "") -> dict:
    if not isinstance(raw, dict):
        raw = {}
    cid = str(raw.get("id") or fallback_id or new_customer_id()).strip()
    now = int(time.time() * 1000)
    created = raw.get("createdAt")
    try:
        created_at = int(created) if created else now
    except (TypeError, ValueError):
        created_at = now
    tier = str(raw.get("tier") or "standard").strip()
    if tier not in ("standard", "silver", "gold", "vip"):
        tier = "standard"
    tags = []
    seen = set()
    raw_tags = raw.get("tags") if isinstance(raw.get("tags"), list) else []
    for item in raw_tags:
        tag = str(item or "").strip()[:24]
        if not tag:
            continue
        key = tag.casefold()
        if key in seen:
            continue
        seen.add(key)
        tags.append(tag)
        if len(tags) >= 8:
            break
    last_contact = raw.get("lastContactAt")
    if last_contact in ("", None):
        last_contact_at = None
    else:
        try:
            last_contact_at = int(last_contact)
            if last_contact_at <= 0:
                last_contact_at = None
        except (TypeError, ValueError):
            last_contact_at = None
    deleted = raw.get("deletedAt")
    if deleted in ("", None):
        deleted_at = None
    else:
        try:
            deleted_at = int(deleted)
            if deleted_at <= 0:
                deleted_at = None
        except (TypeError, ValueError):
            deleted_at = None
    out = {
        "id": cid,
        "name": str(raw.get("name") or "")[:80].strip(),
        "phone": str(raw.get("phone") or "")[:20].strip(),
        "birthday": normalize_birthday(raw.get("birthday")),
        "notes": str(raw.get("notes") or "")[:300].strip(),
        "tier": tier,
        "tags": tags,
        "lastContactAt": last_contact_at,
        "createdAt": created_at,
        "updatedAt": now,
    }
    if deleted_at:
        out["deletedAt"] = deleted_at
    return out


def find_customer_index(customers: list, cid: str) -> int:
    cid = str(cid or "").strip()
    if not cid:
        return -1
    for i, row in enumerate(customers):
        if isinstance(row, dict) and str(row.get("id") or "") == cid:
            return i
    return -1


def sort_customers(customers: list) -> list:
    rows = [c for c in customers if isinstance(c, dict)]
    return sorted(rows, key=lambda c: str(c.get("name") or "").casefold())


def visible_customers(customers: list) -> list:
    rows = []
    for row in customers:
        if not isinstance(row, dict):
            continue
        if row.get("deletedAt"):
            continue
        rows.append(row)
    return sort_customers(rows)


def resolve_customer_link(
    body: dict, fallback: dict | None = None, *, clear: bool = False
) -> tuple[str, str, str]:
    """Resolve customerId + snapshot name/phone. clear=True removes the link."""
    src = body if isinstance(body, dict) else {}
    prev = fallback if isinstance(fallback, dict) else {}
    if clear or ("customerId" in src and not src.get("customerId")):
        return "", "", ""
    cid = str(src.get("customerId") or prev.get("customerId") or "").strip()
    name = str(src.get("customerName") or prev.get("customerName") or "")[:80].strip()
    phone = str(src.get("customerPhone") or prev.get("customerPhone") or "")[:20].strip()
    if cid:
        customers = read_customers()
        idx = find_customer_index(customers, cid)
        if idx < 0:
            cid = ""
        else:
            row = customers[idx] if isinstance(customers[idx], dict) else {}
            if row.get("deletedAt"):
                # Keep snapshot name/phone on historical records; drop live id link only
                # when attaching fresh — for resolve we still allow id if not deleted.
                pass
            if not row.get("deletedAt"):
                if not name:
                    name = str(row.get("name") or "")[:80].strip()
                if not phone:
                    phone = str(row.get("phone") or "")[:20].strip()
            else:
                cid = ""
                if not name:
                    name = str(row.get("name") or prev.get("customerName") or "")[
                        :80
                    ].strip()
                if not phone:
                    phone = str(row.get("phone") or prev.get("customerPhone") or "")[
                        :20
                    ].strip()
    return cid, name, phone


def apply_customer_link(record: dict, cid: str, name: str, phone: str) -> None:
    if cid:
        record["customerId"] = cid
    else:
        record.pop("customerId", None)
    record["customerName"] = name
    record["customerPhone"] = phone


def normalize_coupon_code(raw) -> str:
    return re.sub(r"\s+", "", str(raw or "").strip().lower())[:32]


def read_coupons() -> list:
    raw = read_json(COUPONS, [])
    return raw if isinstance(raw, list) else []


def write_coupons(coupons: list) -> None:
    write_json(COUPONS, coupons if isinstance(coupons, list) else [])


def new_coupon_id() -> str:
    return f"cpn_{secrets.token_hex(8)}"


def normalize_coupon(raw: dict, fallback_id: str = "") -> dict:
    if not isinstance(raw, dict):
        raw = {}
    cid = str(raw.get("id") or fallback_id or new_coupon_id()).strip()
    now = int(time.time() * 1000)
    created = raw.get("createdAt")
    try:
        created_at = int(created) if created else now
    except (TypeError, ValueError):
        created_at = now
    discount_type = str(raw.get("discountType") or "percent")
    if discount_type not in ("percent", "fixed"):
        discount_type = "percent"
    try:
        discount_value = max(0.0, float(raw.get("discountValue") or 0))
    except (TypeError, ValueError):
        discount_value = 0.0
    if discount_type == "percent" and discount_value > 100:
        discount_value = 100.0
    expires_at = raw.get("expiresAt")
    if expires_at in ("", None):
        expires = None
    else:
        try:
            expires = int(expires_at)
            if expires <= 0:
                expires = None
        except (TypeError, ValueError):
            expires = None
    usage_limit = raw.get("usageLimit")
    if usage_limit in ("", None):
        limit = None
    else:
        try:
            limit = int(usage_limit)
            if limit <= 0:
                limit = None
        except (TypeError, ValueError):
            limit = None
    try:
        used_count = max(0, int(raw.get("usedCount") or 0))
    except (TypeError, ValueError):
        used_count = 0
    return {
        "id": cid,
        "code": normalize_coupon_code(raw.get("code")),
        "label": str(raw.get("label") or "")[:120].strip(),
        "discountType": discount_type,
        "discountValue": discount_value,
        "active": bool(raw.get("active", True)),
        "expiresAt": expires,
        "usageLimit": limit,
        "usedCount": used_count,
        "createdAt": created_at,
        "updatedAt": now,
    }


def find_coupon_index(coupons: list, cid: str) -> int:
    cid = str(cid or "").strip()
    if not cid:
        return -1
    for i, row in enumerate(coupons):
        if isinstance(row, dict) and str(row.get("id") or "") == cid:
            return i
    return -1


HARDWARE_TYPES = {
    "waiter_pager",
    "kitchen_printer",
    "bar_printer",
    "receipt_printer",
    "kds",
    "other",
}
HARDWARE_STATIONS = {"waiter", "kitchen", "bar", "cashier", "general"}
HARDWARE_CONNECTIONS = {"network", "usb", "bluetooth", "serial", "cloud"}


def default_station_for_type(device_type: str) -> str:
    return {
        "waiter_pager": "waiter",
        "kitchen_printer": "kitchen",
        "kds": "kitchen",
        "bar_printer": "bar",
        "receipt_printer": "cashier",
    }.get(device_type, "general")


def read_hardware() -> list:
    raw = read_json(HARDWARE, [])
    return raw if isinstance(raw, list) else []


def write_hardware(devices: list) -> None:
    write_json(HARDWARE, devices if isinstance(devices, list) else [])


def new_hardware_id() -> str:
    return f"hw_{secrets.token_hex(8)}"


def normalize_hardware(raw: dict, fallback_id: str = "") -> dict:
    if not isinstance(raw, dict):
        raw = {}
    now = int(time.time() * 1000)
    device_type = str(raw.get("type") or "other").strip()
    if device_type not in HARDWARE_TYPES:
        device_type = "other"
    station = str(raw.get("station") or "").strip()
    if station not in HARDWARE_STATIONS:
        station = default_station_for_type(device_type)
    connection = str(raw.get("connection") or "network").strip()
    if connection not in HARDWARE_CONNECTIONS:
        connection = "network"
    paper = str(raw.get("paperWidth") or "").strip()
    if paper not in ("58", "80"):
        paper = "80" if device_type in (
            "kitchen_printer",
            "bar_printer",
            "receipt_printer",
        ) else ""
    try:
        copies = int(raw.get("copies") or 1)
    except (TypeError, ValueError):
        copies = 1
    copies = max(1, min(9, copies))
    try:
        created_at = int(raw.get("createdAt") or now)
    except (TypeError, ValueError):
        created_at = now
    name = str(raw.get("name") or "").strip()[:80] or "دستگاه بدون نام"
    code_page = str(raw.get("codePage") or "utf8").strip()[:24] or "utf8"
    return {
        "id": str(raw.get("id") or fallback_id or new_hardware_id()).strip(),
        "name": name,
        "type": device_type,
        "station": station,
        "connection": connection,
        "address": str(raw.get("address") or "").strip()[:120],
        "port": str(raw.get("port") or "").strip()[:20],
        "paperWidth": paper,
        "copies": copies,
        "enabled": bool(raw.get("enabled", True)),
        "notes": str(raw.get("notes") or "").strip()[:240],
        "isDefault": bool(raw.get("isDefault", False)),
        "codePage": code_page,
        "manufacturer": str(raw.get("manufacturer") or "").strip()[:80],
        "model": str(raw.get("model") or "").strip()[:80],
        "vendorId": str(raw.get("vendorId") or "").strip()[:16],
        "productId": str(raw.get("productId") or "").strip()[:16],
        "cupsQueue": str(raw.get("cupsQueue") or "").strip()[:80],
        "createdAt": created_at,
        "updatedAt": now,
    }


def find_hardware_index(devices: list, cid: str) -> int:
    cid = str(cid or "").strip()
    if not cid:
        return -1
    for i, row in enumerate(devices):
        if isinstance(row, dict) and str(row.get("id") or "") == cid:
            return i
    return -1


def sort_hardware(devices: list) -> list:
    if not isinstance(devices, list):
        return []
    order = {
        "waiter_pager": 0,
        "kitchen_printer": 1,
        "bar_printer": 2,
        "receipt_printer": 3,
        "kds": 4,
        "other": 5,
    }

    def key(row):
        if not isinstance(row, dict):
            return (9, "", 0)
        return (
            order.get(str(row.get("type") or ""), 9),
            str(row.get("name") or ""),
            -int(row.get("updatedAt") or 0),
        )

    return sorted([r for r in devices if isinstance(r, dict)], key=key)


def read_payment_terminals() -> list:
    raw = read_json(PAYMENT_TERMINALS, [])
    return raw if isinstance(raw, list) else []


def write_payment_terminals(rows: list) -> None:
    write_json(PAYMENT_TERMINALS, rows if isinstance(rows, list) else [])


def read_payments() -> list:
    raw = read_json(PAYMENTS, [])
    return raw if isinstance(raw, list) else []


def write_payments(rows: list) -> None:
    write_json(PAYMENTS, rows if isinstance(rows, list) else [])


def read_payment_attempts() -> list:
    raw = read_json(PAYMENT_ATTEMPTS, [])
    return raw if isinstance(raw, list) else []


def write_payment_attempts(rows: list) -> None:
    write_json(PAYMENT_ATTEMPTS, rows if isinstance(rows, list) else [])


def append_payment_attempt(payment_id: str, status: str, req_meta: dict, res_meta: dict) -> dict:
    attempts = read_payment_attempts()
    attempt = normalize_attempt(
        {
            "id": new_attempt_id(),
            "paymentId": payment_id,
            "attemptNumber": next_attempt_number(attempts, payment_id),
            "status": status,
            "requestMetadata": req_meta or {},
            "responseMetadata": res_meta or {},
            "startedAt": int(time.time() * 1000),
            "completedAt": int(time.time() * 1000),
        }
    )
    attempts.append(attempt)
    write_payment_attempts(attempts)
    return attempt


def find_coupon_by_code(coupons: list, code: str):
    key = normalize_coupon_code(code)
    if not key:
        return None
    for row in coupons:
        if isinstance(row, dict) and normalize_coupon_code(row.get("code")) == key:
            return row
    return None


def sort_coupons(coupons: list) -> list:
    rows = [c for c in coupons if isinstance(c, dict)]
    return sorted(rows, key=lambda c: str(c.get("code") or "").casefold())


def validate_coupon_record(coupons: list, code: str) -> dict:
    row = find_coupon_by_code(coupons, code)
    if not row:
        return {"valid": False, "error": "invalid_code"}
    if not row.get("active", True):
        return {"valid": False, "error": "inactive"}
    expires = row.get("expiresAt")
    if expires:
        try:
            if int(time.time() * 1000) > int(expires):
                return {"valid": False, "error": "expired"}
        except (TypeError, ValueError):
            pass
    usage_limit = row.get("usageLimit")
    if usage_limit not in ("", None):
        try:
            limit = int(usage_limit)
            used = max(0, int(row.get("usedCount") or 0))
            if limit > 0 and used >= limit:
                return {"valid": False, "error": "usage_limit"}
        except (TypeError, ValueError):
            pass
    try:
        value = float(row.get("discountValue") or 0)
    except (TypeError, ValueError):
        value = 0
    dtype = str(row.get("discountType") or "")
    if value <= 0:
        return {"valid": False, "error": "invalid_value"}
    if dtype == "percent" and value > 100:
        return {"valid": False, "error": "invalid_value"}
    return {"valid": True, "coupon": row}


def redeem_coupon(coupons: list, code: str) -> tuple[list, bool]:
    key = normalize_coupon_code(code)
    if not key:
        return coupons, False
    idx = -1
    for i, row in enumerate(coupons):
        if isinstance(row, dict) and normalize_coupon_code(row.get("code")) == key:
            idx = i
            break
    if idx < 0:
        return coupons, False
    cur = coupons[idx] if isinstance(coupons[idx], dict) else {}
    used = max(0, int(cur.get("usedCount") or 0)) + 1
    limit = cur.get("usageLimit")
    active = bool(cur.get("active", True))
    try:
        if limit not in ("", None) and int(limit) > 0 and used >= int(limit):
            active = False
    except (TypeError, ValueError):
        pass
    record = normalize_coupon(
        {
            **cur,
            "id": cur.get("id"),
            "usedCount": used,
            "active": active,
            "createdAt": cur.get("createdAt"),
        },
        str(cur.get("id") or ""),
    )
    coupons[idx] = record
    return coupons, True


def orders_payload(include_invoices: bool):
    payload = tables_payload()
    payload["orders"] = read_json(ORDERS, [])
    payload["reservations"] = read_reservations()
    payload["since"] = live_stamp()
    if include_invoices:
        payload["invoices"] = read_json(INVOICES, [])
    return payload


def invoice_discount(subtotal: int, dtype: str, value) -> tuple[str, float, int]:
    subtotal = int(subtotal)
    try:
        value = max(0.0, float(value))
    except (TypeError, ValueError):
        value = 0.0
    amount = 0
    if dtype == "percent":
        if value > 100:
            value = 100.0
        amount = int(round(subtotal * value / 100))
    elif dtype == "fixed":
        amount = int(round(value))
        if amount > subtotal:
            amount = subtotal
    else:
        dtype = ""
        value = 0.0
        amount = 0
    return dtype, value, amount


def sanitize_payments(raw) -> list[dict]:
    allowed = {"cash", "card", "online"}
    out: list[dict] = []
    if not isinstance(raw, list):
        return out
    for row in raw:
        if not isinstance(row, dict):
            continue
        method = str(row.get("method") or "")
        if method not in allowed:
            continue
        try:
            amount = int(round(float(row.get("amount") or 0)))
        except (TypeError, ValueError):
            amount = 0
        if amount <= 0:
            continue
        entry: dict = {"method": method, "amount": amount}
        for key in (
            "paymentId",
            "referenceNumber",
            "terminalId",
            "providerTransactionId",
        ):
            val = str(row.get(key) or "").strip()
            if val:
                entry[key] = val[:80]
        out.append(entry)
    return out


def payments_total(payments: list[dict]) -> int:
    return sum(int(p.get("amount") or 0) for p in payments)


def payments_label(payments: list[dict]) -> str:
    methods = {str(p.get("method") or "") for p in payments if p.get("method")}
    if not methods:
        return ""
    if len(methods) > 1:
        return "mixed"
    return next(iter(methods))


def invoice_paid_amount(inv: dict) -> int:
    payments = inv.get("payments") if isinstance(inv.get("payments"), list) else []
    return payments_total(payments)


def invoice_refunded_amount(inv: dict) -> int:
    return _invoice_refunded(inv)


def refresh_invoice_status(inv: dict) -> None:
    st = str(inv.get("status") or "unpaid")
    if st == "cancelled":
        return
    paid = invoice_paid_amount(inv)
    refunded = invoice_refunded_amount(inv)
    total = int(inv.get("total") or 0)
    if refunded > 0 and refunded >= paid and paid > 0:
        inv["status"] = "refunded"
    elif refunded > 0:
        inv["status"] = "partially_refunded"
    elif paid >= total and total > 0:
        inv["status"] = "paid"
    elif paid > 0:
        inv["status"] = "paid"
    else:
        inv["status"] = "unpaid"
    payments = inv.get("payments") if isinstance(inv.get("payments"), list) else []
    inv["payMethod"] = payments_label(payments)


def append_invoice_history(inv: dict, action: str, note: str = "") -> None:
    history = inv.get("history")
    if not isinstance(history, list):
        history = []
    entry = {"at": int(time.time() * 1000), "action": action}
    if note:
        entry["note"] = note[:200]
    history.append(entry)
    inv["history"] = history[-80:]


def get_token(headers, body) -> str:
    t = headers.get("X-Cashier-Token") or headers.get("x-cashier-token") or ""
    if not t and isinstance(body, dict):
        t = str(body.get("token") or "")
    return t.strip()


def session_ok(token: str):
    if not token:
        return None
    sessions = read_json(SESSIONS, {})
    rec = sessions.get(token)
    if not isinstance(rec, dict):
        return None
    return rec


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print(f"[api] {self.command} {self.path} -> {fmt % args}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS"
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Cashier-Token, Authorization, X-Miiziito-Sandbox, X-Lumier-Sandbox, X-Miiziito-Tenant, X-Lumier-Tenant, X-Super-Admin-Token",
        )
        self.send_header("Cache-Control", "no-store")

    def _json(self, status: int, payload):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def do_PATCH(self):
        self._handle("PATCH")

    def do_DELETE(self):
        self._handle("DELETE")

    def _file(self, path: Path, content_type: str):
        data = path.read_bytes()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()
        self.wfile.write(data)

    def _serve_upload(self, url_path: str) -> bool:
        if not url_path.startswith("/uploads/"):
            return False
        rel = url_path[len("/uploads/") :]
        if ".." in rel or rel.startswith("/"):
            self._json(400, {"error": "bad_path"})
            return True
        file_path = (UPLOADS / rel).resolve()
        try:
            file_path.relative_to(UPLOADS.resolve())
        except ValueError:
            self._json(403, {"error": "forbidden"})
            return True
        if not file_path.is_file():
            self._json(404, {"error": "not_found"})
            return True
        ext = file_path.suffix.lower()
        ctype = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".svg": "image/svg+xml",
            ".gif": "image/gif",
        }.get(ext, "application/octet-stream")
        self._file(file_path, ctype)
        return True

    def _handle(self, method: str):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        route = (qs.get("route") or [""])[0]
        item_id = (qs.get("id") or [""])[0]
        body = self._read_body() if method in ("POST", "PATCH", "DELETE") else {}
        if not body.get("token") and qs.get("token"):
            body = {**body, "token": qs["token"][0]}

        path = parsed.path.rstrip("/") or "/"
        if method == "GET" and self._serve_upload(parsed.path):
            return
        if path.endswith("/api/index.php") or path.endswith("/api") or "/api/" in path:
            pass
        else:
            return self._json(404, {"error": "not_found"})

        with _lock:
            ensure_files()
        try:
            self._dispatch(method, route, item_id, body, qs)
        except StorageError as exc:
            self._json(500, {"error": "database_unavailable", "detail": str(exc)})
        except Exception as exc:
            self._json(500, {"error": "server", "detail": str(exc)})
        finally:
            clear_request_sandbox()
            clear_request_tenant()

    def _dispatch(self, method, route, item_id, body, qs):
        token = get_token(dict(self.headers), body)

        clear_request_sandbox()
        sandbox_id = ""
        tenant_slug = ""

        if request_tenant_slug and find_cafe_by_slug and is_cafe_live:
            tenant_slug = request_tenant_slug(dict(self.headers), body, qs)
        if tenant_slug:
            cafe = find_cafe_by_slug(tenant_slug)
            if not cafe or not is_cafe_live(cafe):
                if route != "health":
                    return self._json(
                        404,
                        {"error": "tenant_not_found", "slug": tenant_slug},
                    )
            else:
                if provision_tenant:
                    provision_tenant(cafe)
                set_request_tenant(str(cafe.get("id") or ""))

        session = session_ok(token)
        is_dev = isinstance(session, dict) and session.get("role") == "dev"

        if not tenant_slug:
            if is_dev:
                sandbox_id = sanitize_sandbox_id(session.get("sandbox") or "dev") or "dev"
            elif not session:
                # Allow unauthenticated sandbox hint (matches PHP request_sandbox_id).
                hdr = (
                    self.headers.get("X-Miiziito-Sandbox")
                    or self.headers.get("x-miiziito-sandbox")
                    or self.headers.get("X-Lumier-Sandbox")
                    or self.headers.get("x-lumier-sandbox")
                )
                if hdr:
                    sandbox_id = sanitize_sandbox_id(hdr)
                elif isinstance(body, dict) and body.get("sandbox"):
                    sandbox_id = sanitize_sandbox_id(body.get("sandbox"))
                elif qs.get("sandbox"):
                    raw = qs.get("sandbox")
                    sandbox_id = sanitize_sandbox_id(
                        raw[0] if isinstance(raw, list) else raw
                    )
        if sandbox_id:
            set_request_sandbox(sandbox_id)

        if _super_admin_mod and str(route or "").startswith("sa-"):
            result = _sa_handle(method, route, item_id, body, qs, dict(self.headers))
            if result:
                return self._json(int(result.get("status") or 500), result.get("body") or {})

        if route == "health":
            payload = {"ok": True}
            payload.update(storage_health())
            if payload.get("database") == "error":
                payload["ok"] = False
            return self._json(200, payload)

        if route == "login" and method == "POST":
            secrets_map = parse_secrets()
            entered = str(body.get("password") or "")
            role = ""
            sandbox = ""
            tenant_id = active_tenant()
            if tenant_id and verify_tenant_cashier_password:
                tenant_verify = verify_tenant_cashier_password(tenant_id, entered)
                if tenant_verify is True:
                    role = "cashier"
            if not role:
                if secret_matches(secrets_map.get("CASHIER_PASSWORD", ""), entered):
                    role = "cashier"
                elif secret_matches(secrets_map.get("DEV_PASSWORD", ""), entered):
                    role, sandbox = "dev", "dev"
                elif secret_matches(secrets_map.get("DEV_PASSWORD_2", ""), entered):
                    role, sandbox = "dev", "dev2"
            if not role:
                return self._json(401, {"error": "bad_password"})
            new_token = secrets.token_hex(24)
            sessions = read_json(SESSIONS, {})
            if not isinstance(sessions, dict):
                sessions = {}
            sessions[new_token] = {
                "created": int(time.time()),
                "role": role,
                "sandbox": sandbox,
            }
            write_json(SESSIONS, sessions)
            return self._json(
                200,
                {
                    "token": new_token,
                    "role": role,
                    "sandbox": sandbox,
                    "dev": role == "dev",
                },
            )

        if route == "logout" and method == "POST":
            sessions = read_json(SESSIONS, {})
            if isinstance(sessions, dict) and token in sessions:
                del sessions[token]
                write_json(SESSIONS, sessions)
            return self._json(200, {"ok": True})

        if route == "menu" and method == "GET":
            return self._json(200, {"overrides": read_json(MENU, {})})

        if route == "menu" and method == "POST":
            if not session:
                return self._json(401, {"error": "auth_required"})
            overrides = ensure_menu_overrides(read_json(MENU, {}))
            action = str(body.get("action") or "update")
            item_key = str(body.get("id") or "")

            if action == "addCategory":
                name = str(body.get("name") or "").strip()[:80]
                if not name:
                    return self._json(400, {"error": "name_required"})
                added_cats = overrides["_addedCategories"]
                if len(added_cats) >= 40:
                    return self._json(400, {"error": "too_many"})
                next_ci = 1000
                for key in added_cats:
                    try:
                        n = int(key)
                        if n >= next_ci:
                            next_ci = n + 1
                    except (TypeError, ValueError):
                        pass
                icon = ""
                if body.get("image"):
                    saved = save_item_image(f"caticon-{next_ci}", body.get("image"))
                    if not saved:
                        return self._json(400, {"error": "image_invalid"})
                    icon = saved
                elif body.get("icon"):
                    icon = allowed_preset_icon(body.get("icon"))
                if not icon:
                    icon = allowed_preset_icon("assets/category/coffee.png")
                if not icon:
                    return self._json(400, {"error": "icon_required"})
                added_cats[str(next_ci)] = {
                    "name": name,
                    "hidden": False,
                    "icon": icon,
                }
                category_order_append(overrides, next_ci)
                write_json(MENU, overrides)
                return self._json(
                    200, {"overrides": overrides, "categoryIndex": next_ci}
                )

            if action == "add":
                try:
                    category_index = int(body.get("categoryIndex"))
                except (TypeError, ValueError):
                    category_index = -1
                if category_index < 0 or category_index > 2000:
                    return self._json(400, {"error": "category_required"})
                if category_index >= 1000 and str(category_index) not in overrides[
                    "_addedCategories"
                ]:
                    return self._json(400, {"error": "category_unknown"})
                name = str(body.get("name") or "").strip()[:120]
                if not name:
                    return self._json(400, {"error": "name_required"})
                added = overrides["_added"]
                if len(added) >= 120:
                    return self._json(400, {"error": "too_many"})
                try:
                    price = float(body.get("price") or 0)
                except (TypeError, ValueError):
                    price = 0.0
                if price < 0:
                    price = 0.0
                item_id = f"cat-{category_index}-custom-{secrets.token_hex(5)}"
                now = int(time.time() * 1000)
                added[item_id] = {
                    "categoryIndex": category_index,
                    "name": name,
                    "description": str(body.get("description") or "").strip()[:400],
                    "price": price,
                    "soldOut": False,
                    "toppings": [],
                    "isNew": True,
                    "createdAt": now,
                    "newAt": now,
                }
                overrides["_added"] = added
                write_json(MENU, overrides)
                return self._json(200, {"overrides": overrides, "id": item_id})

            if action == "reorderCategories":
                raw_order = body.get("order") or []
                clean = []
                seen = set()
                if isinstance(raw_order, list):
                    for ci in raw_order:
                        try:
                            n = int(ci)
                        except (TypeError, ValueError):
                            continue
                        if n in seen:
                            continue
                        if n < 0 or n > 2000:
                            continue
                        seen.add(n)
                        clean.append(n)
                        if len(clean) >= 80:
                            break
                overrides["_categoryOrder"] = clean
                write_json(MENU, overrides)
                return self._json(200, {"ok": True, "overrides": overrides})

            if action == "deleteCategory":
                try:
                    category_index = int(body.get("categoryIndex"))
                except (TypeError, ValueError):
                    category_index = -1
                key = str(category_index)
                if category_index >= 1000:
                    added_cats = overrides.get("_addedCategories")
                    if not isinstance(added_cats, dict) or key not in added_cats:
                        return self._json(400, {"error": "category_unknown"})
                    del added_cats[key]
                    overrides["_addedCategories"] = added_cats
                    category_order_remove(overrides, category_index)
                    delete_item_images(f"caticon-{category_index}")
                    added = overrides.get("_added")
                    if isinstance(added, dict):
                        for item_id, item in list(added.items()):
                            if not isinstance(item, dict):
                                continue
                            try:
                                item_ci = int(item.get("categoryIndex"))
                            except (TypeError, ValueError):
                                item_ci = -1
                            if item_ci != category_index:
                                continue
                            delete_item_images(item_id)
                            del added[item_id]
                        overrides["_added"] = added
                else:
                    if category_index < 0 or category_index > 40:
                        return self._json(400, {"error": "category_required"})
                    cats = overrides.setdefault("_categories", {})
                    if not isinstance(cats.get(key), dict):
                        cats[key] = {}
                    cats[key]["deleted"] = True
                    cats[key]["hidden"] = True
                    overrides["_categories"] = cats
                    category_order_remove(overrides, category_index)
                write_json(MENU, overrides)
                return self._json(200, {"ok": True, "overrides": overrides})

            if action == "setCategoryStation":
                try:
                    category_index = int(body.get("categoryIndex"))
                except (TypeError, ValueError):
                    category_index = -1
                station = str(body.get("station") or "").strip().lower()
                if station not in ("bar", "kitchen"):
                    return self._json(400, {"error": "station_invalid"})
                if category_index >= 1000:
                    added = overrides.get("_addedCategories")
                    if not isinstance(added, dict) or str(category_index) not in added:
                        return self._json(400, {"error": "category_unknown"})
                elif category_index < 0 or category_index > 40:
                    return self._json(400, {"error": "category_required"})
                if not set_category_station_value(overrides, category_index, station):
                    return self._json(400, {"error": "category_unknown"})
                write_json(MENU, overrides)
                return self._json(200, {"ok": True, "overrides": overrides})

            if action == "setCategoryIcon":
                try:
                    category_index = int(body.get("categoryIndex"))
                except (TypeError, ValueError):
                    category_index = -1
                icon_id = f"caticon-{category_index}"
                if category_index >= 1000:
                    added = overrides.get("_addedCategories")
                    if not isinstance(added, dict) or str(category_index) not in added:
                        return self._json(400, {"error": "category_unknown"})
                elif category_index < 0 or category_index > 40:
                    return self._json(400, {"error": "category_required"})
                if body.get("clearIcon"):
                    delete_item_images(icon_id)
                    if not set_category_icon_value(overrides, category_index, "", True):
                        return self._json(400, {"error": "category_unknown"})
                elif body.get("icon"):
                    preset = allowed_preset_icon(body.get("icon"))
                    if not preset:
                        return self._json(400, {"error": "icon_invalid"})
                    delete_item_images(icon_id)
                    if not set_category_icon_value(
                        overrides, category_index, preset, False
                    ):
                        return self._json(400, {"error": "category_unknown"})
                elif body.get("image"):
                    saved = save_item_image(icon_id, body.get("image"))
                    if not saved:
                        return self._json(400, {"error": "image_invalid"})
                    if not set_category_icon_value(
                        overrides, category_index, saved, False
                    ):
                        return self._json(400, {"error": "category_unknown"})
                else:
                    return self._json(400, {"error": "icon_required"})
                write_json(MENU, overrides)
                return self._json(200, {"ok": True, "overrides": overrides})

            if action == "update" and item_key:
                added = overrides.get("_added")
                in_added = (
                    isinstance(added, dict)
                    and isinstance(added.get(item_key), dict)
                )
                cur = (
                    dict(added[item_key])
                    if in_added
                    else (
                        overrides.get(item_key)
                        if isinstance(overrides.get(item_key), dict)
                        else {}
                    )
                )
                for field in (
                    "price",
                    "soldOut",
                    "name",
                    "description",
                    "isNew",
                ):
                    if field in body:
                        cur[field] = body[field]
                if body.get("isNew") is True:
                    cur["newAt"] = int(time.time() * 1000)
                if body.get("clearImage"):
                    delete_item_images(item_key)
                    cur.pop("image", None)
                    cur.pop("photo", None)
                if body.get("image"):
                    image_val = body.get("image")
                    if isinstance(image_val, str) and image_val.startswith(
                        "data:"
                    ):
                        saved = save_item_image(item_key, image_val)
                        if not saved:
                            return self._json(400, {"error": "image_invalid"})
                        cur["image"] = saved
                    elif isinstance(image_val, str) and image_val.strip():
                        cur["image"] = image_val.strip()[:500]
                    else:
                        return self._json(400, {"error": "image_invalid"})
                if in_added:
                    added[item_key] = cur
                    overrides["_added"] = added
                else:
                    overrides[item_key] = cur
                write_json(MENU, overrides)
                return self._json(200, {"ok": True, "overrides": overrides})
            write_json(MENU, overrides)
            return self._json(200, {"ok": True, "overrides": overrides})

        if route == "tables" and method == "GET":
            return self._json(200, tables_payload())

        if route == "tables" and method == "POST":
            if not session:
                return self._json(401, {"error": "auth_required"})
            layout = read_table_layout()
            action = str(body.get("action") or "state")
            table = parse_table_number(body.get("table"))

            if action == "add_region":
                name = str(body.get("name") or "").strip()
                if not name:
                    return self._json(400, {"error": "name_required"})
                region_id = str(body.get("id") or "")
                if not add_region(layout, name, region_id):
                    return self._json(400, {"error": "region_exists"})
                write_table_layout(layout)
                return self._json(200, tables_payload())

            if action == "rename_region":
                name = str(body.get("name") or "").strip()
                region_id = str(body.get("id") or "")
                if not name:
                    return self._json(400, {"error": "name_required"})
                if not rename_region(layout, region_id, name):
                    return self._json(400, {"error": "region_required"})
                write_table_layout(layout)
                return self._json(200, tables_payload())

            if action == "remove_region":
                region_id = str(body.get("id") or "")
                if not region_id:
                    return self._json(400, {"error": "region_required"})
                if not remove_region(layout, region_id):
                    return self._json(400, {"error": "region_required"})
                write_table_layout(layout)
                return self._json(200, tables_payload())

            if action == "add":
                if not table:
                    return self._json(400, {"error": "table_required"})
                if table in known_table_set(layout):
                    return self._json(400, {"error": "table_exists"})
                region_id = str(body.get("region") or "")
                if not add_table_to_region(layout, region_id, table):
                    return self._json(400, {"error": "region_required"})
                write_table_layout(layout)
                payload = tables_payload()
                payload["table"] = table
                payload["region"] = region_id
                return self._json(200, payload)

            if action == "rename_table":
                new_table = parse_table_number(body.get("newTable"))
                result = rename_table_number(layout, table, new_table)
                if result != "ok":
                    return self._json(400, {"error": result})
                write_table_layout(layout)
                payload = tables_payload()
                payload["table"] = new_table
                payload["oldTable"] = table
                return self._json(200, payload)

            if action == "remove":
                if not table:
                    return self._json(400, {"error": "table_required"})
                for region in layout.get("regions") or []:
                    nums = []
                    for num in region.get("tables") or []:
                        if parse_table_number(num) != table:
                            nums.append(int(parse_table_number(num) or 0))
                    region["tables"] = sorted(n for n in nums if n > 0)
                layout["states"].pop(table, None)
                write_table_layout(layout)
                payload = tables_payload()
                payload["table"] = table
                return self._json(200, payload)

            if not table:
                return self._json(400, {"error": "table_required"})
            if table not in known_table_set(layout):
                return self._json(400, {"error": "table_unknown"})
            state = str(body.get("state") or "open")
            if state not in ("open", "full", "disabled", "reserved"):
                return self._json(400, {"error": "invalid_state"})
            prev = (layout.get("states") or {}).get(table) or "open"
            if state == "open":
                layout["states"].pop(table, None)
            else:
                layout["states"][table] = state
            write_table_layout(layout)
            if prev == "reserved" and state != "reserved":
                cancel_open_reservations_for_table(table)
            payload = tables_payload()
            payload["reservations"] = read_reservations()
            payload["table"] = table
            payload["state"] = state
            return self._json(200, payload)

        if route == "reservations" and method == "GET":
            if not session:
                return self._json(401, {"error": "auth_required"})
            return self._json(200, reservations_payload())

        if route == "reservations" and method == "POST":
            action = str(body.get("action") or "")
            now = int(time.time() * 1000)

            if action in ("accept", "reject", "cancel"):
                if not session:
                    return self._json(401, {"error": "auth_required"})
                rid = str(body.get("id") or "").strip()
                if not rid:
                    return self._json(400, {"error": "id_required"})
                rows = read_reservations()
                found_i = next(
                    (
                        i
                        for i, r in enumerate(rows)
                        if isinstance(r, dict) and str(r.get("id")) == rid
                    ),
                    -1,
                )
                if found_i < 0:
                    return self._json(404, {"error": "not_found"})
                found = dict(rows[found_i])
                cur = str(found.get("status") or "")
                table = parse_table_number(found.get("table"))

                if action == "accept":
                    if cur != "pending":
                        return self._json(400, {"error": "invalid_status"})
                    layout = read_table_layout()
                    if not table or table not in known_table_set(layout):
                        return self._json(400, {"error": "table_unknown"})
                    st = (layout.get("states") or {}).get(table) or "open"
                    if st == "disabled":
                        return self._json(400, {"error": "table_disabled"})
                    # Only require table free if hold window already started
                    if reservation_hold_started(found, now):
                        if st in ("full", "reserved"):
                            return self._json(400, {"error": "table_unavailable"})
                        mark_table_reserved(table)
                    found["status"] = "accepted"
                    found["updatedAt"] = now
                    rows[found_i] = found
                    write_reservations(rows)
                    return self._json(
                        200,
                        reservations_payload({"reservation": found, "ok": True}),
                    )

                if action == "reject":
                    if cur != "pending":
                        return self._json(400, {"error": "invalid_status"})
                    found["status"] = "rejected"
                    found["updatedAt"] = now
                    rows[found_i] = found
                    write_reservations(rows)
                    return self._json(
                        200,
                        reservations_payload({"reservation": found, "ok": True}),
                    )

                if cur not in ("pending", "accepted"):
                    return self._json(400, {"error": "invalid_status"})
                found["status"] = "cancelled"
                found["updatedAt"] = now
                rows[found_i] = found
                write_reservations(rows)
                if cur == "accepted" and table:
                    clear_reserved_table(table)
                return self._json(
                    200,
                    reservations_payload({"reservation": found, "ok": True}),
                )

            table = parse_table_number(body.get("table"))
            name = str(body.get("name") or "").strip()
            phone = normalize_phone(body.get("phone"))
            reserve_date = parse_reservation_date(body.get("date"))
            reserve_time = parse_reservation_time(body.get("time"))
            try:
                guests = int(body.get("guests") or 0)
            except (TypeError, ValueError):
                guests = 0
            guests = max(0, min(99, guests))
            if not table:
                return self._json(400, {"error": "table_required"})
            if not reserve_date:
                raw_date = str(body.get("date") or "").strip()
                if not raw_date:
                    return self._json(400, {"error": "date_required"})
                return self._json(400, {"error": "date_invalid"})
            if not reserve_time:
                raw_time = str(body.get("time") or "").strip()
                if not raw_time:
                    return self._json(400, {"error": "time_required"})
                return self._json(400, {"error": "time_invalid"})
            try:
                import datetime as _dt

                y, mo, d = (int(x) for x in reserve_date.split("-"))
                hh, mm = (int(x) for x in reserve_time.split(":"))
                reserved_at = int(_dt.datetime(y, mo, d, hh, mm).timestamp() * 1000)
            except Exception:
                return self._json(400, {"error": "time_invalid"})
            if reserved_at < now:
                return self._json(400, {"error": "time_past"})
            if len(name) < 2:
                return self._json(400, {"error": "name_required"})
            name = name[:80]
            if len(phone) < 8:
                return self._json(400, {"error": "phone_required"})
            layout = read_table_layout()
            if table not in known_table_set(layout):
                return self._json(400, {"error": "table_unknown"})
            st = (layout.get("states") or {}).get(table) or "open"
            if st == "disabled":
                return self._json(400, {"error": "table_disabled"})
            # Future bookings are allowed even if table is currently full
            rows = read_reservations()
            if find_open_reservation_for_table(rows, table):
                return self._json(400, {"error": "table_reserved"})
            reservation = {
                "id": f"rsv-{now}-{secrets.randbelow(9000) + 1000}",
                "table": int(table),
                "name": name,
                "phone": phone,
                "date": reserve_date,
                "time": reserve_time,
                "reservedAt": reserved_at,
                "status": "pending",
                "createdAt": now,
                "updatedAt": now,
            }
            if guests > 0:
                reservation["guests"] = guests
            rows.insert(0, reservation)
            write_reservations(rows[:800])
            return self._json(
                201,
                reservations_payload({"reservation": reservation, "ok": True}),
            )

        if route == "stats" and method == "GET":
            if not session:
                return self._json(401, {"error": "auth_required"})
            invoices = read_json(INVOICES, [])
            return self._json(200, {"stats": compute_invoice_stats(invoices)})

        if route == "settings" and method == "GET":
            settings = read_site_settings()
            payload = {"settings": settings}
            if session:
                payload["summary"] = compute_settings_summary(
                    read_json(ORDERS, []),
                    read_json(INVOICES, []),
                    read_table_layout(),
                )
            return self._json(200, payload)

        if route == "settings" and method == "POST":
            if not session:
                return self._json(401, {"error": "auth_required"})
            incoming = body.get("settings") if isinstance(body.get("settings"), dict) else {}
            settings = merge_site_settings(read_site_settings(), incoming)
            settings["updatedAt"] = int(time.time() * 1000)
            write_json(SETTINGS, settings)
            return self._json(
                200,
                {
                    "ok": True,
                    "settings": settings,
                    "summary": compute_settings_summary(
                        read_json(ORDERS, []),
                        read_json(INVOICES, []),
                        read_table_layout(),
                    ),
                },
            )

        if route == "customers" and method == "GET":
            if not session:
                return self._json(401, {"error": "auth_required"})
            return self._json(200, {"customers": visible_customers(read_customers())})

        if route == "customers" and method == "POST":
            if not session:
                return self._json(401, {"error": "auth_required"})
            customers = read_customers()
            action = str(body.get("action") or "add")

            if action == "add":
                name = str(body.get("name") or "")[:80].strip()
                if not name:
                    return self._json(400, {"error": "name_required"})
                record = normalize_customer(
                    {
                        "name": name,
                        "phone": body.get("phone"),
                        "birthday": body.get("birthday"),
                        "notes": body.get("notes"),
                        "tier": body.get("tier"),
                        "tags": body.get("tags"),
                        "lastContactAt": body.get("lastContactAt"),
                    }
                )
                customers.append(record)
                write_customers(customers)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "customer": record,
                        "customers": visible_customers(customers),
                    },
                )

            if action == "update":
                cid = str(body.get("id") or "").strip()
                if not cid:
                    return self._json(400, {"error": "id_required"})
                idx = find_customer_index(customers, cid)
                if idx < 0:
                    return self._json(404, {"error": "not_found"})
                cur = customers[idx] if isinstance(customers[idx], dict) else {}
                if cur.get("deletedAt"):
                    return self._json(404, {"error": "not_found"})
                name = str(body.get("name") or cur.get("name") or "")[:80].strip()
                if not name:
                    return self._json(400, {"error": "name_required"})
                record = normalize_customer(
                    {
                        "id": cid,
                        "name": name,
                        "phone": body.get("phone", cur.get("phone")),
                        "birthday": body.get("birthday", cur.get("birthday")),
                        "notes": body.get("notes", cur.get("notes")),
                        "tier": body.get("tier", cur.get("tier")),
                        "tags": body.get("tags", cur.get("tags")),
                        "lastContactAt": body.get(
                            "lastContactAt", cur.get("lastContactAt")
                        ),
                        "createdAt": cur.get("createdAt"),
                    },
                    cid,
                )
                customers[idx] = record
                write_customers(customers)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "customer": record,
                        "customers": visible_customers(customers),
                    },
                )

            if action == "touch":
                cid = str(body.get("id") or "").strip()
                if not cid:
                    return self._json(400, {"error": "id_required"})
                idx = find_customer_index(customers, cid)
                if idx < 0:
                    return self._json(404, {"error": "not_found"})
                cur = customers[idx] if isinstance(customers[idx], dict) else {}
                if cur.get("deletedAt"):
                    return self._json(404, {"error": "not_found"})
                record = normalize_customer(
                    {**cur, "lastContactAt": int(time.time() * 1000)},
                    cid,
                )
                customers[idx] = record
                write_customers(customers)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "customer": record,
                        "customers": visible_customers(customers),
                    },
                )

            if action == "remove":
                cid = str(body.get("id") or "").strip()
                if not cid:
                    return self._json(400, {"error": "id_required"})
                idx = find_customer_index(customers, cid)
                if idx < 0:
                    return self._json(404, {"error": "not_found"})
                cur = customers[idx] if isinstance(customers[idx], dict) else {}
                now = int(time.time() * 1000)
                record = normalize_customer(
                    {**cur, "deletedAt": now, "updatedAt": now},
                    cid,
                )
                customers[idx] = record
                write_customers(customers)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "id": cid,
                        "customers": visible_customers(customers),
                    },
                )

            return self._json(400, {"error": "invalid_action"})

        if route == "coupons" and method == "GET":
            if not session:
                return self._json(401, {"error": "auth_required"})
            return self._json(200, {"coupons": sort_coupons(read_coupons())})

        if route == "coupons" and method == "POST":
            if not session:
                return self._json(401, {"error": "auth_required"})
            coupons = read_coupons()
            action = str(body.get("action") or "add")
            messages = {
                "invalid_code": "کد نامعتبر است",
                "inactive": "این کد غیرفعال است",
                "expired": "مهلت این کد تمام شده است",
                "invalid_value": "مقدار تخفیف نامعتبر است",
                "usage_limit": "سقف استفاده این کد تمام شده است",
            }

            if action == "validate":
                result = validate_coupon_record(coupons, body.get("code"))
                if not result.get("valid"):
                    err = str(result.get("error") or "invalid_code")
                    return self._json(
                        200,
                        {
                            "valid": False,
                            "error": err,
                            "message": messages.get(err, "کد نامعتبر است"),
                        },
                    )
                return self._json(200, {"valid": True, "coupon": result["coupon"]})

            if action == "add":
                code = normalize_coupon_code(body.get("code"))
                if not code:
                    return self._json(400, {"error": "code_required"})
                if find_coupon_by_code(coupons, code):
                    return self._json(400, {"error": "code_exists"})
                record = normalize_coupon(
                    {
                        "code": code,
                        "label": body.get("label"),
                        "discountType": body.get("discountType"),
                        "discountValue": body.get("discountValue"),
                        "active": body.get("active", True),
                        "expiresAt": body.get("expiresAt"),
                        "usageLimit": body.get("usageLimit"),
                        "usedCount": 0,
                    }
                )
                coupons.append(record)
                write_coupons(coupons)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "coupon": record,
                        "coupons": sort_coupons(coupons),
                    },
                )

            if action == "update":
                cid = str(body.get("id") or "").strip()
                if not cid:
                    return self._json(400, {"error": "id_required"})
                idx = find_coupon_index(coupons, cid)
                if idx < 0:
                    return self._json(404, {"error": "not_found"})
                cur = coupons[idx] if isinstance(coupons[idx], dict) else {}
                code = normalize_coupon_code(body.get("code", cur.get("code")))
                if not code:
                    return self._json(400, {"error": "code_required"})
                existing = find_coupon_by_code(coupons, code)
                if existing and str(existing.get("id") or "") != cid:
                    return self._json(400, {"error": "code_exists"})
                record = normalize_coupon(
                    {
                        "id": cid,
                        "code": code,
                        "label": body.get("label", cur.get("label")),
                        "discountType": body.get("discountType", cur.get("discountType")),
                        "discountValue": body.get(
                            "discountValue", cur.get("discountValue")
                        ),
                        "active": body.get("active", cur.get("active", True)),
                        "expiresAt": body.get("expiresAt", cur.get("expiresAt")),
                        "usageLimit": body.get("usageLimit", cur.get("usageLimit")),
                        "usedCount": cur.get("usedCount"),
                        "createdAt": cur.get("createdAt"),
                    },
                    cid,
                )
                coupons[idx] = record
                write_coupons(coupons)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "coupon": record,
                        "coupons": sort_coupons(coupons),
                    },
                )

            if action == "remove":
                cid = str(body.get("id") or "").strip()
                if not cid:
                    return self._json(400, {"error": "id_required"})
                idx = find_coupon_index(coupons, cid)
                if idx < 0:
                    return self._json(404, {"error": "not_found"})
                coupons.pop(idx)
                write_coupons(coupons)
                return self._json(
                    200,
                    {"ok": True, "id": cid, "coupons": sort_coupons(coupons)},
                )

            return self._json(400, {"error": "invalid_action"})

        if route == "hardware" and method == "GET":
            if not session:
                return self._json(401, {"error": "auth_required"})
            return self._json(200, {"devices": sort_hardware(read_hardware())})

        if route == "hardware" and method == "POST":
            if not session:
                return self._json(401, {"error": "auth_required"})
            devices = read_hardware()
            action = str(body.get("action") or "add")

            if action == "add":
                name = str(body.get("name") or "").strip()
                if not name:
                    return self._json(400, {"error": "name_required"})
                incoming = {
                    "name": name,
                    "type": body.get("type"),
                    "station": body.get("station"),
                    "connection": body.get("connection"),
                    "address": body.get("address"),
                    "port": body.get("port"),
                    "paperWidth": body.get("paperWidth"),
                    "copies": body.get("copies"),
                    "enabled": body.get("enabled", True),
                    "notes": body.get("notes"),
                    "isDefault": body.get("isDefault", False),
                    "codePage": body.get("codePage"),
                    "manufacturer": body.get("manufacturer"),
                    "model": body.get("model"),
                    "vendorId": body.get("vendorId"),
                    "productId": body.get("productId"),
                    "cupsQueue": body.get("cupsQueue"),
                }
                if printer_fingerprint:
                    fp = printer_fingerprint(incoming)
                    for row in devices:
                        if isinstance(row, dict) and printer_fingerprint(row) == fp:
                            return self._json(409, {"error": "duplicate", "device": row})
                if body.get("isDefault"):
                    devices = [
                        normalize_hardware({**r, "isDefault": False})
                        if isinstance(r, dict)
                        else r
                        for r in devices
                    ]
                record = normalize_hardware(incoming)
                devices.append(record)
                write_hardware(devices)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "device": record,
                        "devices": sort_hardware(devices),
                    },
                )

            if action == "update":
                cid = str(body.get("id") or "").strip()
                if not cid:
                    return self._json(400, {"error": "id_required"})
                idx = find_hardware_index(devices, cid)
                if idx < 0:
                    return self._json(404, {"error": "not_found"})
                cur = devices[idx] if isinstance(devices[idx], dict) else {}
                name = str(body.get("name", cur.get("name")) or "").strip()
                if not name:
                    return self._json(400, {"error": "name_required"})
                if body.get("isDefault"):
                    devices = [
                        normalize_hardware({**r, "isDefault": False})
                        if isinstance(r, dict) and str(r.get("id") or "") != cid
                        else r
                        for r in devices
                    ]
                record = normalize_hardware(
                    {
                        "id": cid,
                        "name": name,
                        "type": body.get("type", cur.get("type")),
                        "station": body.get("station", cur.get("station")),
                        "connection": body.get(
                            "connection", cur.get("connection")
                        ),
                        "address": body.get("address", cur.get("address")),
                        "port": body.get("port", cur.get("port")),
                        "paperWidth": body.get(
                            "paperWidth", cur.get("paperWidth")
                        ),
                        "copies": body.get("copies", cur.get("copies")),
                        "enabled": body.get("enabled", cur.get("enabled", True)),
                        "notes": body.get("notes", cur.get("notes")),
                        "isDefault": body.get(
                            "isDefault", cur.get("isDefault", False)
                        ),
                        "codePage": body.get("codePage", cur.get("codePage")),
                        "manufacturer": body.get(
                            "manufacturer", cur.get("manufacturer")
                        ),
                        "model": body.get("model", cur.get("model")),
                        "vendorId": body.get("vendorId", cur.get("vendorId")),
                        "productId": body.get("productId", cur.get("productId")),
                        "cupsQueue": body.get("cupsQueue", cur.get("cupsQueue")),
                        "createdAt": cur.get("createdAt"),
                    }
                )
                devices[idx] = record
                write_hardware(devices)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "device": record,
                        "devices": sort_hardware(devices),
                    },
                )

            if action == "set_default":
                cid = str(body.get("id") or "").strip()
                if not cid:
                    return self._json(400, {"error": "id_required"})
                idx = find_hardware_index(devices, cid)
                if idx < 0:
                    return self._json(404, {"error": "not_found"})
                next_devices = []
                record = None
                for i, row in enumerate(devices):
                    if not isinstance(row, dict):
                        continue
                    is_target = i == idx
                    rec = normalize_hardware({**row, "isDefault": is_target})
                    next_devices.append(rec)
                    if is_target:
                        record = rec
                write_hardware(next_devices)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "device": record,
                        "devices": sort_hardware(next_devices),
                    },
                )

            if action == "toggle":
                cid = str(body.get("id") or "").strip()
                if not cid:
                    return self._json(400, {"error": "id_required"})
                idx = find_hardware_index(devices, cid)
                if idx < 0:
                    return self._json(404, {"error": "not_found"})
                cur = devices[idx] if isinstance(devices[idx], dict) else {}
                enabled = body.get("enabled")
                if enabled is None:
                    enabled = not bool(cur.get("enabled", True))
                record = normalize_hardware({**cur, "enabled": bool(enabled)})
                devices[idx] = record
                write_hardware(devices)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "device": record,
                        "devices": sort_hardware(devices),
                    },
                )

            if action == "remove":
                cid = str(body.get("id") or "").strip()
                if not cid:
                    return self._json(400, {"error": "id_required"})
                idx = find_hardware_index(devices, cid)
                if idx < 0:
                    return self._json(404, {"error": "not_found"})
                devices.pop(idx)
                write_hardware(devices)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "id": cid,
                        "devices": sort_hardware(devices),
                    },
                )

            return self._json(400, {"error": "invalid_action"})

        if route == "printers" and method == "GET":
            if not session:
                return self._json(401, {"error": "auth_required"})
            if not printer_capabilities:
                return self._json(503, {"error": "printer_unavailable"})
            return self._json(200, printer_capabilities())

        if route == "printers" and method == "POST":
            if not session:
                return self._json(401, {"error": "auth_required"})
            if not printer_discover:
                return self._json(503, {"error": "printer_unavailable"})
            action = str(body.get("action") or "discover")
            devices = read_hardware()

            if action == "capabilities":
                return self._json(200, printer_capabilities())

            if action == "discover":
                kind = str(body.get("type") or body.get("connection") or "network")
                result = printer_discover(kind)
                return self._json(200, result)

            if action == "test":
                result = printer_test(devices, body)
                status = 200 if result.get("ok") else 502
                return self._json(status, result)

            if action == "print":
                result = printer_print_receipt(devices, body)
                status = 200 if result.get("ok") else 502
                return self._json(status, result)

            if action == "save":
                payload = body.get("printer") if isinstance(body.get("printer"), dict) else body
                devices, record, err = printer_save(devices, payload, normalize_hardware)
                if err == "duplicate":
                    return self._json(409, {"error": "duplicate", "device": record})
                write_hardware(devices)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "device": record,
                        "devices": sort_hardware(devices),
                    },
                )

            if action == "update":
                cid = str(body.get("id") or body.get("printerId") or "").strip()
                patch = body.get("printer") if isinstance(body.get("printer"), dict) else body
                devices, record, err = printer_update(
                    devices, cid, patch, normalize_hardware
                )
                if err == "not_found":
                    return self._json(404, {"error": "not_found"})
                if err == "duplicate":
                    return self._json(409, {"error": "duplicate"})
                write_hardware(devices)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "device": record,
                        "devices": sort_hardware(devices),
                    },
                )

            if action == "delete":
                cid = str(body.get("id") or body.get("printerId") or "").strip()
                devices, ok = printer_delete(devices, cid)
                if not ok:
                    return self._json(404, {"error": "not_found"})
                write_hardware(devices)
                return self._json(
                    200,
                    {"ok": True, "id": cid, "devices": sort_hardware(devices)},
                )

            return self._json(400, {"error": "invalid_action"})

        if route == "invoices" and method == "GET":
            if not session:
                return self._json(401, {"error": "auth_required"})
            return self._json(200, {"invoices": read_json(INVOICES, [])})

        if route == "invoices" and method == "POST":
            if not session:
                return self._json(401, {"error": "auth_required"})
            order_id = str(body.get("orderId") or "")
            if not order_id:
                return self._json(400, {"error": "order_required"})
            orders = read_json(ORDERS, [])
            if not isinstance(orders, list):
                orders = []
            found_i = next(
                (
                    i
                    for i, o in enumerate(orders)
                    if str(o.get("id")) == order_id
                ),
                -1,
            )
            if found_i < 0:
                return self._json(404, {"error": "not_found"})
            found = orders[found_i]
            if found.get("type") == "waiter":
                return self._json(400, {"error": "not_billable"})
            st = str(found.get("status") or "waiting")
            if st == "cancelled":
                return self._json(400, {"error": "order_cancelled"})
            invoices = read_json(INVOICES, [])
            if not isinstance(invoices, list):
                invoices = []
            if st == "invoiced":
                existing = next(
                    (
                        inv
                        for inv in invoices
                        if str(inv.get("orderId")) == order_id
                    ),
                    None,
                )
                return self._json(
                    200,
                    {
                        "invoice": existing,
                        "invoices": invoices,
                        "orders": orders,
                    },
                )
            if st not in ("ready", "delivered"):
                return self._json(400, {"error": "not_ready"})

            items = []
            subtotal = 0
            for it in found.get("items") or []:
                if not isinstance(it, dict):
                    continue
                try:
                    unit = int(round(float(it.get("price") or 0)))
                except (TypeError, ValueError):
                    unit = 0
                try:
                    count = max(1, int(it.get("count") or 1))
                except (TypeError, ValueError):
                    count = 1
                line = unit * count
                subtotal += line
                items.append(
                    {
                        "name": str(it.get("name") or ""),
                        "price": unit,
                        "count": count,
                        "line": line,
                    }
                )
            if subtotal <= 0:
                try:
                    subtotal = int(round(float(found.get("total") or 0)))
                except (TypeError, ValueError):
                    subtotal = 0

            unpaid = bool(body.get("unpaid"))
            coupon_code = normalize_coupon_code(body.get("couponCode"))
            if coupon_code:
                coupons = read_coupons()
                result = validate_coupon_record(coupons, coupon_code)
                if not result.get("valid"):
                    err = str(result.get("error") or "invalid_code")
                    messages = {
                        "invalid_code": "کد نامعتبر است",
                        "inactive": "این کد غیرفعال است",
                        "expired": "مهلت این کد تمام شده است",
                        "invalid_value": "مقدار تخفیف نامعتبر است",
                        "usage_limit": "سقف استفاده این کد تمام شده است",
                    }
                    return self._json(
                        400,
                        {
                            "error": err,
                            "message": messages.get(err, "کد نامعتبر است"),
                        },
                    )
            dtype = str(body.get("discountType") or "")
            dval = body.get("discountValue", 0)
            discount_type, discount_value, discount_amount = invoice_discount(
                subtotal, dtype, dval
            )
            try:
                tax = max(0, int(round(float(body.get("tax") or 0))))
            except (TypeError, ValueError):
                tax = 0
            total = max(0, subtotal - discount_amount + tax)
            payments = sanitize_payments(body.get("payments"))
            paid_sum = payments_total(payments)
            if not unpaid and paid_sum != total:
                return self._json(400, {"error": "payment_mismatch"})

            raw_splits = body.get("splits")
            if not isinstance(raw_splits, list):
                raw_splits = body.get("guestSplits")
            if not unpaid and isinstance(raw_splits, list) and len(raw_splits) > 0:
                splits = []
                split_sum = 0
                for row in raw_splits:
                    if not isinstance(row, dict):
                        continue
                    g_name = str(row.get("name") or "").strip()[:80]
                    try:
                        g_amount = int(round(float(row.get("amount") or 0)))
                    except (TypeError, ValueError):
                        g_amount = 0
                    g_method = str(row.get("method") or "cash")
                    if g_method not in ("cash", "card"):
                        g_method = "cash"
                    if not g_name:
                        g_name = f"نفر {len(splits) + 1}"
                    if g_amount <= 0:
                        return self._json(
                            400,
                            {
                                "error": "invalid_amount",
                                "message": "مبلغ هر نفر باید بیشتر از صفر باشد",
                            },
                        )
                    g_cid = str(row.get("customerId") or "").strip()
                    split_row = {
                        "name": g_name,
                        "amount": g_amount,
                        "method": g_method,
                        "customerId": g_cid,
                    }
                    for key in (
                        "paymentId",
                        "referenceNumber",
                        "terminalId",
                        "providerTransactionId",
                    ):
                        val = str(row.get(key) or "").strip()
                        if val:
                            split_row[key] = val[:80]
                    splits.append(split_row)
                    split_sum += g_amount
                if not splits:
                    return self._json(400, {"error": "splits_required"})
                if split_sum != total:
                    return self._json(
                        400,
                        {
                            "error": "payment_mismatch",
                            "message": "جمع سهم افراد با مبلغ فاکتور هم‌خوانی ندارد",
                        },
                    )

                now = int(time.time() * 1000)
                max_n = 1000
                for inv in invoices:
                    try:
                        n = int(inv.get("number") or 0)
                    except (TypeError, ValueError):
                        n = 0
                    if n > max_n:
                        max_n = n

                created = []
                table_label = str(found.get("table") or "")
                for i, split in enumerate(splits):
                    amount = int(split["amount"])
                    pay = [{"method": split["method"], "amount": amount}]
                    for key in (
                        "paymentId",
                        "referenceNumber",
                        "terminalId",
                        "providerTransactionId",
                    ):
                        val = str(split.get(key) or "").strip()
                        if val:
                            pay[0][key] = val
                    invoice = {
                        "id": f"inv-{now}-{i + 1}-{secrets.randbelow(9000) + 1000}",
                        "number": max_n + 1 + i,
                        "orderId": order_id,
                        "table": found.get("table"),
                        "createdAt": now + i,
                        "updatedAt": now + i,
                        "cashier": "local",
                        "customerName": split["name"],
                        "customerPhone": "",
                        "couponCode": coupon_code if i == 0 else "",
                        "items": [
                            {
                                "name": f"سهم از سفارش میز {table_label}",
                                "price": amount,
                                "count": 1,
                                "line": amount,
                            }
                        ],
                        "subtotal": amount,
                        "discountType": "",
                        "discountValue": 0,
                        "discountAmount": 0,
                        "tax": 0,
                        "total": amount,
                        "payments": pay,
                        "payMethod": split["method"],
                        "status": "paid",
                        "history": [{"at": now + i, "action": "paid"}],
                        "refunds": [],
                        "splitIndex": i + 1,
                        "splitCount": len(splits),
                    }
                    cust_id, cname, cphone = resolve_customer_link(
                        {
                            "customerId": split.get("customerId") or "",
                            "customerName": split["name"],
                            "customerPhone": "",
                        },
                        {},
                    )
                    apply_customer_link(invoice, cust_id, cname, cphone)
                    created.append(invoice)

                for inv in reversed(created):
                    invoices.insert(0, inv)
                write_json(INVOICES, invoices)

                if coupon_code:
                    coupons = read_coupons()
                    coupons, _ = redeem_coupon(coupons, coupon_code)
                    write_coupons(coupons)

                ids = [inv["id"] for inv in created]
                found["status"] = "invoiced"
                found["invoiceId"] = ids[0]
                found["invoiceIds"] = ids
                found["updatedAt"] = now
                orders[found_i] = found
                write_json(ORDERS, orders)
                reservations = cancel_reservations_after_invoice(found.get("table"))
                return self._json(
                    201,
                    {
                        "order": found,
                        "orders": orders,
                        "invoice": created[0],
                        "createdInvoices": created,
                        "invoices": invoices,
                        "reservations": reservations,
                    },
                )

            customer_name = str(body.get("customerName") or "").strip()[:80]
            customer_phone = str(body.get("customerPhone") or "").strip()[:20]
            # Prefer explicit body customerId; else inherit from the order.
            link_body = {
                "customerId": body.get("customerId", found.get("customerId")),
                "customerName": customer_name or found.get("customerName"),
                "customerPhone": customer_phone or found.get("customerPhone"),
            }
            if "customerId" in body and not body.get("customerId"):
                link_body["customerId"] = ""
            cust_id, customer_name, customer_phone = resolve_customer_link(
                link_body, found
            )
            if unpaid and not customer_name:
                return self._json(
                    400,
                    {
                        "error": "customer_required",
                        "message": "برای فاکتور بدهکار نام مشتری الزامی است",
                    },
                )
            if unpaid:
                payments = []

            now = int(time.time() * 1000)
            max_n = 1000
            for inv in invoices:
                try:
                    n = int(inv.get("number") or 0)
                except (TypeError, ValueError):
                    n = 0
                if n > max_n:
                    max_n = n
            invoice = {
                "id": f"inv-{now}-{secrets.randbelow(9000) + 1000}",
                "number": max_n + 1,
                "orderId": order_id,
                "table": found.get("table"),
                "createdAt": now,
                "updatedAt": now,
                "cashier": "local",
                "customerName": customer_name,
                "customerPhone": customer_phone,
                "couponCode": coupon_code,
                "items": items,
                "subtotal": subtotal,
                "discountType": discount_type,
                "discountValue": discount_value,
                "discountAmount": discount_amount,
                "tax": tax,
                "total": total,
                "payments": payments,
                "payMethod": payments_label(payments),
                "status": "unpaid" if unpaid else "paid",
                "history": [
                    {"at": now, "action": "created" if unpaid else "paid"}
                ],
                "refunds": [],
            }
            apply_customer_link(invoice, cust_id, customer_name, customer_phone)
            invoices.insert(0, invoice)
            write_json(INVOICES, invoices)

            if coupon_code:
                coupons = read_coupons()
                coupons, _ = redeem_coupon(coupons, coupon_code)
                write_coupons(coupons)

            found["status"] = "invoiced"
            found["invoiceId"] = invoice["id"]
            found["updatedAt"] = now
            apply_customer_link(found, cust_id, customer_name, customer_phone)
            orders[found_i] = found
            write_json(ORDERS, orders)
            reservations = cancel_reservations_after_invoice(found.get("table"))
            return self._json(
                201,
                {
                    "order": found,
                    "orders": orders,
                    "invoice": invoice,
                    "invoices": invoices,
                    "reservations": reservations,
                },
            )

        if route == "invoice-item" and item_id:
            if not session:
                return self._json(401, {"error": "auth_required"})
            if method not in ("POST", "PATCH"):
                return self._json(405, {"error": "method"})
            invoices = read_json(INVOICES, [])
            if not isinstance(invoices, list):
                invoices = []
            found_i = next(
                (
                    i
                    for i, inv in enumerate(invoices)
                    if str(inv.get("id")) == str(item_id)
                ),
                -1,
            )
            if found_i < 0:
                return self._json(404, {"error": "not_found"})
            found = dict(invoices[found_i])
            action = str(body.get("action") or "")
            now = int(time.time() * 1000)
            st = str(found.get("status") or "unpaid")

            if action == "pay":
                if st == "cancelled":
                    return self._json(400, {"error": "invoice_cancelled"})
                payments = sanitize_payments(body.get("payments") or [])
                total = int(found.get("total") or 0)
                if payments_total(payments) != total:
                    return self._json(400, {"error": "payment_mismatch"})
                found["payments"] = payments
                found["updatedAt"] = now
                append_invoice_history(found, "paid")
                refresh_invoice_status(found)
            elif action == "cancel":
                if st != "cancelled":
                    found["status"] = "cancelled"
                    found["updatedAt"] = now
                    append_invoice_history(found, "cancelled")
            elif action == "edit":
                if st == "cancelled":
                    return self._json(400, {"error": "invoice_cancelled"})
                if (
                    "customerId" in body
                    or "customerName" in body
                    or "customerPhone" in body
                ):
                    cust_id, next_name, next_phone = resolve_customer_link(
                        body, found
                    )
                    if st == "unpaid" and not next_name:
                        return self._json(
                            400,
                            {
                                "error": "customer_required",
                                "message": "برای فاکتور بدهکار نام مشتری الزامی است",
                            },
                        )
                    apply_customer_link(found, cust_id, next_name, next_phone)
                if st == "unpaid" and "discountType" in body:
                    subtotal = int(found.get("subtotal") or 0)
                    dtype, dval, damount = invoice_discount(
                        subtotal,
                        str(body.get("discountType") or ""),
                        body.get("discountValue") or 0,
                    )
                    found["discountType"] = dtype
                    found["discountValue"] = dval
                    found["discountAmount"] = damount
                    tax = int(found.get("tax") or 0)
                    found["total"] = max(0, subtotal - damount + tax)
                found["updatedAt"] = now
                append_invoice_history(found, "edited")
            else:
                return self._json(400, {"error": "invalid_action"})

            invoices[found_i] = found
            write_json(INVOICES, invoices)
            return self._json(200, {"invoice": found, "invoices": invoices})

        if route == "orders" and method == "GET":
            return self._json(200, orders_payload(include_invoices=bool(session)))

        if route == "stream" and method == "GET":
            mode = (qs.get("mode") or ["sse"])[0]
            if not session_ok(token):
                return self._json(401, {"error": "auth_required"})
            if mode == "poll":
                return self._json(200, orders_payload(True))
            payload = json.dumps(orders_payload(True), ensure_ascii=False)
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            try:
                self.wfile.write(f"data: {payload}\n\n".encode("utf-8"))
                self.wfile.flush()
                for _ in range(30):
                    time.sleep(2)
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
            except BrokenPipeError:
                pass
            return

        if route == "orders" and method == "POST":
            layout = read_table_layout()
            table = parse_table_number(body.get("table"))
            if not table:
                return self._json(400, {"error": "table_required"})
            if table not in known_table_set(layout):
                return self._json(400, {"error": "table_unknown"})
            if (layout.get("states") or {}).get(table) == "disabled":
                return self._json(400, {"error": "table_disabled"})
            orders = read_json(ORDERS, [])
            if not isinstance(orders, list):
                orders = []
            now = int(time.time() * 1000)
            order_type = "waiter" if body.get("type") == "waiter" else "food"
            order = {
                "id": secrets.token_hex(8),
                "type": order_type,
                "table": table,
                "status": "waiting",
                "items": body.get("items") or [],
                "total": body.get("total") or 0,
                "createdAt": now,
                "updatedAt": now,
            }
            cust_id, cname, cphone = resolve_customer_link(body)
            apply_customer_link(order, cust_id, cname, cphone)
            orders.insert(0, order)
            write_json(ORDERS, orders)
            if order_type == "food":
                sync_reservation_holds()
                layout = read_table_layout()
                if (layout.get("states") or {}).get(table) == "reserved":
                    seat_accepted_reservation(table)
                mark_table_full(table)
            payload = tables_payload()
            payload["ok"] = True
            payload["order"] = order
            payload["orders"] = orders
            payload["reservations"] = read_reservations()
            return self._json(200, payload)

        if route == "item" and item_id:
            if not session:
                return self._json(401, {"error": "auth_required"})
            orders = read_json(ORDERS, [])
            if not isinstance(orders, list):
                orders = []
            action = str(body.get("action") or "")
            found_i = next(
                (
                    i
                    for i, o in enumerate(orders)
                    if str(o.get("id")) == str(item_id)
                ),
                -1,
            )
            if found_i < 0:
                return self._json(404, {"error": "not_found"})
            found = dict(orders[found_i])
            now = int(time.time() * 1000)
            order_type = found.get("type") or "food"
            cur = found.get("status") or "waiting"
            if cur == "given":
                cur = "preparing"

            if method == "DELETE" or action in ("delete", "cancel"):
                if cur == "invoiced":
                    return self._json(400, {"error": "already_invoiced"})
                found["status"] = "cancelled"
                found["updatedAt"] = now
                append_order_history(found, "cancel", "cancelled")
                orders[found_i] = found
                write_json(ORDERS, orders)
                payload = tables_payload()
                payload["order"] = found
                payload["orders"] = orders
                return self._json(200, payload)

            if action == "table":
                new_table = parse_table_number(body.get("table"))
                if not new_table:
                    return self._json(400, {"error": "table_required"})
                layout = read_table_layout()
                if new_table not in known_table_set(layout):
                    return self._json(400, {"error": "table_unknown"})
                if (layout.get("states") or {}).get(new_table) == "disabled":
                    return self._json(400, {"error": "table_disabled"})
                found["table"] = new_table
                found["updatedAt"] = now
                append_order_history(found, "table", cur)
                orders[found_i] = found
                write_json(ORDERS, orders)
                payload = tables_payload()
                payload["order"] = found
                payload["orders"] = orders
                return self._json(200, payload)

            if action == "customer":
                if cur == "cancelled":
                    return self._json(400, {"error": "order_cancelled"})
                clear = not body.get("customerId") and not body.get(
                    "customerName"
                )
                cust_id, cname, cphone = resolve_customer_link(
                    body, found, clear=clear
                )
                apply_customer_link(found, cust_id, cname, cphone)
                found["updatedAt"] = now
                append_order_history(found, "customer", cur)
                orders[found_i] = found
                write_json(ORDERS, orders)
                payload = tables_payload()
                payload["order"] = found
                payload["orders"] = orders
                return self._json(200, payload)

            if action == "items":
                if order_type == "waiter":
                    return self._json(400, {"error": "not_editable"})
                if cur == "cancelled":
                    return self._json(400, {"error": "order_cancelled"})
                if cur == "invoiced":
                    return self._json(400, {"error": "already_invoiced"})
                items = sanitize_items(body.get("items"))
                if not items:
                    return self._json(400, {"error": "items_required"})
                try:
                    total = float(body.get("total") or 0)
                except (TypeError, ValueError):
                    total = 0.0
                if total <= 0:
                    total = item_line_total(items)
                found["items"] = items
                found["total"] = total
                found["updatedAt"] = now
                if "customerId" in body or "customerName" in body:
                    cust_id, cname, cphone = resolve_customer_link(body, found)
                    apply_customer_link(found, cust_id, cname, cphone)
                batches = found.get("batches")
                if not isinstance(batches, list):
                    batches = []
                batches.append(
                    {
                        "createdAt": now,
                        "items": items,
                        "total": total,
                        "edit": True,
                    }
                )
                found["batches"] = batches
                append_order_history(found, "items", cur)
                orders[found_i] = found
                write_json(ORDERS, orders)
                payload = tables_payload()
                payload["order"] = found
                payload["orders"] = orders
                return self._json(200, payload)

            next_status = str(body.get("status") or "")
            if next_status == "given":
                next_status = "preparing"
            if not next_status:
                return self._json(400, {"error": "invalid_action"})
            found["status"] = next_status
            found["updatedAt"] = now
            append_order_history(found, "status", next_status)
            orders[found_i] = found
            write_json(ORDERS, orders)
            payload = tables_payload()
            payload["order"] = found
            payload["orders"] = orders
            return self._json(200, payload)

        # ── Payment terminals ──────────────────────────────────────────
        if route == "payment-terminals" and method == "GET":
            if not session:
                return self._json(401, {"error": "auth_required"})
            if not normalize_terminal:
                return self._json(503, {"error": "payment_unavailable"})
            return self._json(
                200, {"terminals": sort_terminals(read_payment_terminals())}
            )

        if route == "payment-terminals" and method == "POST":
            if not session:
                return self._json(401, {"error": "auth_required"})
            if not normalize_terminal:
                return self._json(503, {"error": "payment_unavailable"})
            terminals = read_payment_terminals()
            action = str(body.get("action") or "add")

            if action == "add":
                name = str(body.get("name") or "").strip()
                if not name:
                    return self._json(400, {"error": "name_required"})
                incoming = {**body, "name": name}
                if body.get("isDefault"):
                    terminals = payment_clear_defaults(terminals)
                record = normalize_terminal(incoming)
                terminals.append(record)
                write_payment_terminals(terminals)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "terminal": record,
                        "terminals": sort_terminals(terminals),
                    },
                )

            if action == "update":
                tid = str(body.get("id") or "").strip()
                if not tid:
                    return self._json(400, {"error": "id_required"})
                idx = find_terminal_index(terminals, tid)
                if idx < 0:
                    return self._json(404, {"error": "not_found"})
                cur = terminals[idx] if isinstance(terminals[idx], dict) else {}
                name = str(body.get("name", cur.get("name")) or "").strip()
                if not name:
                    return self._json(400, {"error": "name_required"})
                if body.get("isDefault"):
                    terminals = payment_clear_defaults(terminals, tid)
                record = normalize_terminal(
                    {**cur, **body, "id": tid, "name": name, "createdAt": cur.get("createdAt")}
                )
                terminals[idx] = record
                write_payment_terminals(terminals)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "terminal": record,
                        "terminals": sort_terminals(terminals),
                    },
                )

            if action == "set_default":
                tid = str(body.get("id") or "").strip()
                if not tid:
                    return self._json(400, {"error": "id_required"})
                idx = find_terminal_index(terminals, tid)
                if idx < 0:
                    return self._json(404, {"error": "not_found"})
                next_rows = []
                record = None
                for i, row in enumerate(terminals):
                    if not isinstance(row, dict):
                        continue
                    rec = normalize_terminal({**row, "isDefault": i == idx})
                    next_rows.append(rec)
                    if i == idx:
                        record = rec
                write_payment_terminals(next_rows)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "terminal": record,
                        "terminals": sort_terminals(next_rows),
                    },
                )

            if action == "toggle":
                tid = str(body.get("id") or "").strip()
                if not tid:
                    return self._json(400, {"error": "id_required"})
                idx = find_terminal_index(terminals, tid)
                if idx < 0:
                    return self._json(404, {"error": "not_found"})
                cur = terminals[idx] if isinstance(terminals[idx], dict) else {}
                enabled = body.get("isActive", body.get("enabled"))
                if enabled is None:
                    enabled = not bool(cur.get("isActive", True))
                record = normalize_terminal({**cur, "isActive": bool(enabled)})
                terminals[idx] = record
                write_payment_terminals(terminals)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "terminal": record,
                        "terminals": sort_terminals(terminals),
                    },
                )

            if action == "remove":
                tid = str(body.get("id") or "").strip()
                if not tid:
                    return self._json(400, {"error": "id_required"})
                idx = find_terminal_index(terminals, tid)
                if idx < 0:
                    return self._json(404, {"error": "not_found"})
                terminals.pop(idx)
                write_payment_terminals(terminals)
                return self._json(
                    200,
                    {
                        "ok": True,
                        "id": tid,
                        "terminals": sort_terminals(terminals),
                    },
                )

            return self._json(400, {"error": "invalid_action"})

        # ── Payment agent (discover / test / health) ───────────────────
        if route == "payment-agent" and method == "POST":
            if not session:
                return self._json(401, {"error": "auth_required"})
            if not payment_sale:
                return self._json(503, {"error": "payment_unavailable"})
            headers = {k: v for k, v in self.headers.items()}
            if check_agent_request:
                denied = check_agent_request(
                    headers, body, remote_addr=self.client_address[0]
                )
                if denied:
                    return self._json(403, denied)
            client_key = self.client_address[0] if self.client_address else "local"
            if payment_rate_limit_ok and not payment_rate_limit_ok(client_key):
                return self._json(
                    429, {"ok": False, "error": "RATE_LIMITED", "message": "Too many requests"}
                )
            action = str(body.get("action") or "health")
            terminals = read_payment_terminals()

            if action == "health":
                return self._json(200, payment_health())

            if action == "providers":
                return self._json(200, {"ok": True, "providers": payment_list_providers()})

            if action == "discover":
                kind = str(body.get("connectionType") or body.get("type") or "network")
                result = payment_discover(
                    kind,
                    provider=str(body.get("provider") or ""),
                    host=str(body.get("host") or ""),
                    port=int(body.get("port") or 0),
                    hosts=body.get("hosts"),
                )
                return self._json(200, result)

            if action == "test":
                result = payment_test_connection(terminals, body)
                status = 200 if result.get("ok") else 502
                return self._json(status, result)

            return self._json(400, {"error": "invalid_action"})

        # ── Payments (state machine + idempotency) ─────────────────────
        if route == "payment-item" and method == "GET":
            if not session:
                return self._json(401, {"error": "auth_required"})
            if not find_payment:
                return self._json(503, {"error": "payment_unavailable"})
            pid = str(item_id or "").strip()
            _, row = find_payment(read_payments(), pid)
            if not row:
                return self._json(404, {"error": "not_found"})
            return self._json(200, {"payment": normalize_payment(row)})

        if route == "payments" and method == "GET":
            if not session:
                return self._json(401, {"error": "auth_required"})
            payments = [normalize_payment(p) for p in read_payments() if isinstance(p, dict)]
            payments.sort(key=lambda p: -int(p.get("createdAt") or 0))
            return self._json(200, {"payments": payments})

        if route == "payments" and method == "POST":
            if not session:
                return self._json(401, {"error": "auth_required"})
            if not payment_sale or not normalize_payment:
                return self._json(503, {"error": "payment_unavailable"})
            headers = {k: v for k, v in self.headers.items()}
            if check_agent_request:
                denied = check_agent_request(
                    headers, body, remote_addr=self.client_address[0]
                )
                if denied:
                    return self._json(403, denied)
            client_key = self.client_address[0] if self.client_address else "local"
            if payment_rate_limit_ok and not payment_rate_limit_ok(f"pay:{client_key}"):
                return self._json(
                    429, {"ok": False, "error": "RATE_LIMITED", "message": "Too many requests"}
                )

            action = str(body.get("action") or "sale")
            payments = read_payments()
            terminals = read_payment_terminals()

            if action == "list_by_invoice":
                inv = str(body.get("invoiceId") or "").strip()
                rows = [
                    normalize_payment(p)
                    for p in payments
                    if isinstance(p, dict) and str(p.get("invoiceId") or "") == inv
                ]
                return self._json(200, {"payments": rows})

            if action == "attempts":
                pid = str(body.get("paymentId") or "").strip()
                attempts = [
                    normalize_attempt(a)
                    for a in read_payment_attempts()
                    if isinstance(a, dict) and str(a.get("paymentId") or "") == pid
                ]
                attempts.sort(key=lambda a: int(a.get("attemptNumber") or 0))
                return self._json(200, {"attempts": attempts})

            if action == "sale":
                pid = str(body.get("paymentId") or new_payment_id()).strip()
                idx, existing = find_payment(payments, pid)
                if existing:
                    # Idempotent: return existing; never charge twice
                    payment = normalize_payment(existing)
                    if payment["status"] == "SUCCESS":
                        return self._json(
                            200,
                            {
                                "ok": True,
                                "payment": payment,
                                "result": {
                                    "success": True,
                                    "status": "SUCCESS",
                                    "paymentId": payment["id"],
                                    "invoiceId": payment.get("invoiceId"),
                                    "amount": payment.get("amount"),
                                    "terminalId": payment.get("terminalId"),
                                    "referenceNumber": payment.get("referenceNumber"),
                                    "providerTransactionId": payment.get(
                                        "providerTransactionId"
                                    ),
                                    "message": "Idempotent replay",
                                    "timestamp": "",
                                },
                                "idempotent": True,
                            },
                        )
                    if not can_retry_sale(payment):
                        return self._json(
                            409,
                            {
                                "ok": False,
                                "error": "INQUIRY_REQUIRED",
                                "message": "Payment already in flight or unknown — inquire before retry",
                                "payment": payment,
                            },
                        )

                amount = int(body.get("amount") or 0)
                if amount <= 0:
                    return self._json(400, {"error": "INVALID_AMOUNT", "message": "Amount must be positive"})

                tid = str(body.get("terminalId") or "").strip()
                terminal = None
                if tid:
                    tidx = find_terminal_index(terminals, tid)
                    if tidx >= 0:
                        terminal = terminals[tidx]
                if not terminal:
                    active = [
                        t
                        for t in terminals
                        if isinstance(t, dict) and t.get("isActive", True)
                    ]
                    terminal = next((t for t in active if t.get("isDefault")), None) or (
                        active[0] if active else None
                    )
                if not terminal:
                    return self._json(
                        400,
                        {
                            "error": "TERMINAL_NOT_FOUND",
                            "message": "No payment terminal configured",
                        },
                    )

                payment = normalize_payment(
                    {
                        "id": pid,
                        "invoiceId": body.get("invoiceId"),
                        "terminalId": terminal.get("id"),
                        "provider": terminal.get("provider"),
                        "amount": amount,
                        "currency": body.get("currency") or "IRT",
                        "status": "INITIATED",
                        "merchantReference": body.get("merchantReference") or pid,
                        "createdAt": (existing or {}).get("createdAt") if existing else None,
                    }
                )
                if idx >= 0:
                    payments[idx] = payment
                else:
                    payments.append(payment)
                write_payments(payments)

                payment["status"] = "SENT_TO_TERMINAL"
                if idx >= 0:
                    payments[idx] = payment
                else:
                    payments[-1] = payment
                write_payments(payments)

                agent_body = {
                    **body,
                    "paymentId": pid,
                    "terminalId": terminal.get("id"),
                    "amount": amount,
                    "currency": payment["currency"],
                    "invoiceId": payment.get("invoiceId"),
                    "merchantReference": payment.get("merchantReference"),
                    "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
                result = payment_sale(terminals, agent_body)
                status = str(result.get("status") or "UNKNOWN")
                if result.get("errorCode") == "TERMINAL_OFFLINE" or (
                    not result.get("sentToTerminal", True)
                    and status == "FAILED"
                ):
                    # Offline before send
                    payment = apply_result_to_payment(payment, {**result, "status": "FAILED"})
                elif status == "UNKNOWN" or (
                    result.get("sentToTerminal") and status not in ("SUCCESS", "FAILED", "CANCELLED")
                ):
                    payment = apply_result_to_payment(payment, {**result, "status": "UNKNOWN"})
                else:
                    payment = apply_result_to_payment(payment, result)

                pidx, _ = find_payment(payments, pid)
                if pidx >= 0:
                    payments[pidx] = payment
                write_payments(payments)
                append_payment_attempt(
                    pid,
                    payment["status"],
                    {
                        "amount": amount,
                        "terminalId": terminal.get("id"),
                        "provider": terminal.get("provider"),
                    },
                    {
                        "status": result.get("status"),
                        "responseCode": result.get("responseCode"),
                        "errorCode": result.get("errorCode") or result.get("error"),
                        "message": result.get("message"),
                        "referenceNumber": result.get("referenceNumber"),
                    },
                )
                return self._json(
                    200,
                    {
                        "ok": True,
                        "payment": payment,
                        "result": {
                            "success": payment["status"] == "SUCCESS",
                            "status": payment["status"]
                            if payment["status"]
                            in ("SUCCESS", "FAILED", "CANCELLED", "REVERSED", "UNKNOWN", "PENDING")
                            else "UNKNOWN",
                            "paymentId": payment["id"],
                            "invoiceId": payment.get("invoiceId"),
                            "amount": payment.get("amount"),
                            "providerTransactionId": payment.get("providerTransactionId"),
                            "referenceNumber": payment.get("referenceNumber"),
                            "terminalId": payment.get("terminalId"),
                            "responseCode": payment.get("responseCode"),
                            "message": payment.get("message") or result.get("message"),
                            "timestamp": result.get("timestamp") or "",
                            "errorCode": result.get("errorCode") or result.get("error"),
                        },
                    },
                )

            if action == "inquiry":
                pid = str(body.get("paymentId") or "").strip()
                idx, existing = find_payment(payments, pid)
                if not existing:
                    return self._json(404, {"error": "not_found"})
                payment = normalize_payment(existing)
                agent_body = {
                    "paymentId": pid,
                    "terminalId": payment.get("terminalId"),
                    "invoiceId": payment.get("invoiceId"),
                    "amount": payment.get("amount"),
                }
                result = payment_inquiry(terminals, agent_body)
                payment = apply_result_to_payment(payment, result)
                payments[idx] = payment
                write_payments(payments)
                append_payment_attempt(
                    pid,
                    f"INQUIRY_{payment['status']}",
                    {"action": "inquiry"},
                    {
                        "status": result.get("status"),
                        "responseCode": result.get("responseCode"),
                        "message": result.get("message"),
                        "referenceNumber": result.get("referenceNumber"),
                    },
                )
                return self._json(
                    200,
                    {
                        "ok": True,
                        "payment": payment,
                        "result": {
                            "success": payment["status"] == "SUCCESS",
                            "status": payment["status"],
                            "paymentId": payment["id"],
                            "invoiceId": payment.get("invoiceId"),
                            "amount": payment.get("amount"),
                            "providerTransactionId": payment.get("providerTransactionId"),
                            "referenceNumber": payment.get("referenceNumber"),
                            "terminalId": payment.get("terminalId"),
                            "responseCode": payment.get("responseCode"),
                            "message": payment.get("message"),
                            "timestamp": result.get("timestamp") or "",
                        },
                    },
                )

            if action in ("cancel", "reversal"):
                pid = str(body.get("paymentId") or "").strip()
                idx, existing = find_payment(payments, pid)
                if not existing:
                    return self._json(404, {"error": "not_found"})
                payment = normalize_payment(existing)
                fn = payment_cancel if action == "cancel" else payment_reversal
                result = fn(
                    terminals,
                    {
                        "paymentId": pid,
                        "terminalId": payment.get("terminalId"),
                        "invoiceId": payment.get("invoiceId"),
                        "amount": payment.get("amount"),
                    },
                )
                if not result.get("ok", True) and result.get("error"):
                    return self._json(502, result)
                payment = apply_result_to_payment(payment, result)
                payments[idx] = payment
                write_payments(payments)
                append_payment_attempt(
                    pid,
                    payment["status"],
                    {"action": action},
                    {"status": result.get("status"), "message": result.get("message")},
                )
                return self._json(200, {"ok": True, "payment": payment, "result": result})

            return self._json(400, {"error": "invalid_action"})

        return self._json(404, {"error": "unknown_route", "route": route})


def main():
    ensure_files()
    if not SECRET.exists():
        print(f"[api] WARNING: missing {SECRET}")
    else:
        print(f"[api] passwords loaded from {SECRET}")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[api] Miiziito API on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
