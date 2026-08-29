"""USB path helpers — discovery separate from payment protocol."""

from __future__ import annotations

import glob
from typing import Any

from .serial import SerialTransport


def list_usb_serial_candidates() -> list[dict[str, Any]]:
    paths = []
    for pat in ("/dev/tty.usb*", "/dev/cu.usb*", "/dev/ttyUSB*", "/dev/ttyACM*"):
        paths.extend(glob.glob(pat))
    return [{"path": p, "label": p} for p in sorted(set(paths))]


class UsbTransport(SerialTransport):
    kind = "usb"
