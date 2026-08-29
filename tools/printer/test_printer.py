#!/usr/bin/env python3
"""Unit tests for thermal printer stack (no hardware required)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from printer.escpos import EscPosBuilder, generate_receipt, generate_test_receipt, paper_cols
from printer.connections import NetworkPrinterConnection, PrinterError
from printer.discovery import discover_network_printers
from printer.service import fingerprint, save_printer, update_printer, delete_printer, print_receipt


_id_seq = 0


def _normalize(raw: dict) -> dict:
    global _id_seq
    _id_seq += 1
    now = _id_seq
    return {
        "id": str(raw.get("id") or f"hw_{now}"),
        "name": str(raw.get("name") or "Printer"),
        "type": str(raw.get("type") or "receipt_printer"),
        "station": str(raw.get("station") or "cashier"),
        "connection": str(raw.get("connection") or "network"),
        "address": str(raw.get("address") or ""),
        "port": str(raw.get("port") or "9100"),
        "paperWidth": str(raw.get("paperWidth") or "80"),
        "copies": int(raw.get("copies") or 1),
        "enabled": bool(raw.get("enabled", True)),
        "notes": str(raw.get("notes") or ""),
        "isDefault": bool(raw.get("isDefault", False)),
        "codePage": str(raw.get("codePage") or "utf8"),
        "manufacturer": str(raw.get("manufacturer") or ""),
        "model": str(raw.get("model") or ""),
        "vendorId": str(raw.get("vendorId") or ""),
        "productId": str(raw.get("productId") or ""),
        "cupsQueue": str(raw.get("cupsQueue") or ""),
        "createdAt": int(raw.get("createdAt") or now),
        "updatedAt": now,
    }


class EscPosTests(unittest.TestCase):
    def test_paper_cols(self):
        self.assertEqual(paper_cols("58"), 32)
        self.assertEqual(paper_cols("80"), 48)

    def test_builder_emits_init_and_cut(self):
        b = EscPosBuilder(paper_width="80", rtl=False)
        b.align("center").bold(True).text("Hello").bold(False).newline().cut()
        data = b.to_bytes()
        self.assertTrue(data.startswith(bytes((0x1B, 0x40))))
        self.assertIn(bytes((0x1D, 0x56, 1)), data)
        self.assertIn(b"Hello", data)

    def test_generate_receipt_structure(self):
        payload = generate_receipt(
            {
                "storeName": "Cafe",
                "receiptNumber": "12345",
                "datetime": "2026-08-24 17:30",
                "items": [
                    {"name": "Coffee", "qty": 2, "unitPrice": 3.0},
                    {"name": "Sandwich", "qty": 1, "unitPrice": 8.5},
                ],
                "subtotal": 14.5,
                "tax": 1.45,
                "total": 15.95,
                "footer": "Thank You!",
                "codePage": "utf8",
            }
        )
        text = payload.decode("utf-8", errors="ignore")
        self.assertIn("Cafe", text)
        self.assertIn("Coffee", text)
        self.assertIn(b"\x1b@", payload)
        self.assertIn(b"\x1dV", payload)
        self.assertIn(bytes((0x1D, 0x42, 1)), payload)  # inverted band
        self.assertTrue("16" in text or "۱۵" in text or "۱۶" in text)

    def test_station_ticket_no_prices(self):
        from printer.escpos import generate_station_ticket

        payload = generate_station_ticket(
            {
                "station": "bar",
                "storeName": "Cafe",
                "table": 24,
                "datetime": "17:26",
                "items": [
                    {"name": "آیس امریکانو", "qty": 1, "unitPrice": 240000},
                    {"name": "لاته", "qty": 2, "unitPrice": 100000},
                ],
                "codePage": "utf8",
            }
        )
        # Must not contain price digits as money columns
        text = payload.decode("utf-8", errors="ignore")
        self.assertNotIn("240000", text)
        self.assertNotIn("100000", text)
        self.assertNotIn("جمع", text)
        self.assertIn("BAR", text)

    def test_persian_reshape(self):
        from printer.persian import prepare_rtl_line, has_persian

        self.assertTrue(has_persian("سلام"))
        shaped = prepare_rtl_line("سلام")
        self.assertTrue(shaped)
        self.assertNotEqual(shaped, "سلام")  # should reverse/reshape

    def test_image_escpos_chunks_gs_v0(self):
        from printer.image_escpos import (
            DEFAULT_CHUNK_HEIGHT,
            image_rows_to_escpos,
            rgba_to_mono_rows,
            split_rows,
        )

        width, height = 576, 250
        # Checkerboard-ish dark top / light bottom
        pixels = []
        for y in range(height):
            for x in range(width):
                lum = 40 if y < 120 else 240
                pixels.append((lum, lum, lum, 255))
        rows = rgba_to_mono_rows(pixels, width, height, threshold=180)
        self.assertEqual(len(rows), height)
        chunks = split_rows(rows, DEFAULT_CHUNK_HEIGHT)
        self.assertEqual(len(chunks), 3)  # 100 + 100 + 50
        self.assertEqual(len(chunks[0]), 100)
        self.assertEqual(len(chunks[2]), 50)

        payload = image_rows_to_escpos(rows, width, chunk_height=100)
        self.assertTrue(payload.startswith(bytes((0x1B, 0x40))))
        # Three GS v 0 headers
        marker = bytes((0x1D, 0x76, 0x30, 0x00))
        self.assertEqual(payload.count(marker), 3)
        self.assertIn(bytes((0x1D, 0x56, 1)), payload)

    def test_test_receipt(self):
        payload = generate_test_receipt("network", when="2026-08-24 17:30:00", code_page="utf8")
        text = payload.decode("utf-8", errors="ignore")
        self.assertTrue("تست" in text or "NETWORK" in text or "network" in text.lower())


class DiscoveryTests(unittest.TestCase):
    def test_network_scan_uses_probe(self):
        def fake_probe(ip, port, timeout):
            return ip.endswith(".10") or ip.endswith(".20")

        with mock.patch("printer.discovery._local_ipv4_addrs", return_value=["192.168.1.5"]):
            with mock.patch("printer.discovery._hostname_for", return_value="tm-t20.local"):
                result = discover_network_printers(probe=fake_probe, timeout=0.01, max_workers=16)
        self.assertTrue(result["ok"])
        self.assertEqual(result["localIp"], "192.168.1.5")
        self.assertEqual(result["subnet"], "192.168.1.0/24")
        addrs = {p["address"] for p in result["printers"]}
        self.assertEqual(addrs, {"192.168.1.10", "192.168.1.20"})
        self.assertEqual(result["printers"][0]["connection"], "network")


class PersistenceTests(unittest.TestCase):
    def test_fingerprint_and_duplicate(self):
        a = {"connection": "network", "address": "10.0.0.8", "port": "9100"}
        b = {"connection": "network", "address": "10.0.0.8", "port": 9100}
        self.assertEqual(fingerprint(a), fingerprint(b))
        devices, record, err = save_printer([], {**a, "name": "A", "type": "receipt_printer"}, _normalize)
        self.assertIsNone(err)
        devices2, _, err2 = save_printer(devices, {**b, "name": "B", "type": "receipt_printer"}, _normalize)
        self.assertEqual(err2, "duplicate")
        self.assertEqual(len(devices2), 1)
        self.assertTrue(record["id"])

    def test_default_flag_and_update_delete(self):
        devices, first, _ = save_printer(
            [],
            {
                "name": "One",
                "type": "receipt_printer",
                "connection": "network",
                "address": "1.1.1.1",
                "port": "9100",
                "isDefault": True,
            },
            _normalize,
        )
        devices, second, _ = save_printer(
            devices,
            {
                "name": "Two",
                "type": "kitchen_printer",
                "connection": "network",
                "address": "1.1.1.2",
                "port": "9100",
                "isDefault": True,
            },
            _normalize,
        )
        defaults = [d for d in devices if d.get("isDefault")]
        self.assertEqual(len(defaults), 1)
        self.assertEqual(defaults[0]["id"], second["id"])
        devices, updated, err = update_printer(
            devices, first["id"], {"name": "One Renamed"}, _normalize
        )
        self.assertIsNone(err)
        self.assertEqual(updated["name"], "One Renamed")
        devices, ok = delete_printer(devices, first["id"])
        self.assertTrue(ok)
        self.assertEqual(len(devices), 1)


class ConnectionTests(unittest.TestCase):
    def test_network_missing_host(self):
        conn = NetworkPrinterConnection("")
        with self.assertRaises(PrinterError):
            conn.connect()

    def test_print_receipt_mock_send(self):
        devices = [
            _normalize(
                {
                    "id": "hw_1",
                    "name": "Receipt",
                    "type": "receipt_printer",
                    "connection": "network",
                    "address": "127.0.0.1",
                    "port": "9100",
                    "isDefault": True,
                }
            )
        ]
        with mock.patch("printer.service.send_bytes", return_value={"ok": True, "bytes": 12}) as send:
            result = print_receipt(
                devices,
                {
                    "receipt": {
                        "storeName": "Cafe",
                        "items": [{"name": "Tea", "qty": 1, "unitPrice": 2}],
                        "total": 2,
                    }
                },
            )
        self.assertTrue(result["ok"])
        send.assert_called_once()
        args = send.call_args[0]
        self.assertEqual(args[0]["id"], "hw_1")
        self.assertTrue(isinstance(args[1], (bytes, bytearray)))
        self.assertGreater(len(args[1]), 0)


if __name__ == "__main__":
    unittest.main()
