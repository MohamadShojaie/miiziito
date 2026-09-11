"""Multi-tenant cafe slugs — mirrors api/tenant.php for local Python API."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import time
from pathlib import Path

RESERVED = {
    "admin",
    "panel-admin",
    "api",
    "assets",
    "_next",
    "uploads",
    "data",
    "404",
    "favicon.ico",
    "robots.txt",
    "_",
}

ROOT = Path(__file__).resolve().parents[1]
PLATFORM = ROOT / "data" / "platform"

TENANT_DEFAULTS = {
    "orders.json": "[]",
    "invoices.json": "[]",
    "tables.json": '{"regions":[],"states":{}}',
    "menu-overrides.json": '{"_standalone": true}',
    "customers.json": "[]",
    "reservations.json": "[]",
    "sessions.json": "{}",
    "costing.json": '{"settings":{"profitPercent":40,"monthlyPortions":1000},"ingredients":[],"bills":[],"employees":[],"recipes":[]}',
    "staff-ops.json": '{"employees":[],"templates":[],"runs":[],"attendance":[]}',
}


def slugify(name: str) -> str:
    name = (name or "").strip()
    if not name:
        return "cafe"
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    if not slug:
        return "cafe"
    return slug[:48]


def sanitize_slug(slug: str) -> str:
    slug = (slug or "").strip().lower()
    if not slug:
        return ""
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?", slug):
        return ""
    if slug in RESERVED:
        return ""
    return slug


def load_platform_cafes() -> list:
    path = PLATFORM / "cafes.json"
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    return data if isinstance(data, list) else []


def find_cafe_by_slug(slug: str) -> dict | None:
    slug = sanitize_slug(slug)
    if not slug:
        return None
    matches: list[dict] = []
    for cafe in load_platform_cafes():
        if not isinstance(cafe, dict):
            continue
        if str(cafe.get("slug") or "").lower() == slug:
            matches.append(cafe)
    if not matches:
        return None
    if len(matches) == 1:
        return matches[0]
    for status in ("active", "trial"):
        for cafe in matches:
            if str(cafe.get("status") or "") == status:
                return cafe
    return matches[0]


def is_cafe_live(cafe: dict | None) -> bool:
    if not isinstance(cafe, dict):
        return False
    return str(cafe.get("status") or "") in ("active", "trial")


def request_tenant_slug(headers: dict, body: dict | None = None, qs: dict | None = None) -> str:
    body = body or {}
    qs = qs or {}
    for key in (
        "X-Miiziito-Tenant",
        "x-miiziito-tenant",
        "X-Lumier-Tenant",
        "x-lumier-tenant",
    ):
        val = headers.get(key)
        if val:
            return sanitize_slug(str(val))
    if body.get("tenant"):
        return sanitize_slug(str(body["tenant"]))
    raw = qs.get("tenant")
    if raw:
        if isinstance(raw, list):
            raw = raw[0] if raw else ""
        return sanitize_slug(str(raw))
    return ""


def unique_slug(base: str, cafes: list, except_id: str = "") -> str:
    base = sanitize_slug(slugify(base)) or "cafe"
    slug = base
    n = 2
    while True:
        taken = False
        for c in cafes:
            if not isinstance(c, dict):
                continue
            if except_id and c.get("id") == except_id:
                continue
            if str(c.get("slug") or "").lower() == slug:
                taken = True
                break
        if not taken:
            return slug
        slug = f"{base}-{n}"
        n += 1


def assign_slug(cafe: dict, cafes: list, preferred: str = "") -> bool:
    except_id = str(cafe.get("id") or "")
    if preferred:
        slug = sanitize_slug(preferred)
        if not slug:
            return False
        for c in cafes:
            if not isinstance(c, dict):
                continue
            if except_id and c.get("id") == except_id:
                continue
            if str(c.get("slug") or "").lower() == slug:
                return False
        cafe["slug"] = slug
        return True
    if cafe.get("slug"):
        cafe["slug"] = unique_slug(str(cafe["slug"]), cafes, except_id)
        return True
    cafe["slug"] = unique_slug(str(cafe.get("name") or "cafe"), cafes, except_id)
    return True


def ensure_cafe_slugs(cafes: list) -> tuple[list, bool]:
    if not isinstance(cafes, list):
        return [], False
    changed = False
    out = []
    for c in cafes:
        if not isinstance(c, dict):
            continue
        cafe = dict(c)
        if not cafe.get("slug"):
            assign_slug(cafe, cafes)
            changed = True
        out.append(cafe)
    return out, changed


def _default_settings(cafe: dict) -> dict:
    name = str(cafe.get("name") or "کافه").strip() or "کافه"
    return {
        "restaurantNameFa": name,
        "restaurantNameEn": name,
        "tagline": "",
        "primary": "#566347",
        "secondary": "#D8DAD3",
        "logo": "",
        "backgroundImage": "",
        "creditName": "",
        "receiptFooterMessage": "",
    }


def provision_tenant(cafe: dict) -> bool:
    if not isinstance(cafe, dict) or not cafe.get("id"):
        return False
    data_dir = ROOT / "data"
    tenant_id = str(cafe["id"])
    tenant_dir = data_dir / "tenants" / tenant_id
    tenant_dir.mkdir(parents=True, exist_ok=True)
    for filename, fallback in TENANT_DEFAULTS.items():
        path = tenant_dir / filename
        if not path.is_file():
            path.write_text(fallback, encoding="utf-8")
    settings_path = tenant_dir / "settings.json"
    if not settings_path.is_file():
        settings_path.write_text(
            json.dumps(_default_settings(cafe), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    uploads_dir = ROOT / "uploads" / "tenants" / tenant_id
    (uploads_dir / "branding").mkdir(parents=True, exist_ok=True)
    (uploads_dir / "items").mkdir(parents=True, exist_ok=True)
    return True


def provision_live_cafes(cafes: list | None = None) -> None:
    items = cafes if isinstance(cafes, list) else load_platform_cafes()
    for cafe in items:
        if isinstance(cafe, dict) and is_cafe_live(cafe):
            provision_tenant(cafe)


def _tenant_settings_path(tenant_id: str) -> Path:
    tid = re.sub(r"[^a-zA-Z0-9_-]", "", str(tenant_id or ""))
    return ROOT / "data" / "tenants" / tid / "settings.json"


def read_tenant_settings(tenant_id: str) -> dict:
    path = _tenant_settings_path(tenant_id)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def save_tenant_settings(tenant_id: str, settings: dict) -> bool:
    tid = re.sub(r"[^a-zA-Z0-9_-]", "", str(tenant_id or ""))
    if not tid:
        return False
    if not isinstance(settings, dict):
        settings = {}
    settings.setdefault("updatedAt", int(time.time() * 1000))
    path = _tenant_settings_path(tid)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")
    return True


def generate_cashier_password() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(10)).decode().rstrip("=")


def hash_cashier_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000
    )
    return f"pbkdf2${salt}${digest.hex()}"


def verify_cashier_password(password: str, stored: str) -> bool:
    try:
        algo, salt, hexdigest = stored.split("$", 2)
        if algo != "pbkdf2":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000
        )
        return hmac.compare_digest(digest.hex(), hexdigest)
    except Exception:
        return False


def has_cashier_password(tenant_id: str) -> bool:
    settings = read_tenant_settings(tenant_id)
    return bool(settings.get("cashierPasswordHash"))


def set_tenant_cashier_password(tenant_id: str, password: str) -> bool:
    password = str(password or "")
    if not password:
        return False
    settings = read_tenant_settings(tenant_id)
    settings["cashierPasswordHash"] = hash_cashier_password(password)
    return save_tenant_settings(tenant_id, settings)


def verify_tenant_cashier_password(tenant_id: str, entered: str) -> bool | None:
    settings = read_tenant_settings(tenant_id)
    stored = settings.get("cashierPasswordHash")
    if not stored:
        return None
    return verify_cashier_password(str(entered or ""), str(stored))


def cashier_auth_meta(tenant_id: str) -> dict:
    return {"hasPassword": has_cashier_password(tenant_id)}


ENTITLEMENT_FLAGS = (
    "invoices",
    "reservations",
    "coupons",
    "advancedAnalytics",
    "paymentTerminal",
    "crm",
    "hardware",
    "kitchenPrint",
    "tableOps",
    "menuCosting",
    "staffOps",
)

ENTITLEMENT_LABELS_FA = {
    "invoices": "فاکتور",
    "reservations": "رزرو میز",
    "coupons": "کوپن",
    "advancedAnalytics": "آمار فروش",
    "paymentTerminal": "پایانه پرداخت",
    "crm": "باشگاه مشتریان",
    "hardware": "سخت‌افزار و پرینتر",
    "kitchenPrint": "چاپ تیکت آشپزخانه و بار",
    "tableOps": "وضعیت میز و سفارش از نقشه میزها",
    "menuCosting": "هزینه‌یابی منو",
    "staffOps": "مدیریت پرسنل و چک‌لیست",
}


def normalize_entitlements(raw, default_true: bool = False) -> dict:
    src = raw if isinstance(raw, dict) else {}
    out = {}
    for key in ENTITLEMENT_FLAGS:
        if key in src:
            out[key] = bool(src[key])
        else:
            out[key] = bool(default_true)
    return out


def default_plan_entitlements(tier: str) -> dict:
    ent = normalize_entitlements({}, False)
    if tier in ("professional", "business"):
        for key in (
            "invoices",
            "reservations",
            "coupons",
            "advancedAnalytics",
            "paymentTerminal",
            "tableOps",
        ):
            ent[key] = True
    if tier == "business":
        for key in ("crm", "hardware", "kitchenPrint", "menuCosting", "staffOps"):
            ent[key] = True
    return ent


def _load_platform_list(name: str) -> list:
    path = PLATFORM / f"{name}.json"
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    return data if isinstance(data, list) else []


def resolve_plan_access(cafe) -> dict:
    if not isinstance(cafe, dict) or not cafe.get("id"):
        return {
            "planId": "",
            "planName": "",
            "entitlements": normalize_entitlements({}, True),
        }
    plans = _load_platform_list("plans")
    plan_map = {
        str(p.get("id") or ""): p
        for p in plans
        if isinstance(p, dict) and p.get("id")
    }
    tenant_id = str(cafe.get("id") or "")
    tenant_subs = [
        s
        for s in _load_platform_list("subscriptions")
        if isinstance(s, dict) and str(s.get("tenantId") or "") == tenant_id
    ]
    tenant_subs = sorted(
        tenant_subs, key=lambda s: str(s.get("createdAt") or ""), reverse=True
    )
    current = None
    for s in tenant_subs:
        if s.get("status") in ("trial", "active", "past_due", "grace_period"):
            current = s
            break
    plan_id = ""
    if current and current.get("planId"):
        plan_id = str(current.get("planId") or "")
    elif cafe.get("planId"):
        plan_id = str(cafe.get("planId") or "")
    plan = plan_map.get(plan_id) if plan_id else None
    ent_raw = (plan or {}).get("entitlements") if isinstance(plan, dict) else {}
    return {
        "planId": plan_id,
        "planName": str((plan or {}).get("name") or "") if plan else "",
        "entitlements": normalize_entitlements(ent_raw, False),
    }
