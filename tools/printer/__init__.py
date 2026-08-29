"""Thermal printer stack: discovery, connections, ESC/POS, print service."""

from .escpos import (
    CODE_PAGES,
    EscPosBuilder,
    generate_invoice,
    generate_receipt,
    generate_station_ticket,
    generate_test_receipt,
    paper_cols,
)
from .image_escpos import (
    DEFAULT_CHUNK_HEIGHT,
    RECEIPT_IMAGE_HEIGHT,
    RECEIPT_IMAGE_WIDTH,
    image_rows_to_escpos,
    pil_image_to_escpos,
)
from .connections import (
    BluetoothPrinterConnection,
    NetworkPrinterConnection,
    PrinterConnection,
    PrinterError,
    UsbPrinterConnection,
    connection_for,
)
from .discovery import (
    discover_bluetooth_printers,
    discover_network_printers,
    discover_usb_printers,
    host_capabilities,
)
from .service import (
    capabilities,
    delete_printer,
    discover,
    fingerprint,
    get_saved_printers,
    print_receipt,
    save_printer,
    test_printer,
    update_printer,
)

__all__ = [
    "CODE_PAGES",
    "DEFAULT_CHUNK_HEIGHT",
    "EscPosBuilder",
    "RECEIPT_IMAGE_HEIGHT",
    "RECEIPT_IMAGE_WIDTH",
    "generate_invoice",
    "generate_receipt",
    "generate_station_ticket",
    "generate_test_receipt",
    "image_rows_to_escpos",
    "paper_cols",
    "pil_image_to_escpos",
    "BluetoothPrinterConnection",
    "NetworkPrinterConnection",
    "PrinterConnection",
    "PrinterError",
    "UsbPrinterConnection",
    "connection_for",
    "discover_bluetooth_printers",
    "discover_network_printers",
    "discover_usb_printers",
    "host_capabilities",
    "capabilities",
    "delete_printer",
    "discover",
    "fingerprint",
    "get_saved_printers",
    "print_receipt",
    "save_printer",
    "test_printer",
    "update_printer",
]
