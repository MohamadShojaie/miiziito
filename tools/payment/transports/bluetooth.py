"""Bluetooth transport shell — discovery and protocol are separate concerns."""

from __future__ import annotations


class BluetoothTransport:
    kind = "bluetooth"

    def __init__(self, identifier: str = "", *, timeout: float = 5.0):
        self.identifier = str(identifier or "").strip()
        self.timeout = float(timeout)

    def connect(self) -> None:
        raise OSError(
            "Bluetooth payment transport requires a configured provider/OS integration"
        )

    def disconnect(self) -> None:
        return None

    def test_reachability(self) -> dict:
        if not self.identifier:
            return {
                "ok": False,
                "type": "bluetooth",
                "message": "bluetooth identifier required",
            }
        return {
            "ok": False,
            "type": "bluetooth",
            "identifier": self.identifier,
            "message": "Bluetooth payment requires vendor/OS adapter — not configured",
            "error": "NOT_CONFIGURED",
        }
