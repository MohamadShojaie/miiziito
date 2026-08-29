"""TerminalManager — selects provider adapters; POS never branches on PSP."""

from __future__ import annotations

import logging
from typing import Any, Optional

from . import discovery as discovery_mod
from .providers import PROVIDERS, get_provider
from .security import validate_amount
from .types import PaymentError, PaymentRequest, PaymentResult

log = logging.getLogger("miiziito.payment")

PROVIDER_META = [p.meta() for p in PROVIDERS.values()]


def list_providers() -> list[dict]:
    return [p.meta() for p in PROVIDERS.values()]


def health() -> dict:
    return {
        "ok": True,
        "payment": True,
        "providers": list_providers(),
        "message": "Payment agent ready",
    }


def _find_terminal(terminals: list, terminal_id: str) -> Optional[dict]:
    tid = str(terminal_id or "").strip()
    for row in terminals or []:
        if isinstance(row, dict) and str(row.get("id") or "") == tid:
            return row
    return None


def _default_terminal(terminals: list, station_id: str = "") -> Optional[dict]:
    active = [t for t in (terminals or []) if isinstance(t, dict) and t.get("isActive", True)]
    if station_id:
        for t in active:
            if str(t.get("stationId") or "") == station_id:
                return t
    for t in active:
        if t.get("isDefault"):
            return t
    return active[0] if active else None


def _allowlist_ok(terminal: dict, terminals: list) -> bool:
    tid = str(terminal.get("id") or "")
    for row in terminals or []:
        if isinstance(row, dict) and str(row.get("id") or "") == tid:
            return bool(row.get("isActive", True))
    return False


def discover(kind: str = "network", provider: str = "", **kwargs) -> dict:
    if provider:
        try:
            return get_provider(provider).discover(**kwargs)
        except Exception as exc:
            log.warning("provider discover failed provider=%s err=%s", provider, exc)
    return discovery_mod.discover(kind, **kwargs)


def test_connection(terminals: list, body: dict) -> dict:
    tid = str(body.get("terminalId") or body.get("id") or "").strip()
    terminal = body.get("terminal") if isinstance(body.get("terminal"), dict) else None
    if not terminal:
        terminal = _find_terminal(terminals, tid)
    if not terminal:
        return {"ok": False, "error": "TERMINAL_NOT_FOUND", "message": "Terminal not found"}
    if not terminal.get("isActive", True):
        return {"ok": False, "error": "TERMINAL_DISABLED", "message": "Terminal disabled"}
    provider = get_provider(str(terminal.get("provider") or "generic"))
    try:
        result = provider.test_connection(terminal)
        log.info(
            "payment test terminal=%s provider=%s ok=%s",
            terminal.get("id"),
            provider.id,
            result.get("ok"),
        )
        return result
    except PaymentError as exc:
        return exc.as_dict()
    except Exception as exc:
        log.exception("payment test failed")
        return {"ok": False, "error": "PROVIDER_ERROR", "message": str(exc)}


def sale(terminals: list, body: dict) -> dict:
    """Execute sale via configured adapter. Returns PaymentResult dict (+ optional error)."""
    amount_err = validate_amount(int(body.get("amount") or 0))
    if amount_err:
        return amount_err

    tid = str(body.get("terminalId") or "").strip()
    terminal = _find_terminal(terminals, tid) if tid else _default_terminal(
        terminals, str(body.get("stationId") or "")
    )
    if not terminal:
        return {"ok": False, "error": "TERMINAL_NOT_FOUND", "message": "No payment terminal configured"}
    if not _allowlist_ok(terminal, terminals):
        return {"ok": False, "error": "TERMINAL_DISABLED", "message": "Terminal not in allowlist / disabled"}

    request = PaymentRequest.from_dict(
        {
            **body,
            "terminalId": terminal.get("id"),
            "currency": body.get("currency") or "IRT",
        }
    )
    if not request.payment_id:
        return {"ok": False, "error": "VALIDATION_ERROR", "message": "paymentId required"}
    if request.currency not in ("IRT", "IRR"):
        return {"ok": False, "error": "VALIDATION_ERROR", "message": "currency must be IRT or IRR"}
    # Domain amounts are IRT; adapters convert if needed — reject silent mix-ups
    if request.amount <= 0:
        return {"ok": False, "error": "INVALID_AMOUNT", "message": "Amount must be positive"}

    provider = get_provider(str(terminal.get("provider") or "generic"))
    log.info(
        "payment sale start paymentId=%s invoiceId=%s terminal=%s provider=%s amount=%s",
        request.payment_id,
        request.invoice_id,
        terminal.get("id"),
        provider.id,
        request.amount,
    )
    try:
        result = provider.sale(request, terminal)
        log.info(
            "payment sale done paymentId=%s status=%s ref=%s",
            request.payment_id,
            result.status,
            result.reference_number,
        )
        out = result.as_dict()
        out["ok"] = True
        out["sentToTerminal"] = result.status != "FAILED" or result.error_code != "TERMINAL_OFFLINE"
        return out
    except PaymentError as exc:
        log.warning("payment sale error code=%s msg=%s", exc.code, exc.message)
        # NOT_CONFIGURED / offline before send → failed, not unknown
        status = "FAILED"
        return {
            "ok": False,
            "success": False,
            "status": status,
            "paymentId": request.payment_id,
            "invoiceId": request.invoice_id,
            "amount": request.amount,
            "terminalId": request.terminal_id,
            "error": exc.code,
            "errorCode": exc.code,
            "message": exc.message,
            "sentToTerminal": False,
        }
    except TimeoutError:
        log.warning("payment sale timeout paymentId=%s", request.payment_id)
        return {
            "ok": True,
            "success": False,
            "status": "UNKNOWN",
            "paymentId": request.payment_id,
            "invoiceId": request.invoice_id,
            "amount": request.amount,
            "terminalId": request.terminal_id,
            "errorCode": "UNKNOWN_RESULT",
            "message": "Timeout after send — inquiry required",
            "sentToTerminal": True,
        }
    except Exception as exc:
        log.exception("payment sale unexpected")
        # Ambiguous: may have been sent
        return {
            "ok": True,
            "success": False,
            "status": "UNKNOWN",
            "paymentId": request.payment_id,
            "invoiceId": request.invoice_id,
            "amount": request.amount,
            "terminalId": request.terminal_id,
            "errorCode": "UNKNOWN_RESULT",
            "message": str(exc),
            "sentToTerminal": True,
        }


def inquiry_payment(terminals: list, body: dict) -> dict:
    payment_id = str(body.get("paymentId") or "").strip()
    if not payment_id:
        return {"ok": False, "error": "VALIDATION_ERROR", "message": "paymentId required"}
    tid = str(body.get("terminalId") or "").strip()
    terminal = _find_terminal(terminals, tid) if tid else _default_terminal(terminals)
    if not terminal:
        return {"ok": False, "error": "TERMINAL_NOT_FOUND", "message": "Terminal not found"}
    provider = get_provider(str(terminal.get("provider") or "generic"))
    context = {
        "invoiceId": body.get("invoiceId"),
        "amount": body.get("amount"),
    }
    try:
        result = provider.inquiry(payment_id, terminal, context)
        out = result.as_dict()
        out["ok"] = True
        log.info("payment inquiry paymentId=%s status=%s", payment_id, result.status)
        return out
    except PaymentError as exc:
        return exc.as_dict()
    except Exception as exc:
        log.exception("payment inquiry failed")
        return {
            "ok": True,
            "success": False,
            "status": "UNKNOWN",
            "paymentId": payment_id,
            "invoiceId": str(body.get("invoiceId") or ""),
            "amount": int(body.get("amount") or 0),
            "terminalId": str(terminal.get("id") or ""),
            "errorCode": "UNKNOWN_RESULT",
            "message": str(exc),
        }


def cancel_payment(terminals: list, body: dict) -> dict:
    return _lifecycle("cancel", terminals, body)


def reversal_payment(terminals: list, body: dict) -> dict:
    return _lifecycle("reversal", terminals, body)


def _lifecycle(op: str, terminals: list, body: dict) -> dict:
    payment_id = str(body.get("paymentId") or "").strip()
    if not payment_id:
        return {"ok": False, "error": "VALIDATION_ERROR", "message": "paymentId required"}
    tid = str(body.get("terminalId") or "").strip()
    terminal = _find_terminal(terminals, tid) if tid else _default_terminal(terminals)
    if not terminal:
        return {"ok": False, "error": "TERMINAL_NOT_FOUND", "message": "Terminal not found"}
    provider = get_provider(str(terminal.get("provider") or "generic"))
    context = {"invoiceId": body.get("invoiceId"), "amount": body.get("amount")}
    try:
        fn = getattr(provider, op)
        result: PaymentResult = fn(payment_id, terminal, context)
        out = result.as_dict()
        out["ok"] = True
        return out
    except PaymentError as exc:
        return exc.as_dict()
    except Exception as exc:
        return {"ok": False, "error": "PROVIDER_ERROR", "message": str(exc)}
