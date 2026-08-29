"""Generic serial / COM transport. Protocol belongs to the provider adapter."""

from __future__ import annotations

from typing import Optional


class SerialTransport:
    kind = "serial"

    def __init__(
        self,
        port: str,
        *,
        baudrate: int = 9600,
        bytesize: int = 8,
        parity: str = "N",
        stopbits: float = 1,
        timeout: float = 5.0,
    ):
        self.port = str(port or "").strip()
        self.baudrate = int(baudrate or 9600)
        self.bytesize = int(bytesize or 8)
        self.parity = (parity or "N")[0].upper()
        self.stopbits = float(stopbits or 1)
        self.timeout = float(timeout)
        self._ser = None

    def connect(self) -> None:
        if not self.port:
            raise OSError("serial port required")
        try:
            import serial  # type: ignore
        except ImportError as exc:
            raise OSError("pyserial not installed") from exc
        self._ser = serial.Serial(
            port=self.port,
            baudrate=self.baudrate,
            bytesize=self.bytesize,
            parity=self.parity,
            stopbits=self.stopbits,
            timeout=self.timeout,
        )

    def disconnect(self) -> None:
        if self._ser:
            try:
                self._ser.close()
            except Exception:
                pass
            self._ser = None

    def write(self, data: bytes) -> None:
        if not self._ser:
            raise OSError("not connected")
        self._ser.write(data)

    def read(self, max_bytes: int = 4096) -> bytes:
        if not self._ser:
            raise OSError("not connected")
        return self._ser.read(max_bytes)

    def test_reachability(self) -> dict:
        try:
            self.connect()
            return {"ok": True, "type": "serial", "port": self.port, "message": "opened"}
        except OSError as exc:
            return {"ok": False, "type": "serial", "port": self.port, "message": str(exc)}
        finally:
            self.disconnect()
