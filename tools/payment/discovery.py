"""Discover payment terminals on the POS host — same subnet scan approach as printers."""

from __future__ import annotations

import concurrent.futures
import socket
from typing import Any, Callable, Optional

from printer.discovery import (
    _hostname_for,
    _local_ipv4_addrs,
    _subnet_hosts,
    discover_bluetooth_printers,
    host_capabilities,
    probe_tcp,
)

POS_NAME_HINTS = (
    "pos",
    "terminal",
    "card",
    "pax",
    "verifone",
    "ingenico",
    "radian",
    "behpardakht",
    "saman",
    "irankish",
    "pasargad",
    "payment",
    "pinpad",
)

DEFAULT_POS_PORTS = (8080, 8443, 9000, 5000, 9100)


def _looks_like_pos(name: str, host: str) -> bool:
    hay = f"{name} {host}".lower()
    return any(h in hay for h in POS_NAME_HINTS)


def _device_id(connection_type: str, **parts: str) -> str:
    bits = [connection_type] + [str(v) for v in parts.values() if v]
    return ":".join(bits)


def _normalize_network_device(host: str, port: int, hostname: str = "") -> dict[str, Any]:
    name = hostname or f"POS {host}"
    return {
        "id": _device_id("net", host=host, port=str(port)),
        "name": name,
        "connectionType": "network",
        "host": host,
        "port": str(port),
        "status": "online",
        "label": f"{host}:{port}",
        "likelyPos": _looks_like_pos(name, host),
    }


def discover_network_subnet(
    *,
    port: int = 0,
    ports: list[int] | None = None,
    timeout: float = 0.35,
    probe: Optional[Callable[[str, int, float], bool]] = None,
    max_workers: int = 64,
) -> dict[str, Any]:
    """Scan the local /24 subnet for reachable TCP hosts (same approach as printer discovery)."""
    probe_fn = probe or probe_tcp
    locals_ = _local_ipv4_addrs()
    if not locals_:
        return {
            "ok": True,
            "type": "network",
            "localIp": "",
            "subnet": "",
            "scanned": 0,
            "devices": [],
            "message": "Could not detect a local network interface",
        }

    scan_ports = [port] if port > 0 else list(ports or DEFAULT_POS_PORTS)
    scan_ports = [p for p in scan_ports if p > 0]
    if not scan_ports:
        return {
            "ok": True,
            "type": "network",
            "localIp": "",
            "subnet": "",
            "scanned": 0,
            "devices": [],
            "message": "Port is required for network discovery.",
        }

    primary = locals_[0]
    hosts = _subnet_hosts(primary)
    subnet = ".".join(primary.split(".")[:3]) + ".0/24"
    open_endpoints: list[tuple[str, int]] = []
    scanned = len(hosts) * len(scan_ports)

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures: dict[concurrent.futures.Future, tuple[str, int]] = {}
        for host in hosts:
            for p in scan_ports:
                fut = pool.submit(probe_fn, host, p, timeout)
                futures[fut] = (host, p)
        for fut in concurrent.futures.as_completed(futures, timeout=30):
            host, p = futures[fut]
            try:
                if fut.result():
                    open_endpoints.append((host, p))
            except Exception:
                continue

    devices: list[dict[str, Any]] = []
    seen: set[str] = set()
    for host, p in sorted(
        open_endpoints,
        key=lambda x: (tuple(int(o) for o in x[0].split(".")), x[1]),
    ):
        key = f"{host}:{p}"
        if key in seen:
            continue
        seen.add(key)
        hostname = _hostname_for(host)
        devices.append(_normalize_network_device(host, p, hostname))

    devices.sort(
        key=lambda d: (
            0 if d.get("likelyPos") else 1,
            tuple(int(o) for o in str(d.get("host") or "0.0.0.0").split(".")),
            int(d.get("port") or 0),
        )
    )

    msg = ""
    if not devices:
        ports_label = ", ".join(str(p) for p in scan_ports)
        msg = f"No reachable hosts on ports {ports_label}"

    return {
        "ok": True,
        "type": "network",
        "localIp": primary,
        "subnet": subnet,
        "scanned": scanned,
        "devices": devices,
        "message": msg,
        "capabilities": host_capabilities(),
    }


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
        return discover_network_subnet(port=port, timeout=min(timeout, 0.5))

    if port <= 0:
        return {
            "ok": True,
            "type": "network",
            "devices": [],
            "message": "Port is required when probing specific hosts.",
        }

    found = []
    for h in targets:
        try:
            with socket.create_connection((h, port), timeout=timeout):
                found.append(_normalize_network_device(h, port, _hostname_for(h)))
        except OSError:
            continue
    return {"ok": True, "type": "network", "devices": found}


def discover_usb() -> dict[str, Any]:
    devices = []
    try:
        import glob

        for path in sorted(
            glob.glob("/dev/tty.usb*")
            + glob.glob("/dev/cu.usb*")
            + glob.glob("/dev/ttyUSB*")
        ):
            devices.append(
                {
                    "id": _device_id("usb", path=path),
                    "name": path.split("/")[-1] or path,
                    "connectionType": "usb",
                    "serialPort": path,
                    "label": path,
                    "status": "discovered",
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
        "capabilities": host_capabilities(),
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
                        "id": _device_id("serial", path=path),
                        "name": path.split("/")[-1] or path,
                        "connectionType": "serial",
                        "serialPort": path,
                        "label": path,
                        "status": "discovered",
                    }
                )
    except Exception:
        pass
    return {
        "ok": True,
        "type": "serial",
        "devices": devices,
        "capabilities": host_capabilities(),
    }


def discover_bluetooth() -> dict[str, Any]:
    raw = discover_bluetooth_printers()
    devices = []
    for row in raw.get("printers") or []:
        if not isinstance(row, dict):
            continue
        addr = str(row.get("address") or "")
        name = str(row.get("name") or f"Bluetooth {addr}")
        devices.append(
            {
                "id": _device_id("bt", addr=addr or name),
                "name": name,
                "connectionType": "bluetooth",
                "bluetoothIdentifier": addr or name,
                "label": name,
                "status": str(row.get("status") or "discovered"),
                "likelyPos": _looks_like_pos(name, addr),
            }
        )
    devices.sort(key=lambda d: (0 if d.get("likelyPos") else 1, str(d.get("name") or "")))
    return {
        "ok": True,
        "type": "bluetooth",
        "devices": devices,
        "message": raw.get("message") or "",
        "capabilities": raw.get("capabilities") or host_capabilities(),
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
