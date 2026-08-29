"""Printer connection adapters. Bytes in, transport out."""

from __future__ import annotations

import logging
import os
import shutil
import socket
import subprocess
import time
from typing import Optional

log = logging.getLogger("miiziito.printer")


class PrinterError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message

    def as_dict(self) -> dict:
        return {"ok": False, "error": self.code, "message": self.message}


class PrinterConnection:
    kind = "unknown"

    def connect(self) -> None:
        raise NotImplementedError

    def disconnect(self) -> None:
        raise NotImplementedError

    def is_connected(self) -> bool:
        raise NotImplementedError

    def write(self, data: bytes) -> None:
        raise NotImplementedError

    def test_connection(self, payload: bytes) -> dict:
        try:
            self.connect()
            self.write(payload)
            return {"ok": True, "type": self.kind, "bytes": len(payload)}
        except PrinterError as exc:
            log.warning("printer test failed type=%s code=%s", self.kind, exc.code)
            return exc.as_dict()
        except OSError as exc:
            log.warning("printer test oserror type=%s errno=%s", self.kind, getattr(exc, "errno", None))
            return PrinterError("communication_error", "Printer communication failed").as_dict()
        finally:
            try:
                self.disconnect()
            except Exception:
                pass

    def __enter__(self) -> "PrinterConnection":
        self.connect()
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        self.disconnect()
        return False


class NetworkPrinterConnection(PrinterConnection):
    kind = "network"

    def __init__(self, host: str, port: int = 9100, timeout: float = 4.0):
        self.host = str(host or "").strip()
        try:
            self.port = int(port or 9100)
        except (TypeError, ValueError):
            self.port = 9100
        self.timeout = float(timeout)
        self._sock: Optional[socket.socket] = None

    def connect(self) -> None:
        if not self.host:
            raise PrinterError("unavailable", "Network printer address is missing")
        if self._sock:
            return
        try:
            sock = socket.create_connection((self.host, self.port), timeout=self.timeout)
            sock.settimeout(self.timeout)
            self._sock = sock
        except socket.timeout as exc:
            raise PrinterError("timeout", "Network printer timed out") from exc
        except OSError as exc:
            raise PrinterError("unavailable", "Network printer is not reachable") from exc

    def disconnect(self) -> None:
        sock = self._sock
        self._sock = None
        if sock is not None:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                sock.close()
            except OSError:
                pass

    def is_connected(self) -> bool:
        return self._sock is not None

    def write(self, data: bytes) -> None:
        if not self._sock:
            raise PrinterError("unavailable", "Network printer is not connected")
        payload = bytes(data or b"")
        if not payload:
            return
        try:
            self._sock.sendall(payload)
        except socket.timeout as exc:
            raise PrinterError("timeout", "Network printer write timed out") from exc
        except OSError as exc:
            raise PrinterError("communication_error", "Failed to send data to printer") from exc


class BluetoothPrinterConnection(PrinterConnection):
    kind = "bluetooth"

    def __init__(self, address: str, channel: int = 1, timeout: float = 6.0):
        self.address = str(address or "").strip()
        try:
            self.channel = int(channel or 1)
        except (TypeError, ValueError):
            self.channel = 1
        self.timeout = float(timeout)
        self._sock = None

    def connect(self) -> None:
        if not self.address:
            raise PrinterError("unavailable", "Bluetooth printer address is missing")
        if not hasattr(socket, "AF_BLUETOOTH"):
            raise PrinterError(
                "unsupported",
                "Bluetooth SPP is not available on this operating system",
            )
        proto = getattr(socket, "BTPROTO_RFCOMM", 3)
        try:
            sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, proto)
            sock.settimeout(self.timeout)
            sock.connect((self.address, self.channel))
            self._sock = sock
        except PermissionError as exc:
            raise PrinterError("permission", "Bluetooth permission was denied") from exc
        except socket.timeout as exc:
            raise PrinterError("timeout", "Bluetooth printer timed out") from exc
        except OSError as exc:
            raise PrinterError("unavailable", "Bluetooth printer is not reachable") from exc

    def disconnect(self) -> None:
        sock = self._sock
        self._sock = None
        if sock is not None:
            try:
                sock.close()
            except OSError:
                pass

    def is_connected(self) -> bool:
        return self._sock is not None

    def write(self, data: bytes) -> None:
        if not self._sock:
            raise PrinterError("unavailable", "Bluetooth printer is not connected")
        payload = bytes(data or b"")
        if not payload:
            return
        try:
            self._sock.sendall(payload)
        except socket.timeout as exc:
            raise PrinterError("timeout", "Bluetooth printer write timed out") from exc
        except OSError as exc:
            raise PrinterError("communication_error", "Failed to send data over Bluetooth") from exc


class UsbPrinterConnection(PrinterConnection):
    kind = "usb"

    def __init__(self, path: str = "", cups_queue: str = "", timeout: float = 8.0):
        self.path = str(path or "").strip()
        self.cups_queue = str(cups_queue or "").strip()
        self.timeout = float(timeout)
        self._fh = None
        self._connected = False

    def connect(self) -> None:
        if self._connected:
            return
        if self.path:
            if not os.path.exists(self.path):
                raise PrinterError("unavailable", "USB printer device was not found")
            try:
                self._fh = open(self.path, "wb")  # noqa: SIM115
                self._connected = True
                return
            except PermissionError as exc:
                raise PrinterError("permission", "USB printer access was denied") from exc
            except OSError as exc:
                raise PrinterError("unavailable", "USB printer could not be opened") from exc
        if self.cups_queue:
            if not shutil.which("lp"):
                raise PrinterError("unsupported", "CUPS (lp) is not installed")
            self._connected = True
            return
        raise PrinterError("unavailable", "USB printer path or queue is missing")

    def disconnect(self) -> None:
        fh = self._fh
        self._fh = None
        self._connected = False
        if fh is not None:
            try:
                fh.close()
            except OSError:
                pass

    def is_connected(self) -> bool:
        return self._connected

    def write(self, data: bytes) -> None:
        payload = bytes(data or b"")
        if not payload:
            return
        if self._fh is not None:
            try:
                self._fh.write(payload)
                self._fh.flush()
                return
            except OSError as exc:
                raise PrinterError("communication_error", "USB printer write failed") from exc
        if self.cups_queue:
            try:
                subprocess.run(
                    ["lp", "-d", self.cups_queue, "-o", "raw", "-"],
                    input=payload,
                    check=True,
                    timeout=self.timeout,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                return
            except subprocess.TimeoutExpired as exc:
                raise PrinterError("timeout", "USB/CUPS print timed out") from exc
            except (OSError, subprocess.CalledProcessError) as exc:
                raise PrinterError("communication_error", "CUPS raw print failed") from exc
        raise PrinterError("unavailable", "USB printer is not connected")


def connection_for(printer: dict) -> PrinterConnection:
    kind = str((printer or {}).get("connection") or "network").strip().lower()
    address = str((printer or {}).get("address") or "").strip()
    port = (printer or {}).get("port") or 9100
    if kind == "bluetooth":
        channel = port if str(port).isdigit() else 1
        return BluetoothPrinterConnection(address, channel=int(channel or 1))
    if kind == "usb":
        queue = str((printer or {}).get("cupsQueue") or "").strip()
        if address.startswith("/"):
            return UsbPrinterConnection(path=address, cups_queue=queue)
        return UsbPrinterConnection(path="", cups_queue=queue or address)
    return NetworkPrinterConnection(address, port=port)


def send_bytes(printer: dict, payload: bytes) -> dict:
    conn = connection_for(printer)
    started = time.time()
    try:
        conn.connect()
        conn.write(payload)
        elapsed_ms = int((time.time() - started) * 1000)
        log.info("print ok type=%s bytes=%s ms=%s", conn.kind, len(payload), elapsed_ms)
        return {"ok": True, "type": conn.kind, "bytes": len(payload), "ms": elapsed_ms}
    except PrinterError as exc:
        log.warning("print failed type=%s code=%s", conn.kind, exc.code)
        return exc.as_dict()
    finally:
        conn.disconnect()
