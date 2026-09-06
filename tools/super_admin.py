"""Super Admin / SaaS platform API — JSON store under data/platform/."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
from tenant_slug import (
    assign_slug,
    cashier_auth_meta,
    ensure_cafe_slugs,
    generate_cashier_password,
    has_cashier_password,
    provision_live_cafes,
    provision_tenant,
    set_tenant_cashier_password,
    verify_tenant_cashier_password,
)

DATA = ROOT / "data"
PLATFORM = DATA / "platform"
SECRET = DATA / "secret.php"

SESSION_TTL = 60 * 60 * 12  # 12h
SESSION_TTL_REMEMBER = 60 * 60 * 24 * 30  # 30d
LOGIN_WINDOW = 15 * 60
LOGIN_MAX_ATTEMPTS = 8

PERMISSIONS = [
    "cafes.read",
    "cafes.write",
    "subscriptions.read",
    "subscriptions.write",
    "payments.read",
    "payments.refund",
    "plans.read",
    "plans.write",
    "analytics.read",
    "support.read",
    "support.write",
    "system.read",
    "audit.read",
    "notifications.write",
    "admin_users.read",
    "admin_users.write",
    "roles.write",
]

DEFAULT_ROLES = [
    {
        "id": "role_owner",
        "name": "Owner",
        "description": "Full platform access",
        "permissions": ["*"],
        "isSystem": True,
    },
    {
        "id": "role_super_admin",
        "name": "Super Admin",
        "description": "Broad operational access",
        "permissions": [
            "cafes.read",
            "cafes.write",
            "subscriptions.read",
            "subscriptions.write",
            "payments.read",
            "payments.refund",
            "plans.read",
            "plans.write",
            "analytics.read",
            "support.read",
            "support.write",
            "system.read",
            "audit.read",
            "notifications.write",
            "admin_users.read",
        ],
        "isSystem": True,
    },
    {
        "id": "role_support",
        "name": "Support",
        "description": "Customer support",
        "permissions": [
            "cafes.read",
            "subscriptions.read",
            "support.read",
            "support.write",
            "notifications.write",
        ],
        "isSystem": True,
    },
    {
        "id": "role_finance",
        "name": "Finance",
        "description": "Billing and payments",
        "permissions": [
            "cafes.read",
            "subscriptions.read",
            "subscriptions.write",
            "payments.read",
            "payments.refund",
            "plans.read",
            "analytics.read",
            "audit.read",
        ],
        "isSystem": True,
    },
    {
        "id": "role_manager",
        "name": "Manager",
        "description": "Read-heavy operations",
        "permissions": [
            "cafes.read",
            "subscriptions.read",
            "payments.read",
            "plans.read",
            "analytics.read",
            "support.read",
            "audit.read",
        ],
        "isSystem": True,
    },
]

DEFAULT_PLANS = [
    {
        "id": "plan_basic",
        "name": "پایه",
        "description": "منوی دیجیتال و امکانات ضروری",
        "status": "active",
        "displayOrder": 1,
        "entitlements": {
            "maxUsers": 3,
            "maxBranches": 1,
            "maxMenuItems": 100,
            "maxCategories": 20,
            "maxOrdersPerMonth": 1000,
            "maxCustomers": 500,
            "storageMb": 500,
            "digitalMenu": True,
            "qrMenu": True,
            "orderManagement": True,
            "cashier": True,
            "crm": False,
            "paymentTerminal": False,
            "advancedAnalytics": False,
            "multipleUsers": True,
            "multipleBranches": False,
            "customBranding": False,
            "customDomain": False,
            "prioritySupport": False,
        },
        "prices": {
            "monthly": 990000,
            "6months": 5400000,
            "yearly": 9900000,
        },
    },
    {
        "id": "plan_professional",
        "name": "حرفه‌ای",
        "description": "صندوق، باشگاه مشتریان و ابزار رشد",
        "status": "active",
        "displayOrder": 2,
        "entitlements": {
            "maxUsers": 10,
            "maxBranches": 3,
            "maxMenuItems": 500,
            "maxCategories": 50,
            "maxOrdersPerMonth": 10000,
            "maxCustomers": 5000,
            "storageMb": 5000,
            "digitalMenu": True,
            "qrMenu": True,
            "orderManagement": True,
            "cashier": True,
            "crm": True,
            "paymentTerminal": True,
            "advancedAnalytics": True,
            "multipleUsers": True,
            "multipleBranches": True,
            "customBranding": True,
            "customDomain": False,
            "prioritySupport": False,
        },
        "prices": {
            "monthly": 2490000,
            "6months": 13500000,
            "yearly": 24900000,
        },
    },
    {
        "id": "plan_business",
        "name": "کسب‌وکار",
        "description": "چندشعبه‌ای و پشتیبانی اولویت‌دار",
        "status": "active",
        "displayOrder": 3,
        "entitlements": {
            "maxUsers": 50,
            "maxBranches": 20,
            "maxMenuItems": 5000,
            "maxCategories": 200,
            "maxOrdersPerMonth": 100000,
            "maxCustomers": 50000,
            "storageMb": 50000,
            "digitalMenu": True,
            "qrMenu": True,
            "orderManagement": True,
            "cashier": True,
            "crm": True,
            "paymentTerminal": True,
            "advancedAnalytics": True,
            "multipleUsers": True,
            "multipleBranches": True,
            "customBranding": True,
            "customDomain": True,
            "prioritySupport": True,
        },
        "prices": {
            "monthly": 4990000,
            "6months": 27000000,
            "yearly": 49900000,
        },
    },
]


def _now() -> int:
    return int(time.time())


def _iso(ts: int | None = None) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts or _now()))


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _collection(name: str, default: Any) -> Path:
    return PLATFORM / f"{name}.json"


def load_collection(name: str, default: Any) -> Any:
    return _read_json(_collection(name, default), default)


def save_collection(name: str, data: Any) -> None:
    _write_json(_collection(name, None), data)


def _load_cafes_with_slugs() -> list:
    cafes = load_collection("cafes", [])
    if not isinstance(cafes, list):
        cafes = []
    cafes, changed = ensure_cafe_slugs(cafes)
    if changed:
        save_collection("cafes", cafes)
    provision_live_cafes(cafes)
    return cafes


def _cafe_set_cashier_password(cafe: dict, password: str) -> None:
    settings = cafe.get("settings")
    if not isinstance(settings, dict):
        settings = {}
    settings["cashierPassword"] = str(password)
    cafe["settings"] = settings
    tenant_id = str(cafe.get("id") or "")
    if tenant_id:
        provision_tenant(cafe)
        set_tenant_cashier_password(tenant_id, password)


def _cafe_for_admin(cafe: dict) -> dict:
    out = dict(cafe)
    settings = out.get("settings")
    if isinstance(settings, dict):
        settings = dict(settings)
        settings.pop("cashierPasswordHash", None)
        settings["hasCashierPassword"] = has_cashier_password(str(out.get("id") or ""))
        out["settings"] = settings
    out["cashierAuth"] = cashier_auth_meta(str(out.get("id") or ""))
    return out


def _hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000
    )
    return f"pbkdf2${salt}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
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


def _parse_secret_kv() -> dict[str, str]:
    out: dict[str, str] = {}
    if not SECRET.exists():
        return out
    text = SECRET.read_text(encoding="utf-8", errors="ignore")
    for key in (
        "SUPER_ADMIN_EMAIL",
        "SUPER_ADMIN_PASSWORD",
        "SUPER_ADMIN_NAME",
    ):
        m = re.search(rf"\${key}\s*=\s*\"([^\"]*)\"", text)
        if m:
            out[key] = m.group(1)
    return out


def ensure_platform() -> None:
    PLATFORM.mkdir(parents=True, exist_ok=True)
    roles = load_collection("roles", None)
    if not isinstance(roles, list) or not roles:
        save_collection("roles", DEFAULT_ROLES)

    admins = load_collection("admins", None)
    if not isinstance(admins, list) or not admins:
        secrets_map = _parse_secret_kv()
        email = (
            secrets_map.get("SUPER_ADMIN_EMAIL")
            or os.environ.get("SUPER_ADMIN_EMAIL")
            or "owner@miiziito.local"
        ).strip().lower()
        password = (
            secrets_map.get("SUPER_ADMIN_PASSWORD")
            or os.environ.get("SUPER_ADMIN_PASSWORD")
            or "MiiziitoOwner#2026"
        )
        name = secrets_map.get("SUPER_ADMIN_NAME") or "Platform Owner"
        admins = [
            {
                "id": "admin_owner",
                "email": email,
                "username": "owner",
                "passwordHash": _hash_password(password),
                "name": name,
                "roleId": "role_owner",
                "status": "active",
                "createdAt": _iso(),
                "updatedAt": _iso(),
                "lastLoginAt": None,
            }
        ]
        save_collection("admins", admins)

    for name, default in (
        ("sessions", {}),
        ("cafes", []),
        ("cafe_owners", []),
        ("recharge_requests", []),
        ("plans", []),
        ("subscriptions", []),
        ("saas_payments", []),
        ("coupons", []),
        ("notifications", []),
        ("support_tickets", []),
        ("audit_logs", []),
        ("login_attempts", []),
        ("impersonations", []),
        ("settings", {
            "trialDays": 14,
            "reminderDays": [30, 7, 3, 1],
            "gracePeriodDays": 3,
            "currency": "IRT",
            "supportPhone": "",
            "supportNote": "پس از ثبت درخواست، شماره کارت برای واریز ارسال می‌شود.",
            "paymentCardNumber": "",
            "paymentCardHolder": "",
            "paymentInstructions": "مبلغ را کارت‌به‌کارت کنید و در مرحله بعد اطلاعات واریز را ثبت کنید.",
        }),
    ):
        cur = load_collection(name, None)
        if cur is None:
            save_collection(name, default)

    plans = load_collection("plans", [])
    if isinstance(plans, list) and not plans:
        seeded = []
        for p in DEFAULT_PLANS:
            item = dict(p)
            prices = item.pop("prices")
            plan = {**item, "createdAt": _iso(), "updatedAt": _iso(), "prices": prices}
            seeded.append(plan)
        save_collection("plans", seeded)
    elif isinstance(plans, list):
        # One-time Farsi labels for seeded English plan names
        rename = {
            "Basic": ("پایه", "منوی دیجیتال و امکانات ضروری"),
            "Professional": ("حرفه‌ای", "صندوق، باشگاه مشتریان و ابزار رشد"),
            "Business": ("کسب‌وکار", "چندشعبه‌ای و پشتیبانی اولویت‌دار"),
        }
        changed = False
        for p in plans:
            key = str(p.get("name") or "")
            if key in rename:
                p["name"], p["description"] = rename[key]
                p["updatedAt"] = _iso()
                changed = True
        if changed:
            save_collection("plans", plans)


def _client_ip(headers: dict) -> str:
    for key in ("X-Forwarded-For", "X-Real-IP", "Remote-Addr"):
        val = headers.get(key) or headers.get(key.lower())
        if val:
            return str(val).split(",")[0].strip()[:120]
    return ""


def _audit(
    admin: dict | None,
    action: str,
    target_type: str = "",
    target_id: str = "",
    ip: str = "",
    metadata: dict | None = None,
) -> None:
    logs = load_collection("audit_logs", [])
    if not isinstance(logs, list):
        logs = []
    logs.append(
        {
            "id": _new_id("aud"),
            "adminId": (admin or {}).get("id"),
            "adminEmail": (admin or {}).get("email"),
            "action": action,
            "targetType": target_type,
            "targetId": target_id,
            "ip": ip,
            "metadata": metadata or {},
            "createdAt": _iso(),
        }
    )
    if len(logs) > 20000:
        logs = logs[-20000:]
    save_collection("audit_logs", logs)


def _role_for(admin: dict) -> dict | None:
    roles = load_collection("roles", [])
    if not isinstance(roles, list):
        return None
    for r in roles:
        if r.get("id") == admin.get("roleId"):
            return r
    return None


def has_permission(admin: dict, permission: str) -> bool:
    role = _role_for(admin)
    if not role:
        return False
    perms = role.get("permissions") or []
    if "*" in perms:
        return True
    return permission in perms


def get_token(headers: dict, body: dict | None = None) -> str:
    body = body or {}
    token = headers.get("X-Super-Admin-Token") or headers.get("x-super-admin-token") or ""
    if not token:
        auth = headers.get("Authorization") or headers.get("authorization") or ""
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
    if not token:
        token = str(body.get("token") or "")
    return token


def session_record(token: str) -> dict | None:
    if not token:
        return None
    sessions = load_collection("sessions", {})
    if not isinstance(sessions, dict):
        return None
    rec = sessions.get(token)
    if not isinstance(rec, dict):
        return None
    if int(rec.get("expiresAt") or 0) < _now():
        del sessions[token]
        save_collection("sessions", sessions)
        return None
    return rec


def session_admin(token: str) -> dict | None:
    rec = session_record(token)
    if not rec or not rec.get("adminId"):
        return None
    if rec.get("kind") == "cafe":
        return None
    admins = load_collection("admins", [])
    for a in admins if isinstance(admins, list) else []:
        if a.get("id") == rec.get("adminId") and a.get("status") == "active":
            return a
    return None


def session_cafe_owner(token: str) -> dict | None:
    rec = session_record(token)
    if not rec or rec.get("kind") != "cafe":
        return None
    owners = load_collection("cafe_owners", [])
    for o in owners if isinstance(owners, list) else []:
        if o.get("id") == rec.get("cafeOwnerId") and o.get("status") == "active":
            return o
    return None


def require_admin(
    headers: dict, body: dict | None = None, permission: str | None = None
) -> tuple[dict | None, dict | None]:
    ensure_platform()
    token = get_token(headers, body)
    admin = session_admin(token)
    if not admin:
        return None, {"status": 401, "body": {"error": "auth_required"}}
    if permission and not has_permission(admin, permission):
        return None, {"status": 403, "body": {"error": "forbidden"}}
    return admin, None


def require_cafe(
    headers: dict, body: dict | None = None
) -> tuple[dict | None, dict | None]:
    ensure_platform()
    token = get_token(headers, body)
    owner = session_cafe_owner(token)
    if not owner:
        return None, {"status": 401, "body": {"error": "auth_required"}}
    return owner, None


def _public_cafe_owner(owner: dict) -> dict:
    return {
        "id": owner.get("id"),
        "email": owner.get("email"),
        "name": owner.get("name"),
        "phone": owner.get("phone"),
        "tenantId": owner.get("tenantId"),
        "status": owner.get("status"),
        "lastLoginAt": owner.get("lastLoginAt"),
    }


def _public_site_origin() -> str:
    for key in ("MIIZIITO_SITE_URL", "NEXT_PUBLIC_MIIZIITO_SITE_URL", "LUMIERE_SITE_URL"):
        val = (os.environ.get(key) or "").strip()
        if val:
            return val.rstrip("/")
    return "https://miiziito.ir"


def _find_owner_by_tenant(tenant_id: str) -> dict | None:
    if not tenant_id:
        return None
    owners = load_collection("cafe_owners", [])
    for o in owners if isinstance(owners, list) else []:
        if isinstance(o, dict) and str(o.get("tenantId") or "") == str(tenant_id):
            return o
    return None


def _save_owner(owner: dict) -> None:
    if not owner.get("id"):
        return
    owners = load_collection("cafe_owners", [])
    if not isinstance(owners, list):
        owners = []
    for i, o in enumerate(owners):
        if isinstance(o, dict) and o.get("id") == owner.get("id"):
            owners[i] = owner
            save_collection("cafe_owners", owners)
            return
    owners.append(owner)
    save_collection("cafe_owners", owners)


def _set_owner_password(owner: dict, password: str) -> None:
    owner["passwordHash"] = _hash_password(password)
    owner["passwordPlain"] = str(password)
    owner["updatedAt"] = _iso()


def _send_access_ticket(cafe: dict, owner: dict | None = None) -> dict | None:
    if not isinstance(cafe, dict) or not cafe.get("id"):
        return None
    if owner is None:
        owner = _find_owner_by_tenant(str(cafe.get("id") or ""))
    slug = str(cafe.get("slug") or "").strip()
    if not slug:
        return None

    cafes = load_collection("cafes", [])
    if not isinstance(cafes, list):
        cafes = []
    cafe_idx = next((i for i, c in enumerate(cafes) if c.get("id") == cafe.get("id")), -1)
    if cafe_idx >= 0:
        cafe = cafes[cafe_idx]
    cashier_password = str((cafe.get("settings") or {}).get("cashierPassword") or "")
    if not cashier_password:
        cashier_password = secrets.token_urlsafe(8)
        _cafe_set_cashier_password(cafe, cashier_password)
        if cafe_idx >= 0:
            cafes[cafe_idx] = cafe
            save_collection("cafes", cafes)

    origin = _public_site_origin()
    menu_url = f"{origin}/{slug}/"
    admin_url = f"{origin}/{slug}/admin/"
    account_url = f"{origin}/panel-admin/login/"
    email = str((owner or {}).get("email") or cafe.get("email") or "")
    owner_pass = str((owner or {}).get("passwordPlain") or "")

    lines = [
        "اشتراک شما فعال شد. اطلاعات دسترسی کافه:",
        "",
        "آدرس منو:",
        menu_url,
        "",
        "آدرس پنل مدیریت (صندوق):",
        admin_url,
        "",
        "رمز ورود پنل مدیریت:",
        cashier_password,
        "",
        "حساب اشتراک (خرید / تمدید / پشتیبانی):",
        account_url,
    ]
    if email:
        lines.append(f"ایمیل ورود: {email}")
        if owner_pass:
            lines.append(f"رمز حساب اشتراک: {owner_pass}")
        else:
            lines.append("رمز حساب اشتراک: همان رمزی که هنگام ثبت‌نام وارد کردید.")
    lines.extend(["", "می‌توانید رمزها را از صفحه حساب اشتراک تغییر دهید."])

    tickets = load_collection("support_tickets", [])
    if not isinstance(tickets, list):
        tickets = []
    ticket = {
        "id": _new_id("tkt"),
        "tenantId": cafe.get("id"),
        "cafeName": cafe.get("name") or "",
        "cafeOwnerEmail": email,
        "subject": "اطلاعات دسترسی — منو و پنل مدیریت",
        "priority": "high",
        "status": "waiting_customer",
        "assignedAdminId": None,
        "relatedRequestId": None,
        "messages": [
            {
                "id": _new_id("msg"),
                "from": "admin",
                "body": "\n".join(lines),
                "createdAt": _iso(),
            }
        ],
        "createdAt": _iso(),
        "updatedAt": _iso(),
        "lastReplyAt": _iso(),
        "adminReadAt": _iso(),
    }
    tickets.insert(0, ticket)
    save_collection("support_tickets", tickets)
    return ticket


def _find_cafe(tenant_id: str) -> dict | None:
    cafes = load_collection("cafes", [])
    for c in cafes if isinstance(cafes, list) else []:
        if c.get("id") == tenant_id:
            return c
    return None


def _cafe_tickets_for_owner(owner: dict) -> list:
    tickets = load_collection("support_tickets", [])
    if not isinstance(tickets, list):
        tickets = []
    owner_tenant = owner.get("tenantId")
    mine = [t for t in tickets if isinstance(t, dict) and t.get("tenantId") == owner_tenant]
    return sorted(mine, key=lambda t: t.get("createdAt") or "", reverse=True)


def _cafe_ticket_owned(ticket: dict, owner: dict) -> bool:
    return isinstance(ticket, dict) and ticket.get("tenantId") == owner.get("tenantId")


def _cafe_portal_payload(owner: dict) -> dict:
    cafe = _find_cafe(str(owner.get("tenantId") or ""))
    plans = load_collection("plans", [])
    if not isinstance(plans, list):
        plans = []
    plan_map = {p.get("id"): p for p in plans}
    subs = load_collection("subscriptions", [])
    if not isinstance(subs, list):
        subs = []
    tenant_subs = [s for s in subs if s.get("tenantId") == owner.get("tenantId")]
    tenant_subs = sorted(tenant_subs, key=lambda s: s.get("createdAt") or "", reverse=True)
    current = None
    for s in tenant_subs:
        if s.get("status") in ("trial", "active", "past_due", "grace_period"):
            current = s
            break
    if not current and tenant_subs:
        current = tenant_subs[0]
    requests = load_collection("recharge_requests", [])
    if not isinstance(requests, list):
        requests = []
    my_reqs = [
        r
        for r in requests
        if r.get("tenantId") == owner.get("tenantId")
        or r.get("cafeOwnerId") == owner.get("id")
    ]
    my_reqs = sorted(my_reqs, key=lambda r: r.get("createdAt") or "", reverse=True)
    current_plan = plan_map.get((current or {}).get("planId")) if current else None
    if not current_plan and cafe:
        current_plan = plan_map.get(cafe.get("planId"))
    platform_settings = load_collection("settings", {})
    if not isinstance(platform_settings, dict):
        platform_settings = {}
    my_tickets = _cafe_tickets_for_owner(owner)
    ticket_summaries = [
        {
            "id": t.get("id"),
            "subject": t.get("subject"),
            "status": t.get("status") or "open",
            "priority": t.get("priority") or "normal",
            "createdAt": t.get("createdAt"),
            "lastReplyAt": t.get("lastReplyAt"),
        }
        for t in my_tickets[:20]
    ]
    origin = _public_site_origin()
    slug = str((cafe or {}).get("slug") or "").strip()
    cashier_password = str(((cafe or {}).get("settings") or {}).get("cashierPassword") or "")
    cafe_out = dict(cafe) if isinstance(cafe, dict) else cafe
    if isinstance(cafe_out, dict):
        cafe_settings = dict(cafe_out.get("settings") or {})
        cafe_settings.pop("cashierPassword", None)
        cafe_settings.pop("cashierPasswordHash", None)
        cafe_out["settings"] = cafe_settings
    return {
        "owner": _public_cafe_owner(owner),
        "cafe": cafe_out,
        "subscription": current,
        "plan": current_plan,
        "history": tenant_subs[:20],
        "requests": my_reqs[:20],
        "plans": [p for p in plans if p.get("status") == "active"],
        "paymentInstructions": str(platform_settings.get("paymentInstructions") or ""),
        "supportPhone": str(platform_settings.get("supportPhone") or ""),
        "tickets": ticket_summaries,
        "access": {
            "menuUrl": f"{origin}/{slug}/" if slug else "",
            "adminUrl": f"{origin}/{slug}/admin/" if slug else "",
            "cashierPassword": cashier_password,
            "accountEmail": str(owner.get("email") or ""),
        },
    }


def _rate_limited(email: str, ip: str) -> bool:
    attempts = load_collection("login_attempts", [])
    if not isinstance(attempts, list):
        return False
    cutoff = _now() - LOGIN_WINDOW
    recent = [
        a
        for a in attempts
        if (a.get("email") == email or a.get("ip") == ip)
        and int(a.get("createdAtTs") or 0) >= cutoff
        and not a.get("success")
    ]
    return len(recent) >= LOGIN_MAX_ATTEMPTS


def _record_attempt(email: str, ip: str, success: bool) -> None:
    attempts = load_collection("login_attempts", [])
    if not isinstance(attempts, list):
        attempts = []
    attempts.append(
        {
            "email": email,
            "ip": ip,
            "success": success,
            "createdAt": _iso(),
            "createdAtTs": _now(),
        }
    )
    if len(attempts) > 5000:
        attempts = attempts[-5000:]
    save_collection("login_attempts", attempts)


def _public_admin(admin: dict) -> dict:
    role = _role_for(admin) or {}
    return {
        "id": admin.get("id"),
        "email": admin.get("email"),
        "username": admin.get("username"),
        "name": admin.get("name"),
        "roleId": admin.get("roleId"),
        "roleName": role.get("name"),
        "permissions": role.get("permissions") or [],
        "status": admin.get("status"),
        "lastLoginAt": admin.get("lastLoginAt"),
    }


def _pct_change(current: float, previous: float) -> float | None:
    if previous == 0:
        return 100.0 if current > 0 else (0.0 if current == 0 else None)
    return round(((current - previous) / abs(previous)) * 100, 1)


def _parse_iso_ts(value) -> int | None:
    if not value:
        return None
    try:
        from datetime import datetime

        return int(datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp())
    except Exception:
        return None


def _support_ticket_meta(ticket: dict) -> dict:
    messages = ticket.get("messages") or []
    if not isinstance(messages, list):
        messages = []
    last_from = None
    last_cafe_msg_at = None
    has_admin_msg = False
    for m in messages:
        if not isinstance(m, dict):
            continue
        if m.get("from") == "admin":
            has_admin_msg = True
        if m.get("from") == "cafe":
            last_cafe_msg_at = m.get("createdAt") or last_cafe_msg_at
    if messages:
        last = messages[-1]
        if isinstance(last, dict):
            last_from = last.get("from")
    status = str(ticket.get("status") or "open")
    active = status in ("open", "in_progress")
    needs_admin_reply = active and (last_from == "cafe" or (last_from is None and not has_admin_msg))

    # "New" until an admin opens the ticket; becomes new again if cafe sends after that.
    admin_read_at = str(ticket.get("adminReadAt") or "")
    unread_since_open = admin_read_at == ""
    if not unread_since_open and last_cafe_msg_at:
        read_ts = _parse_iso_ts(admin_read_at)
        cafe_ts = _parse_iso_ts(last_cafe_msg_at)
        if read_ts is not None and cafe_ts is not None and cafe_ts > read_ts:
            unread_since_open = True
    is_new = needs_admin_reply and unread_since_open
    attention_rank = 2 if is_new else (1 if needs_admin_reply else 0)
    return {
        "needsAdminReply": needs_admin_reply,
        "isNew": is_new,
        "lastMessageFrom": last_from,
        "attentionRank": attention_rank,
    }


def _enrich_support_tickets(tickets: list) -> list:
    if not isinstance(tickets, list):
        return []
    out = []
    for t in tickets:
        if not isinstance(t, dict):
            continue
        out.append({**t, **_support_ticket_meta(t)})
    out.sort(
        key=lambda x: (int(x.get("attentionRank") or 0), str(x.get("createdAt") or "")),
        reverse=True,
    )
    return out


def _filter_page(items: list, qs: dict, search_fields: list[str]) -> dict:
    q = ((qs.get("q") or [""])[0] or "").strip().lower()
    status = ((qs.get("status") or [""])[0] or "").strip().lower()
    sort = ((qs.get("sort") or ["createdAt"])[0] or "createdAt").strip()
    order = ((qs.get("order") or ["desc"])[0] or "desc").strip().lower()
    try:
        page = max(1, int((qs.get("page") or ["1"])[0]))
    except ValueError:
        page = 1
    try:
        page_size = min(100, max(1, int((qs.get("pageSize") or ["20"])[0])))
    except ValueError:
        page_size = 20

    filtered = items
    if status:
        if status == "needs_reply":
            filtered = [i for i in filtered if i.get("needsAdminReply")]
        else:
            filtered = [i for i in filtered if str(i.get("status") or "").lower() == status]
    if q:
        def match(item: dict) -> bool:
            for f in search_fields:
                if q in str(item.get(f) or "").lower():
                    return True
            return False

        filtered = [i for i in filtered if match(i)]

    reverse = order != "asc"
    try:
        filtered = sorted(filtered, key=lambda x: x.get(sort) or "", reverse=reverse)
    except Exception:
        pass

    total = len(filtered)
    start = (page - 1) * page_size
    slice_ = filtered[start : start + page_size]
    return {
        "items": slice_,
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": max(1, (total + page_size - 1) // page_size),
    }


def _dashboard_kpis() -> dict:
    cafes = load_collection("cafes", [])
    subs = load_collection("subscriptions", [])
    payments = load_collection("saas_payments", [])
    if not isinstance(cafes, list):
        cafes = []
    if not isinstance(subs, list):
        subs = []
    if not isinstance(payments, list):
        payments = []

    def count_status(status: str) -> int:
        return sum(1 for c in cafes if c.get("status") == status)

    now = _now()
    month_ago = now - 30 * 86400
    prev_month_start = now - 60 * 86400

    def created_ts(item: dict) -> int:
        try:
            # ISO Z
            return int(
                time.mktime(time.strptime(item.get("createdAt", "")[:19], "%Y-%m-%dT%H:%M:%S"))
            )
        except Exception:
            return 0

    new_customers = sum(1 for c in cafes if created_ts(c) >= month_ago)
    prev_new = sum(1 for c in cafes if prev_month_start <= created_ts(c) < month_ago)

    active_subs = [s for s in subs if s.get("status") == "active"]
    mrr = 0
    for s in active_subs:
        price = int(s.get("price") or 0)
        cycle = s.get("billingCycle") or "monthly"
        if cycle == "yearly":
            mrr += price // 12
        elif cycle == "6months":
            mrr += price // 6
        else:
            mrr += price

    cancelled_recent = sum(
        1
        for s in subs
        if s.get("status") == "cancelled" and created_ts(s) >= month_ago
    )
    churn_denom = max(len(active_subs) + cancelled_recent, 1)
    churn_rate = round((cancelled_recent / churn_denom) * 100, 1)

    successful = [
        p for p in payments if p.get("status") == "successful" and created_ts(p) >= month_ago
    ]
    prev_successful = [
        p
        for p in payments
        if p.get("status") == "successful" and prev_month_start <= created_ts(p) < month_ago
    ]
    rev = sum(int(p.get("amount") or 0) for p in successful)
    prev_rev = sum(int(p.get("amount") or 0) for p in prev_successful)

    expired = sum(1 for s in subs if s.get("status") in ("expired", "past_due"))
    expiring = []
    for s in active_subs:
        end = s.get("endDate")
        if not end:
            continue
        try:
            end_ts = int(time.mktime(time.strptime(str(end)[:19], "%Y-%m-%dT%H:%M:%S")))
        except Exception:
            continue
        if 0 <= end_ts - now <= 14 * 86400:
            expiring.append(s)

    plan_counts: dict[str, int] = {}
    for s in active_subs:
        pid = str(s.get("planId") or "")
        plan_counts[pid] = plan_counts.get(pid, 0) + 1

    return {
        "kpis": {
            "totalCafes": {"value": len(cafes), "change": _pct_change(len(cafes), max(len(cafes) - new_customers, 0))},
            "activeCafes": {"value": count_status("active"), "change": None},
            "trialCafes": {"value": count_status("trial"), "change": None},
            "suspendedCafes": {"value": count_status("suspended"), "change": None},
            "expiredSubscriptions": {"value": expired, "change": None},
            "mrr": {"value": mrr, "change": _pct_change(mrr, max(mrr - (rev // 30 if rev else 0), 0))},
            "arr": {"value": mrr * 12, "change": None},
            "newCustomers": {"value": new_customers, "change": _pct_change(new_customers, prev_new)},
            "churnRate": {"value": churn_rate, "change": None},
            "revenue30d": {"value": rev, "change": _pct_change(rev, prev_rev)},
        },
        "expiringSoon": expiring[:10],
        "popularPlans": sorted(
            [{"planId": k, "count": v} for k, v in plan_counts.items()],
            key=lambda x: x["count"],
            reverse=True,
        )[:5],
        "recentPayments": sorted(payments, key=lambda p: p.get("createdAt") or "", reverse=True)[:8],
    }


def handle(
    method: str,
    route: str,
    item_id: str,
    body: dict,
    qs: dict,
    headers: dict,
) -> dict | None:
    """Return {status, body} or None if route is not a super-admin route."""
    if not route.startswith("sa-"):
        return None

    ensure_platform()
    ip = _client_ip(headers)

    # ── Auth (admin + cafe owner) ─────────────────────────
    if route == "sa-login" and method == "POST":
        email = str(body.get("email") or body.get("username") or "").strip().lower()
        password = str(body.get("password") or "")
        remember = bool(body.get("remember"))
        if not email or not password:
            return {"status": 400, "body": {"error": "missing_credentials"}}
        if _rate_limited(email, ip):
            return {"status": 429, "body": {"error": "too_many_attempts"}}

        # Try super admin first
        admins = load_collection("admins", [])
        admin = None
        for a in admins if isinstance(admins, list) else []:
            if (
                str(a.get("email") or "").lower() == email
                or str(a.get("username") or "").lower() == email
            ):
                admin = a
                break
        if (
            admin
            and admin.get("status") == "active"
            and _verify_password(password, str(admin.get("passwordHash") or ""))
        ):
            _record_attempt(email, ip, True)
            token = secrets.token_hex(32)
            ttl = SESSION_TTL_REMEMBER if remember else SESSION_TTL
            sessions = load_collection("sessions", {})
            if not isinstance(sessions, dict):
                sessions = {}
            sessions[token] = {
                "kind": "admin",
                "adminId": admin["id"],
                "createdAt": _now(),
                "expiresAt": _now() + ttl,
                "remember": remember,
                "ip": ip,
            }
            save_collection("sessions", sessions)
            admin["lastLoginAt"] = _iso()
            admin["updatedAt"] = _iso()
            for i, a in enumerate(admins):
                if a.get("id") == admin["id"]:
                    admins[i] = admin
                    break
            save_collection("admins", admins)
            _audit(admin, "login", "admin", admin["id"], ip)
            return {
                "status": 200,
                "body": {
                    "token": token,
                    "expiresIn": ttl,
                    "kind": "admin",
                    "admin": _public_admin(admin),
                },
            }

        # Then cafe owner
        owners = load_collection("cafe_owners", [])
        owner = None
        for o in owners if isinstance(owners, list) else []:
            if str(o.get("email") or "").lower() == email:
                owner = o
                break
        if (
            owner
            and owner.get("status") == "active"
            and _verify_password(password, str(owner.get("passwordHash") or ""))
        ):
            _record_attempt(email, ip, True)
            token = secrets.token_hex(32)
            ttl = SESSION_TTL_REMEMBER if remember else SESSION_TTL
            sessions = load_collection("sessions", {})
            if not isinstance(sessions, dict):
                sessions = {}
            sessions[token] = {
                "kind": "cafe",
                "cafeOwnerId": owner["id"],
                "tenantId": owner.get("tenantId"),
                "createdAt": _now(),
                "expiresAt": _now() + ttl,
                "remember": remember,
                "ip": ip,
            }
            save_collection("sessions", sessions)
            owner["lastLoginAt"] = _iso()
            owner["updatedAt"] = _iso()
            for i, o in enumerate(owners):
                if o.get("id") == owner["id"]:
                    owners[i] = owner
                    break
            save_collection("cafe_owners", owners)
            return {
                "status": 200,
                "body": {
                    "token": token,
                    "expiresIn": ttl,
                    "kind": "cafe",
                    "owner": _public_cafe_owner(owner),
                },
            }

        _record_attempt(email, ip, False)
        return {"status": 401, "body": {"error": "bad_credentials"}}

    if route == "sa-register" and method == "POST":
        email = str(body.get("email") or "").strip().lower()
        password = str(body.get("password") or "")
        cafe_name = str(body.get("cafeName") or body.get("name") or "").strip()
        owner_name = str(body.get("ownerName") or body.get("name") or "").strip()
        phone = str(body.get("phone") or "").strip()
        if not email or not password or not cafe_name:
            return {"status": 400, "body": {"error": "missing_fields"}}
        if len(password) < 6:
            return {"status": 400, "body": {"error": "weak_password"}}
        if _rate_limited(email, ip):
            return {"status": 429, "body": {"error": "too_many_attempts"}}
        owners = load_collection("cafe_owners", [])
        if not isinstance(owners, list):
            owners = []
        for o in owners:
            if str(o.get("email") or "").lower() == email:
                return {"status": 409, "body": {"error": "email_exists"}}
        cafes = load_collection("cafes", [])
        if not isinstance(cafes, list):
            cafes = []
        cafe = {
            "id": _new_id("cafe"),
            "name": cafe_name,
            "ownerName": owner_name or cafe_name,
            "email": email,
            "phone": phone,
            "status": "pending",
            "planId": None,
            "subscriptionId": None,
            "settings": {},
            "usage": {
                "menuItems": 0,
                "categories": 0,
                "orders": 0,
                "invoices": 0,
                "customers": 0,
                "users": 1,
                "storageMb": 0,
                "mau": 0,
            },
            "lastActivityAt": None,
            "createdAt": _iso(),
            "updatedAt": _iso(),
        }
        preferred_slug = str(body.get("slug") or "").strip()
        assign_slug(cafe, cafes, preferred_slug)
        owner = {
            "id": _new_id("cown"),
            "email": email,
            "passwordHash": _hash_password(password),
            "passwordPlain": password,
            "name": owner_name or cafe_name,
            "phone": phone,
            "tenantId": cafe["id"],
            "status": "active",
            "createdAt": _iso(),
            "updatedAt": _iso(),
            "lastLoginAt": None,
        }
        cafes.append(cafe)
        owners.append(owner)
        # Ensure cashier password exists for admin panel access
        _cafe_set_cashier_password(cafe, generate_cashier_password())
        cafes[-1] = cafe
        save_collection("cafes", cafes)
        save_collection("cafe_owners", owners)
        _audit(None, "cafe_register", "cafe", cafe["id"], ip, {"email": email})
        # auto login
        token = secrets.token_hex(32)
        sessions = load_collection("sessions", {})
        if not isinstance(sessions, dict):
            sessions = {}
        sessions[token] = {
            "kind": "cafe",
            "cafeOwnerId": owner["id"],
            "tenantId": cafe["id"],
            "createdAt": _now(),
            "expiresAt": _now() + SESSION_TTL,
            "remember": False,
            "ip": ip,
        }
        save_collection("sessions", sessions)
        return {
            "status": 200,
            "body": {
                "token": token,
                "expiresIn": SESSION_TTL,
                "kind": "cafe",
                "owner": _public_cafe_owner(owner),
                "cafe": cafe,
            },
        }

    if route == "sa-public-plans" and method == "GET":
        ensure_platform()
        plans = load_collection("plans", [])
        if not isinstance(plans, list):
            plans = []
        active = [p for p in plans if p.get("status") == "active"]
        active = sorted(active, key=lambda p: int(p.get("displayOrder") or 0))
        settings = load_collection("settings", {})
        return {
            "status": 200,
            "body": {
                "plans": active,
                "supportNote": (settings or {}).get(
                    "supportNote",
                    "پس از ثبت درخواست، شماره کارت برای واریز ارسال می‌شود.",
                ),
                "supportPhone": (settings or {}).get("supportPhone") or "",
                "paymentInstructions": (settings or {}).get("paymentInstructions") or "",
            },
        }

    if route == "sa-logout" and method == "POST":
        token = get_token(headers, body)
        admin = session_admin(token)
        owner = session_cafe_owner(token)
        sessions = load_collection("sessions", {})
        if isinstance(sessions, dict) and token in sessions:
            del sessions[token]
            save_collection("sessions", sessions)
        if admin:
            _audit(admin, "logout", "admin", admin.get("id", ""), ip)
        return {"status": 200, "body": {"ok": True}}

    if route == "sa-me" and method == "GET":
        admin = session_admin(get_token(headers, body))
        if admin:
            return {"status": 200, "body": {"kind": "admin", "admin": _public_admin(admin)}}
        owner = session_cafe_owner(get_token(headers, body))
        if owner:
            return {"status": 200, "body": {"kind": "cafe", "owner": _public_cafe_owner(owner)}}
        return {"status": 401, "body": {"error": "auth_required"}}

    if route == "sa-cafe-portal" and method == "GET":
        owner, err = require_cafe(headers, body)
        if err:
            return err
        return {"status": 200, "body": _cafe_portal_payload(owner)}

    if route == "sa-cafe-change-password" and method == "POST":
        owner, err = require_cafe(headers, body)
        if err:
            return err
        kind = str(body.get("kind") or "account")
        current_password = str(body.get("currentPassword") or "")
        new_password = str(body.get("newPassword") or "")
        if len(new_password) < 6:
            return {"status": 400, "body": {"error": "weak_password"}}

        if kind in ("cashier", "admin_panel"):
            cafe = _find_cafe(str(owner.get("tenantId") or ""))
            if not cafe:
                return {"status": 404, "body": {"error": "cafe_not_found"}}
            existing_plain = str((cafe.get("settings") or {}).get("cashierPassword") or "")
            has_existing = bool(existing_plain) or has_cashier_password(str(cafe.get("id") or ""))
            if has_existing:
                ok = False
                if current_password and existing_plain and hmac.compare_digest(existing_plain, current_password):
                    ok = True
                if not ok and current_password:
                    verified = verify_tenant_cashier_password(str(cafe.get("id") or ""), current_password)
                    ok = verified is True
                if not ok:
                    return {"status": 401, "body": {"error": "bad_credentials"}}
            cafes = load_collection("cafes", [])
            if not isinstance(cafes, list):
                cafes = []
            for i, c in enumerate(cafes):
                if c.get("id") == cafe.get("id"):
                    _cafe_set_cashier_password(c, new_password)
                    c["updatedAt"] = _iso()
                    cafes[i] = c
                    break
            save_collection("cafes", cafes)
            return {"status": 200, "body": {"ok": True, "kind": "cashier", "cashierPassword": new_password}}

        if not current_password or not _verify_password(current_password, str(owner.get("passwordHash") or "")):
            return {"status": 401, "body": {"error": "bad_credentials"}}
        _set_owner_password(owner, new_password)
        _save_owner(owner)
        return {"status": 200, "body": {"ok": True, "kind": "account"}}

    if route == "sa-cafe-support" and method == "GET":
        owner, err = require_cafe(headers, body)
        if err:
            return err
        tickets = _cafe_tickets_for_owner(owner)
        return {"status": 200, "body": {"items": tickets, "total": len(tickets)}}

    if route == "sa-cafe-support" and method == "POST":
        owner, err = require_cafe(headers, body)
        if err:
            return err
        subject = str(body.get("subject") or "").strip()
        msg_body = str(body.get("body") or "").strip()
        if not subject:
            return {"status": 400, "body": {"error": "missing_subject"}}
        cafe = _find_cafe(str(owner.get("tenantId") or ""))
        tickets = load_collection("support_tickets", [])
        if not isinstance(tickets, list):
            tickets = []
        messages = []
        if msg_body:
            messages.append(
                {
                    "id": _new_id("msg"),
                    "from": "cafe",
                    "body": msg_body,
                    "createdAt": _iso(),
                }
            )
        ticket = {
            "id": _new_id("tkt"),
            "tenantId": owner.get("tenantId"),
            "cafeName": (cafe or {}).get("name") or "",
            "cafeOwnerEmail": owner.get("email") or "",
            "subject": subject,
            "priority": "normal",
            "status": "open",
            "assignedAdminId": None,
            "messages": messages,
            "createdAt": _iso(),
            "updatedAt": _iso(),
            "lastReplyAt": _iso() if msg_body else None,
        }
        tickets.insert(0, ticket)
        save_collection("support_tickets", tickets)
        return {"status": 200, "body": {"ticket": ticket}}

    if route == "sa-cafe-support-item" and item_id:
        owner, err = require_cafe(headers, body)
        if err:
            return err
        tickets = load_collection("support_tickets", [])
        if not isinstance(tickets, list):
            tickets = []
        idx = next((i for i, t in enumerate(tickets) if t.get("id") == item_id), -1)
        if idx < 0:
            return {"status": 404, "body": {"error": "not_found"}}
        ticket = tickets[idx]
        if not _cafe_ticket_owned(ticket, owner):
            return {"status": 403, "body": {"error": "forbidden"}}
        if method == "GET":
            return {"status": 200, "body": {"ticket": ticket}}
        if method == "POST":
            action = str(body.get("action") or "reply")
            if action == "reply":
                msg_body = str(body.get("body") or "").strip()
                if not msg_body:
                    return {"status": 400, "body": {"error": "missing_body"}}
                msgs = ticket.get("messages") or []
                msgs.append(
                    {
                        "id": _new_id("msg"),
                        "from": "cafe",
                        "body": msg_body,
                        "createdAt": _iso(),
                    }
                )
                ticket["messages"] = msgs
                ticket["lastReplyAt"] = _iso()
                if ticket.get("status") == "waiting_customer":
                    ticket["status"] = "open"
            ticket["updatedAt"] = _iso()
            tickets[idx] = ticket
            save_collection("support_tickets", tickets)
            return {"status": 200, "body": {"ticket": ticket}}

    if route == "sa-recharge-requests" and method == "GET":
        admin = session_admin(get_token(headers, body))
        if admin:
            if not has_permission(admin, "support.read") and not has_permission(admin, "*"):
                if not has_permission(admin, "subscriptions.read"):
                    return {"status": 403, "body": {"error": "forbidden"}}
            reqs = load_collection("recharge_requests", [])
            if not isinstance(reqs, list):
                reqs = []
            reqs = sorted(reqs, key=lambda r: r.get("createdAt") or "", reverse=True)
            return {"status": 200, "body": _filter_page(
                reqs, qs, ["id", "cafeName", "ownerName", "phone", "email", "planId", "status"]
            )}
        owner, err = require_cafe(headers, body)
        if err:
            return err
        payload = _cafe_portal_payload(owner)
        return {"status": 200, "body": {"items": payload["requests"], "total": len(payload["requests"])}}

    if route == "sa-recharge-requests" and method == "POST":
        # Cafe creates a buy/recharge request (no payment)
        owner, err = require_cafe(headers, body)
        if err:
            return err
        cafe = _find_cafe(str(owner.get("tenantId") or ""))
        plans = load_collection("plans", [])
        plan_id = str(body.get("planId") or "")
        plan = next((p for p in (plans if isinstance(plans, list) else []) if p.get("id") == plan_id), None)
        if not plan:
            return {"status": 400, "body": {"error": "invalid_plan"}}
        cycle = str(body.get("billingCycle") or "monthly")
        if cycle not in ("monthly", "6months", "yearly"):
            cycle = "monthly"
        req_type = str(body.get("type") or "purchase")  # purchase | recharge | upgrade
        note = str(body.get("note") or "").strip()
        price = int((plan.get("prices") or {}).get(cycle) or 0)
        reqs = load_collection("recharge_requests", [])
        if not isinstance(reqs, list):
            reqs = []
        req = {
            "id": _new_id("req"),
            "type": req_type,
            "status": "pending",
            "tenantId": owner.get("tenantId"),
            "cafeOwnerId": owner.get("id"),
            "cafeName": (cafe or {}).get("name") or "",
            "ownerName": owner.get("name") or "",
            "email": owner.get("email") or "",
            "phone": owner.get("phone") or (cafe or {}).get("phone") or "",
            "planId": plan_id,
            "planName": plan.get("name"),
            "billingCycle": cycle,
            "price": price,
            "currency": "IRT",
            "note": note,
            "adminNote": "",
            "paymentCardNumber": "",
            "paymentCardHolder": "",
            "paymentInstructions": "",
            "userPaymentReference": "",
            "userPaymentNote": "",
            "paymentSentAt": None,
            "paymentSubmittedAt": None,
            "createdAt": _iso(),
            "updatedAt": _iso(),
            "contactedAt": None,
            "fulfilledAt": None,
        }
        reqs.insert(0, req)
        save_collection("recharge_requests", reqs)
        # also open a support ticket for the admin queue
        tickets = load_collection("support_tickets", [])
        if not isinstance(tickets, list):
            tickets = []
        ticket = {
            "id": _new_id("tkt"),
            "tenantId": owner.get("tenantId"),
            "subject": f"درخواست {req_type} — {plan.get('name')} ({cycle})",
            "priority": "normal",
            "status": "open",
            "assignedAdminId": None,
            "relatedRequestId": req["id"],
            "messages": [
                {
                    "id": _new_id("msg"),
                    "from": "cafe",
                    "body": note or f"درخواست {req_type} برای پلن {plan.get('name')}",
                    "createdAt": _iso(),
                }
            ],
            "createdAt": _iso(),
            "updatedAt": _iso(),
            "lastReplyAt": _iso(),
        }
        tickets.insert(0, ticket)
        save_collection("support_tickets", tickets)
        req["ticketId"] = ticket["id"]
        reqs[0] = req
        save_collection("recharge_requests", reqs)
        return {"status": 200, "body": {"request": req, "ticket": ticket}}

    if route == "sa-recharge-request" and item_id and method == "POST":
        reqs = load_collection("recharge_requests", [])
        if not isinstance(reqs, list):
            reqs = []
        idx = next((i for i, r in enumerate(reqs) if r.get("id") == item_id), -1)
        if idx < 0:
            return {"status": 404, "body": {"error": "not_found"}}
        req = reqs[idx]
        action = str(body.get("action") or "")

        admin = session_admin(get_token(headers, body))
        if not admin:
            owner, err = require_cafe(headers, body)
            if err:
                return err
            if action != "confirm_payment":
                return {"status": 403, "body": {"error": "forbidden"}}
            owner_tenant = owner.get("tenantId")
            owner_id = owner.get("id")
            owns = req.get("tenantId") == owner_tenant or req.get("cafeOwnerId") == owner_id
            if not owns:
                return {"status": 403, "body": {"error": "forbidden"}}
            st = str(req.get("status") or "")
            if st not in ("awaiting_payment", "contacted"):
                return {"status": 400, "body": {"error": "invalid_status"}}
            req["status"] = "payment_submitted"
            req["userPaymentReference"] = str(
                body.get("paymentReference") or body.get("reference") or ""
            ).strip()
            req["userPaymentNote"] = str(
                body.get("note") or body.get("userPaymentNote") or ""
            ).strip()
            req["paymentSubmittedAt"] = _iso()
            req["updatedAt"] = _iso()
            reqs[idx] = req
            save_collection("recharge_requests", reqs)
            return {"status": 200, "body": {"request": req}}

        admin, err = require_admin(headers, body, "subscriptions.write")
        if err:
            admin, err2 = require_admin(headers, body)
            if err2:
                return err2
            if not has_permission(admin, "*") and not has_permission(admin, "support.write"):
                return err
        if action in ("contact", "send_payment_info"):
            settings = load_collection("settings", {})
            if not isinstance(settings, dict):
                settings = {}
            card = str(
                body.get("paymentCardNumber")
                or settings.get("paymentCardNumber")
                or ""
            ).strip()
            if not card:
                return {"status": 400, "body": {"error": "payment_card_missing"}}
            req["status"] = "awaiting_payment"
            req["paymentCardNumber"] = card
            req["paymentCardHolder"] = str(
                body.get("paymentCardHolder") or settings.get("paymentCardHolder") or ""
            ).strip()
            req["paymentInstructions"] = str(
                body.get("paymentInstructions") or settings.get("paymentInstructions") or ""
            ).strip()
            req["paymentSentAt"] = _iso()
            req["contactedAt"] = req["paymentSentAt"]
            req["adminNote"] = str(body.get("adminNote") or req.get("adminNote") or "")
            req["updatedAt"] = _iso()
            _audit(admin, "send_payment_info", "recharge_request", req["id"], ip)
        elif action == "reject":
            req["status"] = "rejected"
            req["adminNote"] = str(body.get("adminNote") or "")
            req["updatedAt"] = _iso()
            _audit(admin, "reject_recharge_request", "recharge_request", req["id"], ip)
        elif action == "fulfill":
            # Manually activate/extend subscription for the cafe
            days = int(body.get("days") or {"monthly": 30, "6months": 182, "yearly": 365}.get(req.get("billingCycle"), 30))
            plan_id = str(body.get("planId") or req.get("planId") or "")
            tenant_id = str(req.get("tenantId") or "")
            subs = load_collection("subscriptions", [])
            if not isinstance(subs, list):
                subs = []
            existing = None
            ei = -1
            for i, s in enumerate(subs):
                if s.get("tenantId") == tenant_id and s.get("status") in (
                    "trial", "active", "past_due", "grace_period", "expired"
                ):
                    existing = s
                    ei = i
                    break
            start = _now()
            if existing:
                try:
                    end_ts = int(
                        time.mktime(
                            time.strptime(str(existing.get("endDate") or "")[:19], "%Y-%m-%dT%H:%M:%S")
                        )
                    )
                except Exception:
                    end_ts = start
                base = max(end_ts, start)
                existing["planId"] = plan_id or existing.get("planId")
                existing["billingCycle"] = req.get("billingCycle") or existing.get("billingCycle")
                existing["price"] = int(req.get("price") or existing.get("price") or 0)
                existing["status"] = "active"
                existing["endDate"] = _iso(base + days * 86400)
                existing["paymentStatus"] = "manual"
                existing["updatedAt"] = _iso()
                subs[ei] = existing
                sub = existing
            else:
                sub = {
                    "id": _new_id("sub"),
                    "tenantId": tenant_id,
                    "planId": plan_id,
                    "billingCycle": req.get("billingCycle") or "monthly",
                    "status": "active",
                    "price": int(req.get("price") or 0),
                    "currency": "IRT",
                    "startDate": _iso(start),
                    "endDate": _iso(start + days * 86400),
                    "trialEndDate": None,
                    "autoRenew": False,
                    "paymentStatus": "manual",
                    "cancelledAt": None,
                    "createdAt": _iso(),
                    "updatedAt": _iso(),
                }
                subs.append(sub)
            save_collection("subscriptions", subs)
            cafes = load_collection("cafes", [])
            fulfilled_cafe = None
            if isinstance(cafes, list):
                for i, c in enumerate(cafes):
                    if c.get("id") == tenant_id:
                        c["status"] = "active"
                        c["planId"] = plan_id
                        c["subscriptionId"] = sub["id"]
                        c["updatedAt"] = _iso()
                        if not c.get("slug"):
                            assign_slug(c, cafes)
                        provision_tenant(c)
                        cafes[i] = c
                        fulfilled_cafe = c
                        break
                save_collection("cafes", cafes)
            req["status"] = "fulfilled"
            req["fulfilledAt"] = _iso()
            req["adminNote"] = str(body.get("adminNote") or req.get("adminNote") or "")
            req["subscriptionId"] = sub["id"]
            req["updatedAt"] = _iso()
            if fulfilled_cafe:
                access_ticket = _send_access_ticket(fulfilled_cafe)
                if access_ticket and access_ticket.get("id"):
                    req["accessTicketId"] = access_ticket["id"]
            _audit(
                admin,
                "fulfill_recharge_request",
                "recharge_request",
                req["id"],
                ip,
                {"days": days, "planId": plan_id, "tenantId": tenant_id},
            )
        else:
            return {"status": 400, "body": {"error": "invalid_action"}}
        reqs[idx] = req
        save_collection("recharge_requests", reqs)
        return {"status": 200, "body": {"request": req}}

    # ── Dashboard ─────────────────────────────────────────
    if route == "sa-dashboard" and method == "GET":
        admin, err = require_admin(headers, body, "analytics.read")
        if err:
            # Owner has *; also allow any authenticated admin to see dashboard basics
            admin, err2 = require_admin(headers, body)
            if err2:
                return err2
            if not has_permission(admin, "analytics.read") and not has_permission(admin, "*"):
                # still allow cafes.read owners of dashboard overview
                if not has_permission(admin, "cafes.read"):
                    return err
        return {"status": 200, "body": _dashboard_kpis()}

    # ── Cafes ─────────────────────────────────────────────
    if route == "sa-cafes" and method == "GET":
        admin, err = require_admin(headers, body, "cafes.read")
        if err:
            return err
        cafes = _load_cafes_with_slugs()
        return {"status": 200, "body": _filter_page(
            cafes, qs, ["name", "ownerName", "email", "phone", "id", "subscriptionId", "slug"]
        )}

    if route == "sa-cafes" and method == "POST":
        admin, err = require_admin(headers, body, "cafes.write")
        if err:
            return err
        cafes = load_collection("cafes", [])
        if not isinstance(cafes, list):
            cafes = []
        cafe = {
            "id": _new_id("cafe"),
            "name": str(body.get("name") or "").strip() or "Untitled Cafe",
            "ownerName": str(body.get("ownerName") or "").strip(),
            "email": str(body.get("email") or "").strip().lower(),
            "phone": str(body.get("phone") or "").strip(),
            "status": str(body.get("status") or "pending"),
            "planId": body.get("planId"),
            "subscriptionId": None,
            "settings": body.get("settings") or {},
            "usage": {
                "menuItems": 0,
                "categories": 0,
                "orders": 0,
                "invoices": 0,
                "customers": 0,
                "users": 1,
                "storageMb": 0,
                "mau": 0,
            },
            "lastActivityAt": None,
            "createdAt": _iso(),
            "updatedAt": _iso(),
        }
        assign_slug(cafe, cafes, str(body.get("slug") or "").strip())
        provision_tenant(cafe)
        cashier_password = generate_cashier_password()
        _cafe_set_cashier_password(cafe, cashier_password)
        cafes.append(cafe)
        save_collection("cafes", cafes)
        _audit(admin, "create_cafe", "cafe", cafe["id"], ip, {"name": cafe["name"]})
        return {
            "status": 200,
            "body": {
                "cafe": _cafe_for_admin(cafe),
                "cashierPassword": cashier_password,
                "temporaryPassword": cashier_password,
            },
        }

    if route == "sa-cafe" and item_id:
        admin, err = require_admin(headers, body)
        if err:
            return err
        cafes = _load_cafes_with_slugs()
        idx = next((i for i, c in enumerate(cafes) if c.get("id") == item_id), -1)
        if idx < 0:
            return {"status": 404, "body": {"error": "not_found"}}

        if method == "GET":
            if not has_permission(admin, "cafes.read"):
                return {"status": 403, "body": {"error": "forbidden"}}
            cafe = cafes[idx]
            subs = load_collection("subscriptions", [])
            sub = None
            if isinstance(subs, list):
                for s in subs:
                    if s.get("id") == cafe.get("subscriptionId") or s.get("tenantId") == cafe["id"]:
                        if s.get("status") not in ("cancelled",):
                            sub = s
                            break
            owner_row = _find_owner_by_tenant(str(cafe.get("id") or ""))
            owner_out = None
            if owner_row:
                owner_out = _public_cafe_owner(owner_row)
                owner_out["passwordPlain"] = str(owner_row.get("passwordPlain") or "")
            return {
                "status": 200,
                "body": {
                    "cafe": _cafe_for_admin(cafe),
                    "subscription": sub,
                    "owner": owner_out,
                    "cashierAuth": cashier_auth_meta(str(cafe.get("id") or "")),
                },
            }

        if method == "POST":
            if not has_permission(admin, "cafes.write"):
                return {"status": 403, "body": {"error": "forbidden"}}
            action = str(body.get("action") or "update")
            cafe = cafes[idx]
            if action in ("reset_cashier_password", "set_cashier_password"):
                provided = str(body.get("password") or "").strip()
                new_password = provided or generate_cashier_password()
                if len(new_password) < 4:
                    return {"status": 400, "body": {"error": "weak_password"}}
                provision_tenant(cafe)
                _cafe_set_cashier_password(cafe, new_password)
                cafe["updatedAt"] = _iso()
                cafes[idx] = cafe
                save_collection("cafes", cafes)
                _audit(admin, "reset_cashier_password", "cafe", cafe["id"], ip)
                return {
                    "status": 200,
                    "body": {
                        "cafe": _cafe_for_admin(cafe),
                        "cashierPassword": new_password,
                        "temporaryPassword": new_password,
                        "cashierAuth": cashier_auth_meta(str(cafe.get("id") or "")),
                    },
                }
            if action == "update":
                for key in ("name", "ownerName", "email", "phone", "status", "planId"):
                    if key in body:
                        cafe[key] = body[key]
                cafe["updatedAt"] = _iso()
                cafes[idx] = cafe
                save_collection("cafes", cafes)
                _audit(admin, "edit_cafe", "cafe", cafe["id"], ip)
                return {"status": 200, "body": {"cafe": cafe}}
            if action == "suspend":
                cafe["status"] = "suspended"
                cafe["updatedAt"] = _iso()
                cafes[idx] = cafe
                save_collection("cafes", cafes)
                _audit(admin, "suspend_cafe", "cafe", cafe["id"], ip, {"reason": body.get("reason")})
                return {"status": 200, "body": {"cafe": cafe}}
            if action == "reactivate":
                cafe["status"] = "active"
                cafe["updatedAt"] = _iso()
                cafes[idx] = cafe
                save_collection("cafes", cafes)
                _audit(admin, "activate_cafe", "cafe", cafe["id"], ip)
                return {"status": 200, "body": {"cafe": cafe}}
            if action == "delete":
                cafes.pop(idx)
                save_collection("cafes", cafes)
                _audit(admin, "delete_cafe", "cafe", item_id, ip)
                return {"status": 200, "body": {"ok": True}}
            if action == "impersonate":
                if not has_permission(admin, "cafes.write"):
                    return {"status": 403, "body": {"error": "forbidden"}}
                imp_token = secrets.token_hex(24)
                imps = load_collection("impersonations", [])
                if not isinstance(imps, list):
                    imps = []
                rec = {
                    "id": _new_id("imp"),
                    "token": imp_token,
                    "adminId": admin["id"],
                    "adminEmail": admin.get("email"),
                    "tenantId": cafe["id"],
                    "startedAt": _iso(),
                    "endedAt": None,
                    "ip": ip,
                    "actions": [],
                }
                imps.append(rec)
                save_collection("impersonations", imps)
                _audit(admin, "impersonation_start", "cafe", cafe["id"], ip)
                return {
                    "status": 200,
                    "body": {
                        "impersonationToken": imp_token,
                        "cafe": cafe,
                        "banner": "You are viewing this account as Super Admin.",
                    },
                }
            return {"status": 400, "body": {"error": "invalid_action"}}

    # ── Plans ─────────────────────────────────────────────
    if route == "sa-plans" and method == "GET":
        admin, err = require_admin(headers, body, "plans.read")
        if err:
            return err
        plans = load_collection("plans", [])
        if not isinstance(plans, list):
            plans = []
        plans = sorted(plans, key=lambda p: int(p.get("displayOrder") or 0))
        return {"status": 200, "body": {"items": plans, "total": len(plans)}}

    if route == "sa-plans" and method == "POST":
        admin, err = require_admin(headers, body, "plans.write")
        if err:
            return err
        plans = load_collection("plans", [])
        if not isinstance(plans, list):
            plans = []
        plan = {
            "id": _new_id("plan"),
            "name": str(body.get("name") or "New Plan").strip(),
            "description": str(body.get("description") or ""),
            "status": str(body.get("status") or "active"),
            "displayOrder": int(body.get("displayOrder") or len(plans) + 1),
            "entitlements": body.get("entitlements") or {},
            "prices": body.get("prices")
            or {"monthly": 0, "6months": 0, "yearly": 0},
            "createdAt": _iso(),
            "updatedAt": _iso(),
        }
        plans.append(plan)
        save_collection("plans", plans)
        _audit(admin, "create_plan", "plan", plan["id"], ip)
        return {"status": 200, "body": {"plan": plan}}

    if route == "sa-plan" and item_id:
        admin, err = require_admin(headers, body)
        if err:
            return err
        plans = load_collection("plans", [])
        if not isinstance(plans, list):
            plans = []
        idx = next((i for i, p in enumerate(plans) if p.get("id") == item_id), -1)
        if idx < 0:
            return {"status": 404, "body": {"error": "not_found"}}
        if method == "GET":
            if not has_permission(admin, "plans.read"):
                return {"status": 403, "body": {"error": "forbidden"}}
            return {"status": 200, "body": {"plan": plans[idx]}}
        if method == "POST":
            if not has_permission(admin, "plans.write"):
                return {"status": 403, "body": {"error": "forbidden"}}
            plan = plans[idx]
            for key in ("name", "description", "status", "displayOrder", "entitlements", "prices"):
                if key in body:
                    plan[key] = body[key]
            plan["updatedAt"] = _iso()
            plans[idx] = plan
            save_collection("plans", plans)
            _audit(admin, "edit_plan", "plan", plan["id"], ip)
            return {"status": 200, "body": {"plan": plan}}

    # ── Subscriptions ─────────────────────────────────────
    if route == "sa-subscriptions" and method == "GET":
        admin, err = require_admin(headers, body, "subscriptions.read")
        if err:
            return err
        subs = load_collection("subscriptions", [])
        if not isinstance(subs, list):
            subs = []
        return {"status": 200, "body": _filter_page(
            subs, qs, ["id", "tenantId", "planId", "status"]
        )}

    if route == "sa-subscriptions" and method == "POST":
        admin, err = require_admin(headers, body, "subscriptions.write")
        if err:
            return err
        subs = load_collection("subscriptions", [])
        if not isinstance(subs, list):
            subs = []
        settings = load_collection("settings", {})
        trial_days = int((settings or {}).get("trialDays") or 14)
        status = str(body.get("status") or "trial")
        start = _now()
        trial_end = start + trial_days * 86400 if status == "trial" else None
        cycle = str(body.get("billingCycle") or "monthly")
        days = {"monthly": 30, "6months": 182, "yearly": 365}.get(cycle, 30)
        end = start + days * 86400
        sub = {
            "id": _new_id("sub"),
            "tenantId": str(body.get("tenantId") or ""),
            "planId": str(body.get("planId") or ""),
            "billingCycle": cycle,
            "status": status,
            "price": int(body.get("price") or 0),
            "currency": str(body.get("currency") or "IRT"),
            "startDate": _iso(start),
            "endDate": _iso(end),
            "trialEndDate": _iso(trial_end) if trial_end else None,
            "autoRenew": bool(body.get("autoRenew", True)),
            "paymentStatus": str(body.get("paymentStatus") or "pending"),
            "cancelledAt": None,
            "createdAt": _iso(),
            "updatedAt": _iso(),
        }
        subs.append(sub)
        save_collection("subscriptions", subs)
        # link cafe
        cafes = load_collection("cafes", [])
        if isinstance(cafes, list) and sub["tenantId"]:
            for i, c in enumerate(cafes):
                if c.get("id") == sub["tenantId"]:
                    c["subscriptionId"] = sub["id"]
                    c["planId"] = sub["planId"]
                    c["status"] = "trial" if status == "trial" else "active"
                    c["updatedAt"] = _iso()
                    cafes[i] = c
                    break
            save_collection("cafes", cafes)
        _audit(admin, "create_subscription", "subscription", sub["id"], ip)
        return {"status": 200, "body": {"subscription": sub}}

    if route == "sa-subscription" and item_id and method == "POST":
        admin, err = require_admin(headers, body, "subscriptions.write")
        if err:
            return err
        subs = load_collection("subscriptions", [])
        if not isinstance(subs, list):
            subs = []
        idx = next((i for i, s in enumerate(subs) if s.get("id") == item_id), -1)
        if idx < 0:
            return {"status": 404, "body": {"error": "not_found"}}
        sub = subs[idx]
        action = str(body.get("action") or "update")
        if action == "extend":
            days = int(body.get("days") or 30)
            try:
                end_ts = int(
                    time.mktime(time.strptime(str(sub.get("endDate") or "")[:19], "%Y-%m-%dT%H:%M:%S"))
                )
            except Exception:
                end_ts = _now()
            base = max(end_ts, _now())
            sub["endDate"] = _iso(base + days * 86400)
            if sub.get("status") in ("expired", "past_due", "grace_period"):
                sub["status"] = "active"
            sub["updatedAt"] = _iso()
            reason = str(body.get("reason") or "")
            _audit(
                admin,
                "extend_subscription",
                "subscription",
                sub["id"],
                ip,
                {"days": days, "reason": reason},
            )
        elif action == "cancel":
            sub["status"] = "cancelled"
            sub["cancelledAt"] = _iso()
            sub["autoRenew"] = False
            sub["updatedAt"] = _iso()
            _audit(admin, "cancel_subscription", "subscription", sub["id"], ip)
        elif action == "reactivate":
            sub["status"] = "active"
            sub["cancelledAt"] = None
            sub["updatedAt"] = _iso()
            _audit(admin, "reactivate_subscription", "subscription", sub["id"], ip)
        elif action == "change_plan":
            sub["planId"] = str(body.get("planId") or sub.get("planId"))
            if "price" in body:
                sub["price"] = int(body.get("price") or 0)
            if "billingCycle" in body:
                sub["billingCycle"] = body["billingCycle"]
            sub["updatedAt"] = _iso()
            _audit(admin, "change_plan", "subscription", sub["id"], ip, {"planId": sub["planId"]})
        else:
            for key in ("status", "autoRenew", "paymentStatus", "price", "billingCycle", "planId"):
                if key in body:
                    sub[key] = body[key]
            sub["updatedAt"] = _iso()
            _audit(admin, "edit_subscription", "subscription", sub["id"], ip)
        subs[idx] = sub
        save_collection("subscriptions", subs)
        return {"status": 200, "body": {"subscription": sub}}

    if route == "sa-subscription" and item_id and method == "GET":
        admin, err = require_admin(headers, body, "subscriptions.read")
        if err:
            return err
        subs = load_collection("subscriptions", [])
        for s in subs if isinstance(subs, list) else []:
            if s.get("id") == item_id:
                return {"status": 200, "body": {"subscription": s}}
        return {"status": 404, "body": {"error": "not_found"}}

    # ── Payments ──────────────────────────────────────────
    if route == "sa-payments" and method == "GET":
        admin, err = require_admin(headers, body, "payments.read")
        if err:
            return err
        payments = load_collection("saas_payments", [])
        if not isinstance(payments, list):
            payments = []
        return {"status": 200, "body": _filter_page(
            payments, qs, ["id", "tenantId", "referenceNumber", "provider", "status"]
        )}

    if route == "sa-payments" and method == "POST":
        admin, err = require_admin(headers, body, "payments.read")
        if err:
            return err
        # Manual payment record (admin)
        if not has_permission(admin, "subscriptions.write") and not has_permission(admin, "payments.refund"):
            if not has_permission(admin, "*"):
                return {"status": 403, "body": {"error": "forbidden"}}
        payments = load_collection("saas_payments", [])
        if not isinstance(payments, list):
            payments = []
        payment = {
            "id": _new_id("pay"),
            "tenantId": str(body.get("tenantId") or ""),
            "subscriptionId": body.get("subscriptionId"),
            "amount": int(body.get("amount") or 0),
            "currency": str(body.get("currency") or "IRT"),
            "status": str(body.get("status") or "successful"),
            "provider": str(body.get("provider") or "manual"),
            "providerTransactionId": body.get("providerTransactionId"),
            "referenceNumber": str(body.get("referenceNumber") or _new_id("ref")),
            "paymentMethod": str(body.get("paymentMethod") or "manual"),
            "planId": body.get("planId"),
            "billingCycle": body.get("billingCycle"),
            "createdAt": _iso(),
            "updatedAt": _iso(),
        }
        payments.append(payment)
        save_collection("saas_payments", payments)
        _audit(admin, "create_payment", "payment", payment["id"], ip)
        return {"status": 200, "body": {"payment": payment}}

    if route == "sa-payment" and item_id and method == "POST":
        admin, err = require_admin(headers, body, "payments.refund")
        if err:
            return err
        payments = load_collection("saas_payments", [])
        if not isinstance(payments, list):
            payments = []
        idx = next((i for i, p in enumerate(payments) if p.get("id") == item_id), -1)
        if idx < 0:
            return {"status": 404, "body": {"error": "not_found"}}
        payment = payments[idx]
        action = str(body.get("action") or "")
        if action == "refund":
            payment["status"] = "refunded"
            payment["updatedAt"] = _iso()
            payments[idx] = payment
            save_collection("saas_payments", payments)
            _audit(admin, "refund", "payment", payment["id"], ip, {"reason": body.get("reason")})
            return {"status": 200, "body": {"payment": payment}}
        return {"status": 400, "body": {"error": "invalid_action"}}

    if route == "sa-payment" and item_id and method == "GET":
        admin, err = require_admin(headers, body, "payments.read")
        if err:
            return err
        payments = load_collection("saas_payments", [])
        for p in payments if isinstance(payments, list) else []:
            if p.get("id") == item_id:
                return {"status": 200, "body": {"payment": p}}
        return {"status": 404, "body": {"error": "not_found"}}

    # ── Coupons ───────────────────────────────────────────
    if route == "sa-coupons" and method == "GET":
        admin, err = require_admin(headers, body, "plans.read")
        if err:
            return err
        coupons = load_collection("coupons", [])
        return {"status": 200, "body": {"items": coupons if isinstance(coupons, list) else []}}

    if route == "sa-coupons" and method == "POST":
        admin, err = require_admin(headers, body, "plans.write")
        if err:
            return err
        coupons = load_collection("coupons", [])
        if not isinstance(coupons, list):
            coupons = []
        action = str(body.get("action") or "create")
        if action == "delete":
            cid = str(body.get("id") or "")
            coupons = [c for c in coupons if c.get("id") != cid]
            save_collection("coupons", coupons)
            _audit(admin, "delete_coupon", "coupon", cid, ip)
            return {"status": 200, "body": {"ok": True}}
        coupon = {
            "id": body.get("id") or _new_id("cpn"),
            "code": str(body.get("code") or "").strip().upper(),
            "discountType": str(body.get("discountType") or "percentage"),
            "discountValue": int(body.get("discountValue") or 0),
            "startDate": body.get("startDate"),
            "endDate": body.get("endDate"),
            "usageLimit": body.get("usageLimit"),
            "perUserLimit": body.get("perUserLimit"),
            "usedCount": int(body.get("usedCount") or 0),
            "applicablePlans": body.get("applicablePlans") or [],
            "minimumPayment": int(body.get("minimumPayment") or 0),
            "status": str(body.get("status") or "active"),
            "createdAt": _iso(),
            "updatedAt": _iso(),
        }
        existing = next((i for i, c in enumerate(coupons) if c.get("id") == coupon["id"]), -1)
        if existing >= 0:
            coupon["createdAt"] = coupons[existing].get("createdAt") or coupon["createdAt"]
            coupons[existing] = coupon
        else:
            coupons.append(coupon)
        save_collection("coupons", coupons)
        _audit(admin, "save_coupon", "coupon", coupon["id"], ip)
        return {"status": 200, "body": {"coupon": coupon}}

    # ── Analytics ─────────────────────────────────────────
    if route == "sa-analytics" and method == "GET":
        admin, err = require_admin(headers, body, "analytics.read")
        if err:
            return err
        kind = ((qs.get("kind") or ["revenue"])[0] or "revenue").lower()
        dash = _dashboard_kpis()
        payments = load_collection("saas_payments", [])
        if not isinstance(payments, list):
            payments = []
        # Monthly buckets (last 12)
        months: dict[str, int] = {}
        for p in payments:
            if p.get("status") != "successful":
                continue
            key = str(p.get("createdAt") or "")[:7]
            if not key:
                continue
            months[key] = months.get(key, 0) + int(p.get("amount") or 0)
        series = [{"month": k, "revenue": v} for k, v in sorted(months.items())][-12:]
        by_plan: dict[str, int] = {}
        for p in payments:
            if p.get("status") != "successful":
                continue
            pid = str(p.get("planId") or "unknown")
            by_plan[pid] = by_plan.get(pid, 0) + int(p.get("amount") or 0)
        return {
            "status": 200,
            "body": {
                "kind": kind,
                "kpis": dash["kpis"],
                "revenueByMonth": series,
                "revenueByPlan": [{"planId": k, "revenue": v} for k, v in by_plan.items()],
                "popularPlans": dash["popularPlans"],
            },
        }

    # ── Notifications ─────────────────────────────────────
    if route == "sa-notifications" and method == "GET":
        admin, err = require_admin(headers, body)
        if err:
            return err
        items = load_collection("notifications", [])
        return {"status": 200, "body": {"items": items if isinstance(items, list) else []}}

    if route == "sa-notifications" and method == "POST":
        admin, err = require_admin(headers, body, "notifications.write")
        if err:
            return err
        items = load_collection("notifications", [])
        if not isinstance(items, list):
            items = []
        note = {
            "id": _new_id("ntf"),
            "title": str(body.get("title") or "").strip(),
            "body": str(body.get("body") or ""),
            "type": str(body.get("type") or "system"),
            "channels": body.get("channels") or ["in_app"],
            "target": body.get("target") or {"scope": "all"},
            "status": "sent",
            "sentAt": _iso(),
            "createdBy": admin.get("id"),
            "createdAt": _iso(),
        }
        items.insert(0, note)
        save_collection("notifications", items)
        _audit(admin, "send_notification", "notification", note["id"], ip)
        return {"status": 200, "body": {"notification": note}}

    # ── Support ───────────────────────────────────────────
    if route == "sa-support" and method == "GET":
        admin, err = require_admin(headers, body, "support.read")
        if err:
            return err
        tickets = load_collection("support_tickets", [])
        if not isinstance(tickets, list):
            tickets = []
        tickets = _enrich_support_tickets(tickets)
        return {"status": 200, "body": _filter_page(
            tickets, qs, ["id", "subject", "tenantId", "status", "priority", "cafeName", "cafeOwnerEmail"]
        )}

    if route == "sa-support" and method == "POST":
        admin, err = require_admin(headers, body, "support.write")
        if err:
            return err
        tickets = load_collection("support_tickets", [])
        if not isinstance(tickets, list):
            tickets = []
        ticket = {
            "id": _new_id("tkt"),
            "tenantId": body.get("tenantId"),
            "cafeName": "",
            "cafeOwnerEmail": "",
            "subject": str(body.get("subject") or "Support request"),
            "priority": str(body.get("priority") or "normal"),
            "status": "waiting_customer" if body.get("body") else "open",
            "assignedAdminId": body.get("assignedAdminId"),
            "messages": [
                {
                    "id": _new_id("msg"),
                    "from": "admin",
                    "adminId": admin.get("id"),
                    "body": str(body.get("body") or ""),
                    "createdAt": _iso(),
                }
            ]
            if body.get("body")
            else [],
            "createdAt": _iso(),
            "updatedAt": _iso(),
            "lastReplyAt": _iso() if body.get("body") else None,
        }
        if body.get("tenantId"):
            cafe_for_ticket = _find_cafe(str(body.get("tenantId")))
            if cafe_for_ticket:
                ticket["cafeName"] = cafe_for_ticket.get("name") or ""
        tickets.insert(0, ticket)
        save_collection("support_tickets", tickets)
        return {"status": 200, "body": {"ticket": ticket}}

    if route == "sa-support-item" and item_id:
        admin, err = require_admin(headers, body, "support.read")
        if err:
            return err
        tickets = load_collection("support_tickets", [])
        if not isinstance(tickets, list):
            tickets = []
        idx = next((i for i, t in enumerate(tickets) if t.get("id") == item_id), -1)
        if idx < 0:
            return {"status": 404, "body": {"error": "not_found"}}
        if method == "GET":
            ticket = tickets[idx]
            ticket["adminReadAt"] = _iso()
            ticket["updatedAt"] = _iso()
            tickets[idx] = ticket
            save_collection("support_tickets", tickets)
            return {"status": 200, "body": {"ticket": {**ticket, **_support_ticket_meta(ticket)}}}
        if method == "POST":
            if not has_permission(admin, "support.write"):
                return {"status": 403, "body": {"error": "forbidden"}}
            ticket = tickets[idx]
            action = str(body.get("action") or "update")
            if action == "reply":
                msgs = ticket.get("messages") or []
                msgs.append(
                    {
                        "id": _new_id("msg"),
                        "from": "admin",
                        "adminId": admin.get("id"),
                        "body": str(body.get("body") or ""),
                        "createdAt": _iso(),
                    }
                )
                ticket["messages"] = msgs
                ticket["lastReplyAt"] = _iso()
                ticket["adminReadAt"] = _iso()
                ticket["status"] = str(body.get("status") or "waiting_customer")
            else:
                for key in ("status", "priority", "assignedAdminId", "subject"):
                    if key in body:
                        ticket[key] = body[key]
            ticket["updatedAt"] = _iso()
            tickets[idx] = ticket
            save_collection("support_tickets", tickets)
            return {"status": 200, "body": {"ticket": {**ticket, **_support_ticket_meta(ticket)}}}

    # ── System ────────────────────────────────────────────
    if route == "sa-system-health" and method == "GET":
        admin, err = require_admin(headers, body, "system.read")
        if err:
            return err
        db_status = "healthy"
        db_detail = "json_files"
        try:
            from storage_db import storage_health

            health = storage_health()
            db_detail = str(health.get("database") or "unknown")
            if db_detail == "error":
                db_status = "critical"
                db_detail = str(health.get("detail") or "error")
            elif db_detail == "postgresql":
                db_detail = "postgresql"
            else:
                db_detail = "json_files"
        except Exception:
            db_status = "critical"
            db_detail = "error"
        return {
            "status": 200,
            "body": {
                "services": [
                    {"name": "API", "status": "healthy", "detail": "ok"},
                    {"name": "Database", "status": db_status, "detail": db_detail},
                    {"name": "Payment Gateway", "status": "warning", "detail": "abstraction ready; no live provider"},
                    {"name": "Background Jobs", "status": "warning", "detail": "not configured"},
                    {"name": "Email Service", "status": "warning", "detail": "not configured"},
                    {"name": "SMS Service", "status": "warning", "detail": "not configured"},
                    {"name": "Storage", "status": "healthy", "detail": str(PLATFORM)},
                ],
                "overall": "warning" if db_status != "critical" else "critical",
            },
        }

    if route == "sa-system-settings" and method == "GET":
        admin, err = require_admin(headers, body, "system.read")
        if err:
            return err
        return {"status": 200, "body": {"settings": load_collection("settings", {})}}

    if route == "sa-system-settings" and method == "POST":
        admin, err = require_admin(headers, body, "system.read")
        if err:
            return err
        if not has_permission(admin, "*") and not has_permission(admin, "plans.write"):
            return {"status": 403, "body": {"error": "forbidden"}}
        settings = load_collection("settings", {})
        if not isinstance(settings, dict):
            settings = {}
        settings.update(body.get("settings") or body)
        save_collection("settings", settings)
        _audit(admin, "change_settings", "settings", "platform", ip)
        return {"status": 200, "body": {"settings": settings}}

    # ── Audit ─────────────────────────────────────────────
    if route == "sa-audit-logs" and method == "GET":
        admin, err = require_admin(headers, body, "audit.read")
        if err:
            return err
        logs = load_collection("audit_logs", [])
        if not isinstance(logs, list):
            logs = []
        logs = list(reversed(logs))
        return {"status": 200, "body": _filter_page(logs, qs, ["action", "adminEmail", "targetId", "targetType"])}

    # ── Admin users & roles ───────────────────────────────
    if route == "sa-admin-users" and method == "GET":
        admin, err = require_admin(headers, body, "admin_users.read")
        if err:
            return err
        admins = load_collection("admins", [])
        items = [_public_admin(a) for a in (admins if isinstance(admins, list) else [])]
        return {"status": 200, "body": {"items": items}}

    if route == "sa-admin-users" and method == "POST":
        admin, err = require_admin(headers, body, "admin_users.write")
        if err:
            # Owner wildcard
            admin, err2 = require_admin(headers, body)
            if err2:
                return err2
            if not has_permission(admin, "*"):
                return err
        admins = load_collection("admins", [])
        if not isinstance(admins, list):
            admins = []
        email = str(body.get("email") or "").strip().lower()
        if not email:
            return {"status": 400, "body": {"error": "missing_email"}}
        password = str(body.get("password") or secrets.token_urlsafe(10))
        new_admin = {
            "id": _new_id("admin"),
            "email": email,
            "username": str(body.get("username") or email.split("@")[0]),
            "passwordHash": _hash_password(password),
            "name": str(body.get("name") or ""),
            "roleId": str(body.get("roleId") or "role_support"),
            "status": str(body.get("status") or "active"),
            "createdAt": _iso(),
            "updatedAt": _iso(),
            "lastLoginAt": None,
        }
        admins.append(new_admin)
        save_collection("admins", admins)
        _audit(admin, "create_admin", "admin", new_admin["id"], ip)
        out = _public_admin(new_admin)
        out["temporaryPassword"] = password if not body.get("password") else None
        return {"status": 200, "body": {"admin": out}}

    if route == "sa-roles" and method == "GET":
        admin, err = require_admin(headers, body)
        if err:
            return err
        roles = load_collection("roles", [])
        return {
            "status": 200,
            "body": {
                "items": roles if isinstance(roles, list) else [],
                "allPermissions": PERMISSIONS,
            },
        }

    # ── Global search ─────────────────────────────────────
    if route == "sa-search" and method == "GET":
        admin, err = require_admin(headers, body)
        if err:
            return err
        q = ((qs.get("q") or [""])[0] or "").strip().lower()
        if len(q) < 2:
            return {"status": 200, "body": {"groups": []}}
        groups = []
        cafes = load_collection("cafes", [])
        cafe_hits = []
        for c in cafes if isinstance(cafes, list) else []:
            blob = " ".join(
                str(c.get(k) or "") for k in ("name", "ownerName", "email", "phone", "id")
            ).lower()
            if q in blob:
                cafe_hits.append(c)
            if len(cafe_hits) >= 8:
                break
        if cafe_hits:
            groups.append({"type": "cafes", "items": cafe_hits})
        payments = load_collection("saas_payments", [])
        pay_hits = []
        for p in payments if isinstance(payments, list) else []:
            blob = " ".join(
                str(p.get(k) or "") for k in ("id", "referenceNumber", "tenantId")
            ).lower()
            if q in blob:
                pay_hits.append(p)
            if len(pay_hits) >= 8:
                break
        if pay_hits:
            groups.append({"type": "payments", "items": pay_hits})
        subs = load_collection("subscriptions", [])
        sub_hits = [s for s in (subs if isinstance(subs, list) else []) if q in str(s.get("id") or "").lower() or q in str(s.get("tenantId") or "").lower()][:8]
        if sub_hits:
            groups.append({"type": "subscriptions", "items": sub_hits})
        tickets = load_collection("support_tickets", [])
        tkt_hits = [
            t
            for t in (tickets if isinstance(tickets, list) else [])
            if q in str(t.get("subject") or "").lower() or q in str(t.get("id") or "").lower()
        ][:8]
        if tkt_hits:
            groups.append({"type": "tickets", "items": tkt_hits})
        return {"status": 200, "body": {"groups": groups}}

    return {"status": 404, "body": {"error": "not_found"}}
