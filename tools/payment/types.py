"""Shared payment types. Amounts are IRT (toman) integers at the domain layer."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


PAYMENT_STATUSES = (
    "CREATED",
    "INITIATED",
    "SENT_TO_TERMINAL",
    "SUCCESS",
    "FAILED",
    "CANCELLED",
    "REVERSED",
    "UNKNOWN",
    "PENDING",
)

CONNECTION_TYPES = ("network", "usb", "serial", "bluetooth", "android")
PROTOCOLS = ("tcp", "http", "https", "websocket", "vendor")


@dataclass
class PaymentRequest:
    payment_id: str
    invoice_id: str
    amount: int
    currency: str  # IRT | IRR
    terminal_id: str
    created_at: str
    merchant_reference: str = ""
    metadata: dict = field(default_factory=dict)

    @classmethod
    def from_dict(cls, raw: dict) -> "PaymentRequest":
        return cls(
            payment_id=str(raw.get("paymentId") or raw.get("payment_id") or ""),
            invoice_id=str(raw.get("invoiceId") or raw.get("invoice_id") or ""),
            amount=int(raw.get("amount") or 0),
            currency=str(raw.get("currency") or "IRT"),
            terminal_id=str(raw.get("terminalId") or raw.get("terminal_id") or ""),
            created_at=str(raw.get("createdAt") or raw.get("created_at") or ""),
            merchant_reference=str(
                raw.get("merchantReference") or raw.get("merchant_reference") or ""
            ),
            metadata=dict(raw.get("metadata") or {})
            if isinstance(raw.get("metadata"), dict)
            else {},
        )


@dataclass
class PaymentResult:
    success: bool
    status: str
    payment_id: str
    invoice_id: str
    amount: int
    terminal_id: str
    timestamp: str
    provider_transaction_id: Optional[str] = None
    reference_number: Optional[str] = None
    response_code: Optional[str] = None
    message: Optional[str] = None
    raw_response: Any = None
    error_code: Optional[str] = None

    def as_dict(self) -> dict:
        return {
            "success": self.success,
            "status": self.status,
            "paymentId": self.payment_id,
            "invoiceId": self.invoice_id,
            "amount": self.amount,
            "providerTransactionId": self.provider_transaction_id,
            "referenceNumber": self.reference_number,
            "terminalId": self.terminal_id,
            "responseCode": self.response_code,
            "message": self.message,
            "timestamp": self.timestamp,
            "rawResponse": self.raw_response,
            "errorCode": self.error_code,
        }


class PaymentError(Exception):
    def __init__(self, code: str, message: str, details: Optional[dict] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}

    def as_dict(self) -> dict:
        return {
            "ok": False,
            "error": self.code,
            "message": self.message,
            "details": self.details,
        }
