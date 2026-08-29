"""Discover network / Bluetooth / USB thermal printers on the POS host."""

from __future__ import annotations

import concurrent.futures
import json
import logging
import os
import platform
import re
import shutil
import socket
import subprocess
from typing import Callable, Optional

log = logging.getLogger("miiziito.printer")

PRINTER_NAME_HINTS = (
    "print",
    "pos",
    "epson",
    "star",
    "xprinter",
    "gprinter",
    "bixolon",
    "citizen",
    "thermal",
    "receipt",
    "rp-",
    "tm-",
    "tsp",
    "rongta",
)

KNOWN_USB_VIDS = {
    "04b8": "Epson",
    "0519": "Star Micronics",
    "1504": "Citizen",
    "0dd4": "Custom",
    "2730": "Bixolon",
    "0fe6": "ICS / Advent",
    "0483": "STMicroelectronics",
    "1a86": "QinHeng (CH340)",
    "067b": "Prolific",
    "0416": "Winbond",
    "28e9": "Gprinter / Xprinter",
    "0525": "Netchip / POS",
}


def host_capabilities() -> dict:
    return {
        "network": True,
        "bluetooth": bool(hasattr(socket, "AF_BLUETOOTH"))
        or platform.system() in ("Darwin", "Linux"),
        "usb": True,
        "platform": platform.system(),
        "rfcomm": bool(hasattr(socket, "AF_BLUETOOTH")),
        "cups": bool(shutil.which("lp")),
    }


def _local_ipv4_addrs() -> list[str]:
    found: list[str] = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in found:
                found.append(ip)
    except OSError:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            if ip and not ip.startswith("127.") and ip not in found:
                found.append(ip)
        finally:
            s.close()
    except OSError:
        pass
    if platform.system() == "Darwin" and shutil.which("ifconfig"):
        try:
            out = subprocess.check_output(["ifconfig"], text=True, timeout=3)
            for m in re.finditer(r"inet (\d+\.\d+\.\d+\.\d+)", out):
                ip = m.group(1)
                if not ip.startswith("127.") and ip not in found:
                    found.append(ip)
        except (OSError, subprocess.SubprocessError):
            pass
    if platform.system() == "Linux" and shutil.which("hostname"):
        try:
            out = subprocess.check_output(
                ["hostname", "-I"], text=True, timeout=3
            )
            for ip in out.split():
                if re.match(r"^\d+\.\d+\.\d+\.\d+$", ip) and not ip.startswith("127.") and ip not in found:
                    found.append(ip)
        except (OSError, subprocess.SubprocessError):
            pass
    return found


def _subnet_hosts(ip: str) -> list[str]:
    parts = ip.split(".")
    if len(parts) != 4:
        return []
    prefix = ".".join(parts[:3])
    return [f"{prefix}.{i}" for i in range(1, 255) if f"{prefix}.{i}" != ip]


def probe_tcp(ip: str, port: int = 9100, timeout: float = 0.35) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect((ip, int(port)))
        return True
    except OSError:
        return False
    finally:
        try:
            sock.close()
        except OSError:
            pass


def _hostname_for(ip: str) -> str:
    try:
        name = socket.getfqdn(ip)
        if name and name != ip:
            return name
    except OSError:
        pass
    return ""


def _looks_like_printer(name: str, ip: str) -> bool:
    hay = f"{name} {ip}".lower()
    return any(h in hay for h in PRINTER_NAME_HINTS)


def discover_network_printers(
    port: int = 9100,
    timeout: float = 0.35,
    probe: Optional[Callable[[str, int, float], bool]] = None,
    max_workers: int = 64,
) -> dict:
    probe_fn = probe or probe_tcp
    locals_ = _local_ipv4_addrs()
    if not locals_:
        return {
            "ok": True,
            "type": "network",
            "localIp": "",
            "subnet": "",
            "scanned": 0,
            "printers": [],
            "message": "Could not detect a local network interface",
        }
    primary = locals_[0]
    hosts = _subnet_hosts(primary)
    subnet = ".".join(primary.split(".")[:3]) + ".0/24"
    open_hosts: list[str] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {
            pool.submit(probe_fn, host, port, timeout): host for host in hosts
        }
        for fut in concurrent.futures.as_completed(futures, timeout=20):
            host = futures[fut]
            try:
                if fut.result():
                    open_hosts.append(host)
            except Exception:
                continue

    printers = []
    for host in sorted(open_hosts, key=lambda x: tuple(int(p) for p in x.split("."))):
        hostname = _hostname_for(host)
        likely = _looks_like_printer(hostname, host)
        printers.append(
            {
                "id": f"net:{host}:{port}",
                "name": hostname or f"Printer {host}",
                "hostname": hostname,
                "address": host,
                "port": str(port),
                "connection": "network",
                "status": "online",
                "likelyThermal": True if likely or not hostname else likely or True,
                "manufacturer": "",
                "model": "",
            }
        )
    return {
        "ok": True,
        "type": "network",
        "localIp": primary,
        "subnet": subnet,
        "scanned": len(hosts),
        "printers": printers,
    }


def _parse_mac_bluetooth_json(raw: str) -> list[dict]:
    printers: list[dict] = []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return printers

    def walk(node, bucket: list):
        if isinstance(node, dict):
            # leaf device-ish
            name = (
                node.get("device_name")
                or node.get("device_title")
                or node.get("name")
                or ""
            )
            addr = (
                node.get("device_address")
                or node.get("address")
                or node.get("device_addr")
                or ""
            )
            if name or addr:
                bucket.append({"name": str(name), "address": str(addr)})
            for value in node.values():
                walk(value, bucket)
        elif isinstance(node, list):
            for item in node:
                walk(item, bucket)

    leaves: list[dict] = []
    walk(data, leaves)
    seen = set()
    for row in leaves:
        addr = re.sub(r"[^0-9A-Fa-f:]", "", row.get("address") or "")
        name = (row.get("name") or "").strip()
        if not addr and not name:
            continue
        key = (addr.lower(), name.lower())
        if key in seen:
            continue
        seen.add(key)
        hay = name.lower()
        if addr and (
            any(h in hay for h in PRINTER_NAME_HINTS)
            or "printer" in hay
            or not hay
            or True
        ):
            printers.append(
                {
                    "id": f"bt:{addr or name}",
                    "name": name or f"Bluetooth {addr}",
                    "address": addr,
                    "port": "1",
                    "connection": "bluetooth",
                    "status": "discovered",
                    "manufacturer": "",
                    "model": name,
                }
            )
    return printers


def _discover_bluetooth_macos() -> list[dict]:
    if not shutil.which("system_profiler"):
        return []
    try:
        raw = subprocess.check_output(
            ["system_profiler", "SPBluetoothDataType", "-json"],
            text=True,
            timeout=12,
        )
        return _parse_mac_bluetooth_json(raw)
    except (OSError, subprocess.SubprocessError) as exc:
        log.warning("bluetooth discovery failed platform=Darwin err=%s", type(exc).__name__)
        return []


def _discover_bluetooth_linux() -> list[dict]:
    printers: list[dict] = []
    if shutil.which("bluetoothctl"):
        try:
            raw = subprocess.check_output(
                ["bluetoothctl", "devices"], text=True, timeout=8
            )
            for line in raw.splitlines():
                m = re.match(r"Device\s+([0-9A-F:]{11,17})\s+(.*)$", line.strip(), re.I)
                if not m:
                    continue
                addr, name = m.group(1), m.group(2).strip()
                printers.append(
                    {
                        "id": f"bt:{addr}",
                        "name": name or f"Bluetooth {addr}",
                        "address": addr,
                        "port": "1",
                        "connection": "bluetooth",
                        "status": "discovered",
                        "manufacturer": "",
                        "model": name,
                    }
                )
        except (OSError, subprocess.SubprocessError):
            pass
    return printers


def discover_bluetooth_printers() -> dict:
    system = platform.system()
    printers: list[dict] = []
    message = ""
    if system == "Darwin":
        printers = _discover_bluetooth_macos()
        if not printers:
            message = "No Bluetooth devices found. Pair the printer in system settings, then scan again."
    elif system == "Linux":
        printers = _discover_bluetooth_linux()
        if not printers:
            message = "No Bluetooth devices found. Enable Bluetooth and pair the printer first."
    else:
        message = "Bluetooth discovery is not supported on this platform."
    # Prefer names that look like printers, but still return all paired devices
    printers.sort(
        key=lambda p: (
            0 if any(h in str(p.get("name") or "").lower() for h in PRINTER_NAME_HINTS) else 1,
            str(p.get("name") or ""),
        )
    )
    return {
        "ok": True,
        "type": "bluetooth",
        "printers": printers,
        "message": message,
        "capabilities": host_capabilities(),
    }


def _usb_entries_from_profiler(raw: str) -> list[dict]:
    printers: list[dict] = []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return printers

    def walk(node):
        if isinstance(node, dict):
            name = str(node.get("_name") or node.get("name") or "")
            vendor_id = str(node.get("vendor_id") or node.get("idVendor") or "")
            product_id = str(node.get("product_id") or node.get("idProduct") or "")
            manufacturer = str(node.get("manufacturer") or "")
            product = str(node.get("product") or name)
            serial = str(node.get("serial_num") or node.get("serial") or "")
            vid_m = re.search(r"(0x)?([0-9a-fA-F]{4})", vendor_id)
            pid_m = re.search(r"(0x)?([0-9a-fA-F]{4})", product_id)
            vid = (vid_m.group(2).lower() if vid_m else "")
            pid = (pid_m.group(2).lower() if pid_m else "")
            class_name = str(node.get("bDeviceClass") or node.get("device_class") or "")
            looks = (
                vid in KNOWN_USB_VIDS
                or "print" in name.lower()
                or "print" in product.lower()
                or str(class_name) in ("7", "0x07")
                or "printer" in manufacturer.lower()
            )
            if looks and (vid or name):
                brand = KNOWN_USB_VIDS.get(vid, manufacturer)
                printers.append(
                    {
                        "id": f"usb:{vid}:{pid}:{serial or name}",
                        "name": product or name or f"USB {vid}:{pid}",
                        "address": f"/dev/usb/{vid}_{pid}" if vid else "",
                        "port": "",
                        "connection": "usb",
                        "status": "discovered",
                        "manufacturer": brand,
                        "model": product or name,
                        "vendorId": vid,
                        "productId": pid,
                        "serial": serial,
                    }
                )
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(data)
    # de-dupe
    seen = set()
    out = []
    for p in printers:
        key = (p.get("vendorId"), p.get("productId"), p.get("serial"), p.get("name"))
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def _discover_usb_linux() -> list[dict]:
    printers: list[dict] = []
    if shutil.which("lsusb"):
        try:
            raw = subprocess.check_output(["lsusb"], text=True, timeout=5)
            for line in raw.splitlines():
                m = re.search(r"ID\s+([0-9a-f]{4}):([0-9a-f]{4})\s+(.*)$", line, re.I)
                if not m:
                    continue
                vid, pid, desc = m.group(1).lower(), m.group(2).lower(), m.group(3).strip()
                if vid not in KNOWN_USB_VIDS and "print" not in desc.lower():
                    continue
                printers.append(
                    {
                        "id": f"usb:{vid}:{pid}",
                        "name": desc or f"USB {vid}:{pid}",
                        "address": "",
                        "port": "",
                        "connection": "usb",
                        "status": "discovered",
                        "manufacturer": KNOWN_USB_VIDS.get(vid, ""),
                        "model": desc,
                        "vendorId": vid,
                        "productId": pid,
                    }
                )
        except (OSError, subprocess.SubprocessError):
            pass
    for path in ("/dev/usb/lp0", "/dev/usb/lp1", "/dev/usb/lp2"):
        if os.path.exists(path):
            printers.append(
                {
                    "id": f"usbpath:{path}",
                    "name": f"USB raw {path}",
                    "address": path,
                    "port": "",
                    "connection": "usb",
                    "status": "online",
                    "manufacturer": "",
                    "model": path,
                    "vendorId": "",
                    "productId": "",
                }
            )
    return printers


def discover_usb_printers() -> dict:
    system = platform.system()
    printers: list[dict] = []
    message = ""
    if system == "Darwin" and shutil.which("system_profiler"):
        try:
            raw = subprocess.check_output(
                ["system_profiler", "SPUSBDataType", "-json"],
                text=True,
                timeout=20,
            )
            printers = _usb_entries_from_profiler(raw)
        except (OSError, subprocess.SubprocessError) as exc:
            log.warning("usb discovery failed platform=Darwin err=%s", type(exc).__name__)
            message = "USB scan failed"
    elif system == "Linux":
        printers = _discover_usb_linux()
    else:
        message = "USB discovery is limited on this platform"

    if shutil.which("lpstat"):
        try:
            raw = subprocess.check_output(["lpstat", "-a"], text=True, timeout=5)
            for line in raw.splitlines():
                parts = line.split()
                if not parts:
                    continue
                queue = parts[0]
                printers.append(
                    {
                        "id": f"cups:{queue}",
                        "name": f"CUPS {queue}",
                        "address": "",
                        "port": "",
                        "connection": "usb",
                        "status": "online",
                        "manufacturer": "",
                        "model": queue,
                        "cupsQueue": queue,
                        "vendorId": "",
                        "productId": "",
                    }
                )
        except (OSError, subprocess.SubprocessError):
            pass

    if not printers and not message:
        message = "No USB printers detected"
    return {
        "ok": True,
        "type": "usb",
        "printers": printers,
        "message": message,
        "capabilities": host_capabilities(),
    }
