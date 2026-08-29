"""Network transport (TCP). Port is fully configurable — never assume 9100."""

from __future__ import annotations

import socket
from typing import Optional


def tcp_reachable(host: str, port: int, timeout: float = 3.0) -> bool:
    if not host or port <= 0:
        return False
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return True
    except OSError:
        return False


class NetworkTransport:
    kind = "network"

    def __init__(
        self,
        host: str,
        port: int,
        *,
        connect_timeout: float = 5.0,
        request_timeout: float = 30.0,
    ):
        self.host = str(host or "").strip()
        self.port = int(port or 0)
        self.connect_timeout = float(connect_timeout)
        self.request_timeout = float(request_timeout)
        self._sock: Optional[socket.socket] = None

    def connect(self) -> None:
        if not self.host:
            raise OSError("host required")
        if self.port <= 0:
            raise OSError("port required")
        self._sock = socket.create_connection(
            (self.host, self.port), timeout=self.connect_timeout
        )
        self._sock.settimeout(self.request_timeout)

    def disconnect(self) -> None:
        if self._sock:
            try:
                self._sock.close()
            except OSError:
                pass
            self._sock = None

    def write(self, data: bytes) -> None:
        if not self._sock:
            raise OSError("not connected")
        self._sock.sendall(data)

    def read(self, max_bytes: int = 4096) -> bytes:
        if not self._sock:
            raise OSError("not connected")
        return self._sock.recv(max_bytes)

    def test_reachability(self) -> dict:
        ok = tcp_reachable(self.host, self.port, timeout=self.connect_timeout)
        return {
            "ok": ok,
            "type": "network",
            "host": self.host,
            "port": self.port,
            "message": "reachable" if ok else "unreachable",
        }
