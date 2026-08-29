"""Payment provider ABC. Concrete PSPs must use official docs — never invent protocols."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any

from ..types import PaymentError, PaymentRequest, PaymentResult


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class PaymentProvider(ABC):
    id: str = "base"
    name: str = "Base"
    configured: bool = False

    @abstractmethod
    def discover(self, **kwargs) -> dict:
        raise NotImplementedError

    @abstractmethod
    def test_connection(self, terminal: dict) -> dict:
        raise NotImplementedError

    @abstractmethod
    def sale(self, request: PaymentRequest, terminal: dict) -> PaymentResult:
        raise NotImplementedError

    @abstractmethod
    def inquiry(self, payment_id: str, terminal: dict, context: dict | None = None) -> PaymentResult:
        raise NotImplementedError

    def cancel(self, payment_id: str, terminal: dict, context: dict | None = None) -> PaymentResult:
        raise PaymentError("NOT_CONFIGURED", f"{self.name} cancel is not configured")

    def reversal(self, payment_id: str, terminal: dict, context: dict | None = None) -> PaymentResult:
        raise PaymentError("NOT_CONFIGURED", f"{self.name} reversal is not configured")

    def refund(self, payment_id: str, terminal: dict, context: dict | None = None) -> PaymentResult:
        raise PaymentError("NOT_CONFIGURED", f"{self.name} refund is not configured")

    def meta(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "configured": self.configured,
        }


class NotConfiguredProvider(PaymentProvider):
    configured = False

    def __init__(self, provider_id: str, name: str = ""):
        self.id = provider_id
        self.name = name or provider_id

    def discover(self, **kwargs) -> dict:
        return {
            "ok": True,
            "devices": [],
            "message": f"{self.name} discovery requires official integration documentation.",
        }

    def test_connection(self, terminal: dict) -> dict:
        return {
            "ok": False,
            "error": "NOT_CONFIGURED",
            "message": f"{self.name} is not configured — provide official SDK/docs before enabling.",
        }

    def sale(self, request: PaymentRequest, terminal: dict) -> PaymentResult:
        raise PaymentError(
            "NOT_CONFIGURED",
            f"{self.name} payment protocol is not configured",
        )

    def inquiry(self, payment_id: str, terminal: dict, context: dict | None = None) -> PaymentResult:
        raise PaymentError(
            "NOT_CONFIGURED",
            f"{self.name} inquiry is not configured",
        )
