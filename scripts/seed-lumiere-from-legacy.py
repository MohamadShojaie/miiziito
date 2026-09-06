#!/usr/bin/env python3
"""Copy legacy data/*.json (original Lumiere demo store) into the lumiere tenant."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LUMIERE_TENANT_ID = "cafe_8336e5ab335f"
LUMIERE_SLUG = "lumiere"

TENANT_JSON_FILES = (
    "menu-overrides.json",
    "orders.json",
    "tables.json",
    "customers.json",
    "invoices.json",
    "reservations.json",
)

SETTINGS_KEEP = (
    "restaurantNameFa",
    "restaurantNameEn",
    "tagline",
    "address",
    "phone",
    "primary",
    "secondary",
    "cashierPasswordHash",
    "updatedAt",
)

SETTINGS_COPY_IF_EMPTY = (
    "creditName",
    "telegram",
    "email",
    "receiptFooterMessage",
    "showNewSection",
    "showFooterCredit",
    "showContactOnMenu",
    "showLogoOnMenu",
    "showLogoOnReceipt",
    "showContactOnReceipt",
    "showBackgroundOnMenu",
    "menuStructure",
)


def main() -> None:
    tenant_dir = ROOT / "data" / "tenants" / LUMIERE_TENANT_ID
    if not tenant_dir.is_dir():
        raise SystemExit(f"Tenant dir missing: {tenant_dir}")

    legacy_dir = ROOT / "data"
    for name in TENANT_JSON_FILES:
        src = legacy_dir / name
        dst = tenant_dir / name
        if not src.is_file():
            print(f"skip missing {name}")
            continue
        data = json.loads(src.read_text(encoding="utf-8"))
        if name == "menu-overrides.json" and isinstance(data, dict):
            data.pop("_standalone", None)
            if LUMIERE_SLUG == "lumiere":
                data["_standalone"] = False
        dst.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"copied {name}")

    tenant_uploads = ROOT / "uploads" / "tenants" / LUMIERE_TENANT_ID
    for sub in ("branding", "items"):
        src_dir = ROOT / "uploads" / sub
        dst_dir = tenant_uploads / sub
        dst_dir.mkdir(parents=True, exist_ok=True)
        if not src_dir.is_dir():
            continue
        for file in src_dir.iterdir():
            if file.is_file():
                shutil.copy2(file, dst_dir / file.name)
                print(f"copied upload {sub}/{file.name}")

    tenant_settings_path = tenant_dir / "settings.json"
    tenant_settings = json.loads(tenant_settings_path.read_text(encoding="utf-8"))
    legacy_settings_path = legacy_dir / "settings.json"
    legacy_settings = (
        json.loads(legacy_settings_path.read_text(encoding="utf-8"))
        if legacy_settings_path.is_file()
        else {}
    )

    for key in ("logo", "backgroundImage"):
        val = str(legacy_settings.get(key) or "")
        if not val:
            continue
        fname = Path(val.replace("\\", "/")).name
        if fname:
            tenant_settings[key] = (
                f"uploads/tenants/{LUMIERE_TENANT_ID}/branding/{fname}"
            )

    for key in SETTINGS_COPY_IF_EMPTY:
        if not tenant_settings.get(key) and legacy_settings.get(key) is not None:
            tenant_settings[key] = legacy_settings[key]

    tenant_settings_path.write_text(
        json.dumps(tenant_settings, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"updated settings.json for slug /{LUMIERE_SLUG}/")


if __name__ == "__main__":
    main()
