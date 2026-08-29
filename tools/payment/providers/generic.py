"""Generic network adapter — reachability only; no invented payment protocol."""

from __future__ import annotations

from ..discovery import discover_network
from ..transports.network import tcp_reachable
from ..types import PaymentError, PaymentRequest, PaymentResult
from .base import NotConfiguredProvider, utc_now_iso


class GenericNetworkProvider(NotConfiguredProvider):
    id = "generic"
    name = "عمومی / شبکه"
    configured = False

    def __init__(self):
        super().__init__("generic", self.name)

    def discover(self, **kwargs) -> dict:
        return discover_network(
            host=str(kwargs.get("host") or ""),
            port=int(kwargs.get("port") or 0),
            hosts=kwargs.get("hosts"),
        )

    def test_connection(self, terminal: dict) -> dict:
        conn = str(terminal.get("connectionType") or "network").lower()
        if conn != "network":
            return {
                "ok": False,
                "error": "NOT_CONFIGURED",
                "message": "Generic adapter only supports network reachability tests",
            }
        host = str(terminal.get("host") or "").strip()
        try:
            port = int(terminal.get("port") or 0)
        except (TypeError, ValueError):
            port = 0
        timeout = float(terminal.get("connectionTimeoutMs") or 5000) / 1000.0
        if not host or port <= 0:
            return {
                "ok": False,
                "error": "VALIDATION_ERROR",
                "message": "Host and port are required",
            }
        ok = tcp_reachable(host, port, timeout=timeout)
        return {
            "ok": ok,
            "message": "Host reachable (protocol not verified)" if ok else "Host unreachable",
            "details": {"host": host, "port": port, "reachabilityOnly": True},
            "error": None if ok else "TERMINAL_OFFLINE",
        }

    def sale(self, request: PaymentRequest, terminal: dict) -> PaymentResult:
        # Reachability before send — offline ≠ unknown
        host = str(terminal.get("host") or "").strip()
        try:
            port = int(terminal.get("port") or 0)
        except (TypeError, ValueError):
            port = 0
        if host and port > 0 and not tcp_reachable(host, port, timeout=2.0):
            return PaymentResult(
                success=False,
                status="FAILED",
                payment_id=request.payment_id,
                invoice_id=request.invoice_id,
                amount=request.amount,
                terminal_id=request.terminal_id,
                timestamp=utc_now_iso(),
                message="Terminal unreachable before payment",
                error_code="TERMINAL_OFFLINE",
            )
        raise PaymentError(
            "NOT_CONFIGURED",
            "Generic network adapter has no payment protocol — configure a real PSP adapter",
        )
