"""JSON document helpers for payment terminals, payments, and attempts."""

from __future__ import annotations

import secrets
import time
from typing import Any, Callable


def now_ms() -> int:
    return int(time.time() * 1000)


def new_terminal_id() -> str:
    return f"term_{secrets.token_hex(8)}"


def new_payment_id() -> str:
    return f"pay_{secrets.token_hex(8)}"


def new_attempt_id() -> str:
    return f"pat_{secrets.token_hex(8)}"


PROVIDERS = {
    "simulator",
    "generic",
    "radian",
    "behpardakht",
    "saman",
    "irankish",
    "pasargad",
}
CONNECTION_TYPES = {"network", "usb", "serial", "bluetooth", "android"}
PROTOCOLS = {"tcp", "http", "https", "websocket", "vendor"}
PAYMENT_STATUSES = {
    "CREATED",
    "INITIATED",
    "SENT_TO_TERMINAL",
    "SUCCESS",
    "FAILED",
    "CANCELLED",
    "REVERSED",
    "UNKNOWN",
    "PENDING",
}


def clip(text: Any, n: int) -> str:
    s = str(text or "").strip()
    return s[:n] if len(s) > n else s


def normalize_terminal(raw: dict, fallback_id: str = "") -> dict:
    if not isinstance(raw, dict):
        raw = {}
    provider = str(raw.get("provider") or "generic").strip().lower()
    if provider not in PROVIDERS:
        provider = "generic"
    conn = str(raw.get("connectionType") or raw.get("connection") or "network").strip().lower()
    if conn not in CONNECTION_TYPES:
        conn = "network"
    protocol = str(raw.get("protocol") or "tcp").strip().lower()
    if protocol not in PROTOCOLS:
        protocol = "tcp"
    tid = str(raw.get("id") or fallback_id or new_terminal_id()).strip()
    created = int(raw.get("createdAt") or 0) or now_ms()
    cfg = raw.get("configuration") if isinstance(raw.get("configuration"), dict) else {}
    try:
        baud = int(raw.get("baudRate") or 9600)
    except (TypeError, ValueError):
        baud = 9600
    try:
        data_bits = int(raw.get("dataBits") or 8)
    except (TypeError, ValueError):
        data_bits = 8
    try:
        stop_bits = float(raw.get("stopBits") or 1)
    except (TypeError, ValueError):
        stop_bits = 1
    try:
        cto = int(raw.get("connectionTimeoutMs") or 5000)
    except (TypeError, ValueError):
        cto = 5000
    try:
        rto = int(raw.get("requestTimeoutMs") or 60000)
    except (TypeError, ValueError):
        rto = 60000
    name = clip(raw.get("name"), 80) or "پایانه بدون نام"
    return {
        "id": tid,
        "name": name,
        "provider": provider,
        "model": clip(raw.get("model"), 80),
        "connectionType": conn,
        "host": clip(raw.get("host") or raw.get("address"), 120),
        "port": clip(raw.get("port"), 20),
        "protocol": protocol,
        "serialPort": clip(raw.get("serialPort"), 120),
        "baudRate": baud,
        "dataBits": data_bits,
        "parity": clip(raw.get("parity") or "none", 16),
        "stopBits": stop_bits,
        "flowControl": clip(raw.get("flowControl") or "none", 16),
        "bluetoothIdentifier": clip(raw.get("bluetoothIdentifier"), 120),
        "configuration": cfg,
        "isActive": bool(raw.get("isActive", raw.get("enabled", True))),
        "isDefault": bool(raw.get("isDefault")),
        "stationId": clip(raw.get("stationId"), 64),
        "assignedUserId": clip(raw.get("assignedUserId"), 64),
        "connectionTimeoutMs": max(500, min(cto, 120000)),
        "requestTimeoutMs": max(1000, min(rto, 300000)),
        "createdAt": created,
        "updatedAt": now_ms(),
    }


def find_terminal_index(terminals: list, tid: str) -> int:
    tid = str(tid or "").strip()
    for i, row in enumerate(terminals or []):
        if isinstance(row, dict) and str(row.get("id") or "") == tid:
            return i
    return -1


def sort_terminals(terminals: list) -> list:
    rows = [normalize_terminal(r) for r in (terminals or []) if isinstance(r, dict)]
    rows.sort(key=lambda r: (0 if r.get("isDefault") else 1, r.get("name") or "", r.get("id") or ""))
    return rows


def clear_defaults(terminals: list, except_id: str = "") -> list:
    out = []
    for row in terminals or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("id") or "") == except_id:
            out.append(row)
        else:
            out.append(normalize_terminal({**row, "isDefault": False}))
    return out


def normalize_payment(raw: dict, fallback_id: str = "") -> dict:
    if not isinstance(raw, dict):
        raw = {}
    status = str(raw.get("status") or "CREATED").upper()
    if status not in PAYMENT_STATUSES:
        status = "CREATED"
    currency = str(raw.get("currency") or "IRT").upper()
    if currency not in ("IRT", "IRR"):
        currency = "IRT"
    pid = str(raw.get("id") or fallback_id or new_payment_id()).strip()
    created = int(raw.get("createdAt") or 0) or now_ms()
    try:
        amount = int(raw.get("amount") or 0)
    except (TypeError, ValueError):
        amount = 0
    return {
        "id": pid,
        "invoiceId": clip(raw.get("invoiceId"), 64),
        "terminalId": clip(raw.get("terminalId"), 64),
        "provider": clip(raw.get("provider"), 32),
        "amount": amount,
        "currency": currency,
        "status": status,
        "providerTransactionId": clip(raw.get("providerTransactionId"), 80) or None,
        "referenceNumber": clip(raw.get("referenceNumber"), 80) or None,
        "responseCode": clip(raw.get("responseCode"), 32) or None,
        "failureReason": clip(raw.get("failureReason"), 240) or None,
        "merchantReference": clip(raw.get("merchantReference"), 80) or None,
        "message": clip(raw.get("message"), 240) or None,
        "createdAt": created,
        "updatedAt": now_ms(),
    }


def find_payment(payments: list, pid: str) -> tuple[int, dict | None]:
    pid = str(pid or "").strip()
    for i, row in enumerate(payments or []):
        if isinstance(row, dict) and str(row.get("id") or "") == pid:
            return i, row
    return -1, None


def normalize_attempt(raw: dict, fallback_id: str = "") -> dict:
    if not isinstance(raw, dict):
        raw = {}
    return {
        "id": str(raw.get("id") or fallback_id or new_attempt_id()),
        "paymentId": clip(raw.get("paymentId"), 64),
        "attemptNumber": int(raw.get("attemptNumber") or 1),
        "status": clip(raw.get("status"), 32),
        "requestMetadata": raw.get("requestMetadata")
        if isinstance(raw.get("requestMetadata"), dict)
        else {},
        "responseMetadata": _sanitize_meta(raw.get("responseMetadata")),
        "startedAt": int(raw.get("startedAt") or now_ms()),
        "completedAt": int(raw.get("completedAt") or 0) or None,
    }


SENSITIVE_KEYS = {
    "pan",
    "cvv",
    "pin",
    "track",
    "track1",
    "track2",
    "cardNumber",
    "card_number",
    "expiry",
}


def _sanitize_meta(raw: Any) -> dict:
    if not isinstance(raw, dict):
        return {}
    out = {}
    for k, v in raw.items():
        if str(k).lower() in SENSITIVE_KEYS:
            continue
        if isinstance(v, dict):
            out[k] = _sanitize_meta(v)
        else:
            out[k] = v
    return out


def apply_result_to_payment(payment: dict, result: dict) -> dict:
    status = str(result.get("status") or payment.get("status") or "UNKNOWN").upper()
    if status not in PAYMENT_STATUSES:
        status = "UNKNOWN"
    payment = normalize_payment(
        {
            **payment,
            "status": status,
            "providerTransactionId": result.get("providerTransactionId")
            or payment.get("providerTransactionId"),
            "referenceNumber": result.get("referenceNumber") or payment.get("referenceNumber"),
            "responseCode": result.get("responseCode") or payment.get("responseCode"),
            "message": result.get("message") or payment.get("message"),
            "failureReason": result.get("message")
            if status in ("FAILED", "CANCELLED")
            else payment.get("failureReason"),
        }
    )
    return payment


def next_attempt_number(attempts: list, payment_id: str) -> int:
    n = 0
    for row in attempts or []:
        if isinstance(row, dict) and str(row.get("paymentId") or "") == payment_id:
            n = max(n, int(row.get("attemptNumber") or 0))
    return n + 1


def can_retry_sale(payment: dict) -> bool:
    """Only allow another sale if terminal never got a successful/unknown-sent tx."""
    status = str(payment.get("status") or "")
    if status in ("SUCCESS", "REVERSED"):
        return False
    if status in ("UNKNOWN", "SENT_TO_TERMINAL", "INITIATED", "PENDING"):
        return False  # must inquire first
    return status in ("CREATED", "FAILED", "CANCELLED")
