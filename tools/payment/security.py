"""Local agent security helpers for payment endpoints."""

from __future__ import annotations

import os
import time
from collections import defaultdict
from typing import Optional

_rate: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW_S = 60.0
_RATE_MAX = 60


def agent_token() -> str:
    return (
        os.environ.get("MIIZIITO_PAYMENT_AGENT_TOKEN")
        or os.environ.get("MIIZIITO_AGENT_TOKEN")
        or ""
    ).strip()


def check_agent_request(
    headers: dict,
    body: Optional[dict] = None,
    *,
    remote_addr: str = "",
) -> Optional[dict]:
    """Return error dict if request should be rejected, else None."""
    token_required = agent_token()
    if token_required:
        got = (
            headers.get("X-Payment-Agent-Token")
            or headers.get("x-payment-agent-token")
            or (body or {}).get("agentToken")
            or ""
        )
        if str(got).strip() != token_required:
            return {"ok": False, "error": "AUTH_REQUIRED", "message": "Invalid agent token"}

    # Prefer localhost; warn-style allow when bound broadly in dev.
    if remote_addr and remote_addr not in ("127.0.0.1", "::1", "localhost", ""):
        allow_remote = os.environ.get("MIIZIITO_PAYMENT_ALLOW_REMOTE", "").strip() in (
            "1",
            "true",
            "yes",
        )
        if not allow_remote:
            return {
                "ok": False,
                "error": "AUTH_REQUIRED",
                "message": "Payment agent only accepts localhost",
            }

    origin = headers.get("Origin") or headers.get("origin") or ""
    if origin:
        allowed = os.environ.get("MIIZIITO_PAYMENT_ALLOWED_ORIGINS", "").strip()
        if allowed:
            parts = [p.strip() for p in allowed.split(",") if p.strip()]
            if parts and origin not in parts:
                return {
                    "ok": False,
                    "error": "AUTH_REQUIRED",
                    "message": "Origin not allowed",
                }
    return None


def rate_limit_ok(key: str) -> bool:
    now = time.time()
    bucket = _rate[key]
    _rate[key] = [t for t in bucket if now - t < _RATE_WINDOW_S]
    if len(_rate[key]) >= _RATE_MAX:
        return False
    _rate[key].append(now)
    return True


def validate_amount(amount: int) -> Optional[dict]:
    if not isinstance(amount, int):
        try:
            amount = int(amount)
        except (TypeError, ValueError):
            return {"ok": False, "error": "INVALID_AMOUNT", "message": "Amount must be an integer"}
    if amount <= 0:
        return {"ok": False, "error": "INVALID_AMOUNT", "message": "Amount must be positive"}
    if amount > 10_000_000_000:
        return {"ok": False, "error": "INVALID_AMOUNT", "message": "Amount too large"}
    return None
