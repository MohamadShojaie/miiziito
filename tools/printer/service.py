"""High-level thermal printer service (discover → test → save → print)."""

from __future__ import annotations

import logging
import time
from typing import Optional

from .connections import PrinterError, connection_for, send_bytes
from .discovery import (
    discover_bluetooth_printers,
    discover_network_printers,
    discover_usb_printers,
    host_capabilities,
)
from .escpos import generate_receipt, generate_test_receipt

log = logging.getLogger("miiziito.printer")


def fingerprint(printer: dict) -> str:
    kind = str((printer or {}).get("connection") or "network").lower()
    address = str((printer or {}).get("address") or "").strip().lower()
    port = str((printer or {}).get("port") or "").strip()
    vid = str((printer or {}).get("vendorId") or "").strip().lower()
    pid = str((printer or {}).get("productId") or "").strip().lower()
    queue = str((printer or {}).get("cupsQueue") or "").strip().lower()
    if kind == "network":
        return f"net|{address}|{port or '9100'}"
    if kind == "bluetooth":
        return f"bt|{address}"
    if kind == "usb":
        if queue:
            return f"cups|{queue}"
        if vid or pid:
            return f"usb|{vid}|{pid}|{address}"
        return f"usb|{address}"
    return f"{kind}|{address}|{port}"


def get_saved_printers(devices: list) -> list:
    out = []
    for row in devices or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("type") or "") in (
            "kitchen_printer",
            "bar_printer",
            "receipt_printer",
        ):
            out.append(row)
    return out


def save_printer(devices: list, printer: dict, normalize_fn) -> tuple[list, dict, Optional[str]]:
    """Append or reject duplicate. Returns (devices, record, error)."""
    devices = list(devices or [])
    fp = fingerprint(printer)
    for row in devices:
        if not isinstance(row, dict):
            continue
        if fingerprint(row) == fp:
            return devices, row, "duplicate"
    record = normalize_fn(printer)
    if printer.get("isDefault"):
        for i, row in enumerate(devices):
            if isinstance(row, dict):
                devices[i] = normalize_fn({**row, "isDefault": False})
        record = normalize_fn({**record, "isDefault": True})
    devices.append(record)
    return devices, record, None


def update_printer(devices: list, printer_id: str, patch: dict, normalize_fn) -> tuple[list, Optional[dict], Optional[str]]:
    devices = list(devices or [])
    idx = -1
    for i, row in enumerate(devices):
        if isinstance(row, dict) and str(row.get("id") or "") == str(printer_id):
            idx = i
            break
    if idx < 0:
        return devices, None, "not_found"
    cur = devices[idx]
    merged = {**cur, **(patch or {}), "id": printer_id, "createdAt": cur.get("createdAt")}
    if merged.get("isDefault"):
        for i, row in enumerate(devices):
            if i == idx or not isinstance(row, dict):
                continue
            devices[i] = normalize_fn({**row, "isDefault": False})
    record = normalize_fn(merged)
    # duplicate check against others
    fp = fingerprint(record)
    for i, row in enumerate(devices):
        if i == idx or not isinstance(row, dict):
            continue
        if fingerprint(row) == fp:
            return devices, None, "duplicate"
    devices[idx] = record
    return devices, record, None


def delete_printer(devices: list, printer_id: str) -> tuple[list, bool]:
    devices = list(devices or [])
    next_rows = [r for r in devices if not (isinstance(r, dict) and str(r.get("id") or "") == str(printer_id))]
    return next_rows, len(next_rows) != len(devices)


def _resolve_printer(devices: list, body: dict) -> tuple[Optional[dict], Optional[str]]:
    if body.get("printer") and isinstance(body.get("printer"), dict):
        return body["printer"], None
    pid = str(body.get("printerId") or body.get("id") or "").strip()
    if pid:
        for row in devices or []:
            if isinstance(row, dict) and str(row.get("id") or "") == pid:
                return row, None
        return None, "not_found"
    # default receipt printer
    printers = get_saved_printers(devices)
    for row in printers:
        if row.get("isDefault") and row.get("enabled", True):
            return row, None
    for row in printers:
        if row.get("type") == "receipt_printer" and row.get("enabled", True):
            return row, None
    for row in printers:
        if row.get("enabled", True):
            return row, None
    return None, "no_printer"


def test_printer(devices: list, body: dict) -> dict:
    printer, err = _resolve_printer(devices, body)
    if err or not printer:
        return {"ok": False, "error": err or "unavailable", "message": "Printer not found"}
    paper = str(printer.get("paperWidth") or body.get("paperWidth") or "80")
    code_page = str(printer.get("codePage") or body.get("codePage") or "utf8")
    payload = generate_test_receipt(
        connection_type=str(printer.get("connection") or "network"),
        paper_width=paper,
        code_page=code_page,
    )
    result = connection_for(printer).test_connection(payload)
    result["printer"] = {
        "id": printer.get("id"),
        "name": printer.get("name"),
        "connection": printer.get("connection"),
        "address": printer.get("address"),
    }
    return result


def print_receipt(devices: list, body: dict) -> dict:
    printer, err = _resolve_printer(devices, body)
    if err or not printer:
        return {"ok": False, "error": err or "unavailable", "message": "Printer not found"}
    if printer.get("enabled") is False:
        return {"ok": False, "error": "disabled", "message": "Printer is disabled"}

    payload = b""
    if body.get("bytesBase64"):
        import base64

        try:
            payload = base64.b64decode(str(body.get("bytesBase64") or ""), validate=False)
        except Exception:
            return {"ok": False, "error": "bad_payload", "message": "Invalid ESC/POS payload"}
    else:
        receipt = body.get("receipt") if isinstance(body.get("receipt"), dict) else {}
        if not receipt.get("paperWidth"):
            receipt = {**receipt, "paperWidth": printer.get("paperWidth") or "80"}
        if not receipt.get("codePage"):
            receipt = {**receipt, "codePage": printer.get("codePage") or "utf8"}
        payload = generate_receipt(receipt)

    copies = max(1, min(9, int(body.get("copies") or printer.get("copies") or 1)))
    last = None
    for _ in range(copies):
        last = send_bytes(printer, payload)
        if not last.get("ok"):
            return last
        time.sleep(0.05)
    return last or {"ok": False, "error": "communication_error"}


def discover(kind: str) -> dict:
    kind = str(kind or "network").lower()
    if kind == "bluetooth":
        return discover_bluetooth_printers()
    if kind == "usb":
        return discover_usb_printers()
    return discover_network_printers()


def capabilities() -> dict:
    return {"ok": True, "capabilities": host_capabilities()}
