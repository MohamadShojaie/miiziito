"""Provider-scoped discovery. No blind full-subnet scans."""

from __future__ import annotations

import socket
from typing import Any


def discover_network(
    *,
    host: str = "",
    port: int = 0,
    hosts: list[str] | None = None,
    timeout: float = 1.5,
) -> dict[str, Any]:
    targets: list[str] = []
    if host:
        targets.append(host.strip())
    if hosts:
        targets.extend([h.strip() for h in hosts if str(h).strip()])
    targets = list(dict.fromkeys(targets))
    if not targets:
        return {
            "ok": True,
            "type": "network",
            "devices": [],
            "message": "Specify host or hosts; full-subnet scan is not performed.",
        }
    if port <= 0:
        return {
            "ok": True,
            "type": "network",
            "devices": [],
            "message": "Port is required for network discovery.",
        }

    found = []
    for h in targets:
        try:
            with socket.create_connection((h, port), timeout=timeout):
                found.append(
                    {
                        "connectionType": "network",
                        "host": h,
                        "port": port,
                        "status": "online",
                        "label": f"{h}:{port}",
                    }
                )
        except OSError:
            continue
    return {"ok": True, "type": "network", "devices": found}


def discover_usb() -> dict[str, Any]:
    devices = []
    try:
        import glob

        for path in sorted(glob.glob("/dev/tty.usb*") + glob.glob("/dev/cu.usb*") + glob.glob("/dev/ttyUSB*")):
            devices.append(
                {
                    "connectionType": "usb",
                    "serialPort": path,
                    "label": path,
                    "compatible": False,
                    "note": "Unknown USB serial device — verify with provider adapter",
                }
            )
    except Exception:
        pass
    return {
        "ok": True,
        "type": "usb",
        "devices": devices,
        "message": "USB discovery lists serial candidates; payment protocol is provider-specific.",
    }


def discover_serial() -> dict[str, Any]:
    devices = []
    try:
        import glob

        patterns = [
            "/dev/tty.usb*",
            "/dev/cu.usb*",
            "/dev/ttyUSB*",
            "/dev/ttyS*",
            "/dev/cu.*",
        ]
        seen = set()
        for pat in patterns:
            for path in glob.glob(pat):
                if path in seen:
                    continue
                seen.add(path)
                devices.append(
                    {
                        "connectionType": "serial",
                        "serialPort": path,
                        "label": path,
                    }
                )
    except Exception:
        pass
    return {"ok": True, "type": "serial", "devices": devices}


def discover_bluetooth() -> dict[str, Any]:
    return {
        "ok": True,
        "type": "bluetooth",
        "devices": [],
        "message": "Bluetooth discovery requires OS APIs / vendor SDK via a configured provider adapter.",
    }


def discover(kind: str, **kwargs) -> dict[str, Any]:
    kind = (kind or "network").lower()
    if kind == "network":
        return discover_network(
            host=str(kwargs.get("host") or ""),
            port=int(kwargs.get("port") or 0),
            hosts=kwargs.get("hosts"),
            timeout=float(kwargs.get("timeout") or 1.5),
        )
    if kind == "usb":
        return discover_usb()
    if kind == "serial":
        return discover_serial()
    if kind == "bluetooth":
        return discover_bluetooth()
    return {"ok": False, "error": "VALIDATION_ERROR", "message": f"Unknown discovery type: {kind}"}
