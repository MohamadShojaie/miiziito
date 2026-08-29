"""Generic transports — bytes only; payment protocol stays in adapters."""

from .network import NetworkTransport, tcp_reachable
from .serial import SerialTransport
from .usb import UsbTransport, list_usb_serial_candidates
from .bluetooth import BluetoothTransport

__all__ = [
    "BluetoothTransport",
    "NetworkTransport",
    "SerialTransport",
    "UsbTransport",
    "list_usb_serial_candidates",
    "tcp_reachable",
]
