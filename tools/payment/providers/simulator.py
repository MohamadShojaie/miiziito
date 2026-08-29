"""Development simulator — proves routing/state machine without inventing PSP APIs."""

from __future__ import annotations

import secrets
import time
from typing import Any

from ..types import PaymentRequest, PaymentResult
from .base import PaymentProvider, utc_now_iso

# In-memory ledger for inquiry after simulated sales
_LEDGER: dict[str, PaymentResult] = {}


class SimulatorProvider(PaymentProvider):
    id = "simulator"
    name = "شبیه‌ساز (توسعه)"
    configured = True

    def discover(self, **kwargs) -> dict:
        return {
            "ok": True,
            "type": "simulator",
            "devices": [
                {
                    "connectionType": "network",
                    "host": "127.0.0.1",
                    "port": 0,
                    "label": "Simulator Terminal",
                    "status": "online",
                    "provider": "simulator",
                }
            ],
        }

    def test_connection(self, terminal: dict) -> dict:
        return {
            "ok": True,
            "message": "Simulator ready (no financial transaction)",
            "details": {"provider": "simulator", "terminalId": terminal.get("id")},
        }

    def sale(self, request: PaymentRequest, terminal: dict) -> PaymentResult:
        meta = request.metadata or {}
        mode = str(meta.get("simulate") or terminal.get("configuration", {}).get("simulate") or "success").lower()
        delay_ms = int(meta.get("delayMs") or terminal.get("configuration", {}).get("delayMs") or 400)
        if delay_ms > 0:
            time.sleep(min(delay_ms, 5000) / 1000.0)

        if mode == "offline":
            result = PaymentResult(
                success=False,
                status="FAILED",
                payment_id=request.payment_id,
                invoice_id=request.invoice_id,
                amount=request.amount,
                terminal_id=request.terminal_id,
                timestamp=utc_now_iso(),
                message="Simulated terminal offline",
                error_code="TERMINAL_OFFLINE",
            )
            _LEDGER[request.payment_id] = result
            return result

        if mode == "timeout" or mode == "unknown":
            # Pretend request was sent but response lost
            pending = PaymentResult(
                success=False,
                status="UNKNOWN",
                payment_id=request.payment_id,
                invoice_id=request.invoice_id,
                amount=request.amount,
                terminal_id=request.terminal_id,
                timestamp=utc_now_iso(),
                message="Simulated timeout — result unknown",
                error_code="UNKNOWN_RESULT",
                provider_transaction_id=f"sim_{secrets.token_hex(6)}",
                reference_number=str(secrets.randbelow(900000) + 100000),
            )
            # Ledger stores eventual success so inquiry can resolve
            eventual = PaymentResult(
                success=True,
                status="SUCCESS",
                payment_id=request.payment_id,
                invoice_id=request.invoice_id,
                amount=request.amount,
                terminal_id=request.terminal_id,
                timestamp=utc_now_iso(),
                message="Simulated success after inquiry",
                provider_transaction_id=pending.provider_transaction_id,
                reference_number=pending.reference_number,
                response_code="00",
            )
            _LEDGER[request.payment_id] = eventual
            return pending

        if mode == "fail" or mode == "failed":
            result = PaymentResult(
                success=False,
                status="FAILED",
                payment_id=request.payment_id,
                invoice_id=request.invoice_id,
                amount=request.amount,
                terminal_id=request.terminal_id,
                timestamp=utc_now_iso(),
                message="Simulated decline",
                response_code="05",
                error_code="PROVIDER_ERROR",
            )
            _LEDGER[request.payment_id] = result
            return result

        result = PaymentResult(
            success=True,
            status="SUCCESS",
            payment_id=request.payment_id,
            invoice_id=request.invoice_id,
            amount=request.amount,
            terminal_id=request.terminal_id,
            timestamp=utc_now_iso(),
            message="Simulated approval",
            provider_transaction_id=f"sim_{secrets.token_hex(6)}",
            reference_number=str(secrets.randbelow(900000) + 100000),
            response_code="00",
        )
        _LEDGER[request.payment_id] = result
        return result

    def inquiry(self, payment_id: str, terminal: dict, context: dict | None = None) -> PaymentResult:
        existing = _LEDGER.get(payment_id)
        if existing:
            return existing
        inv = ""
        amount = 0
        tid = str((terminal or {}).get("id") or "")
        if context:
            inv = str(context.get("invoiceId") or "")
            amount = int(context.get("amount") or 0)
        return PaymentResult(
            success=False,
            status="FAILED",
            payment_id=payment_id,
            invoice_id=inv,
            amount=amount,
            terminal_id=tid,
            timestamp=utc_now_iso(),
            message="No simulated transaction found",
            response_code="NOT_FOUND",
        )

    def cancel(self, payment_id: str, terminal: dict, context: dict | None = None) -> PaymentResult:
        result = PaymentResult(
            success=True,
            status="CANCELLED",
            payment_id=payment_id,
            invoice_id=str((context or {}).get("invoiceId") or ""),
            amount=int((context or {}).get("amount") or 0),
            terminal_id=str((terminal or {}).get("id") or ""),
            timestamp=utc_now_iso(),
            message="Simulated cancel",
        )
        _LEDGER[payment_id] = result
        return result

    def reversal(self, payment_id: str, terminal: dict, context: dict | None = None) -> PaymentResult:
        result = PaymentResult(
            success=True,
            status="REVERSED",
            payment_id=payment_id,
            invoice_id=str((context or {}).get("invoiceId") or ""),
            amount=int((context or {}).get("amount") or 0),
            terminal_id=str((terminal or {}).get("id") or ""),
            timestamp=utc_now_iso(),
            message="Simulated reversal",
        )
        _LEDGER[payment_id] = result
        return result
