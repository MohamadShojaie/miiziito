"""Platform transactional email — SMTP or local mail_log fallback."""

from __future__ import annotations

import os
import re
import smtplib
import ssl
import time
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate, make_msgid
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PLATFORM = DATA / "platform"
SECRET = DATA / "secret.php"
MAIL_LOG_DIR = PLATFORM / "mail_log"
MAIL_STATUS_FILE = PLATFORM / "mail_status.json"

SMTP_KEYS = (
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM_EMAIL",
    "SMTP_FROM_NAME",
    "SMTP_SECURE",
)


def _read_secret_file() -> dict[str, str]:
    out: dict[str, str] = {}
    if not SECRET.exists():
        return out
    text = SECRET.read_text(encoding="utf-8", errors="ignore")
    for key in SMTP_KEYS:
        m = re.search(rf"\${key}\s*=\s*\"([^\"]*)\"", text)
        if m:
            out[key] = m.group(1)
    return out


def mail_config() -> dict[str, Any]:
    secrets_map = _read_secret_file()

    def pick(key: str, default: str = "") -> str:
        env = os.environ.get(key)
        if env is not None and str(env).strip() != "":
            return str(env).strip()
        return str(secrets_map.get(key) or default).strip()

    host = pick("SMTP_HOST")
    port_raw = pick("SMTP_PORT", "587")
    try:
        port = int(port_raw or "587")
    except ValueError:
        port = 587
    user = pick("SMTP_USER")
    password = pick("SMTP_PASS")
    from_email = pick("SMTP_FROM_EMAIL") or user
    from_name = pick("SMTP_FROM_NAME") or "میزیتو"
    secure = pick("SMTP_SECURE", "tls").lower()
    if secure not in ("tls", "ssl", ""):
        secure = "tls"

    configured = bool(host and from_email)
    return {
        "configured": configured,
        "host": host,
        "port": port,
        "user": user,
        "hasPassword": bool(password),
        "fromEmail": from_email,
        "fromName": from_name,
        "secure": secure,
        "password": password if configured else "",
        "mode": "smtp" if configured else "log",
    }


def wrap_platform_email_html(title: str, body_html: str) -> str:
    safe_title = str(title or "میزیتو")
    safe_body = str(body_html or "")
    return f"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{safe_title}</title>
</head>
<body style="margin:0;padding:0;background:#16120e;color:#f5efe6;font-family:Tahoma,Segoe UI,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#16120e;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#1f1a14;border:1px solid rgba(201,162,39,0.22);border-radius:18px;overflow:hidden;">
          <tr>
            <td style="padding:22px 24px 12px;border-bottom:1px solid rgba(201,162,39,0.14);">
              <div style="font-size:1.35rem;font-weight:800;color:#c9a227;">میزیتو</div>
              <div style="margin-top:6px;font-size:1rem;font-weight:700;color:#f5efe6;">{safe_title}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 24px;font-size:0.95rem;line-height:1.9;color:#d8cfc2;">
              {safe_body}
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px 20px;font-size:0.78rem;color:#7a6f5c;border-top:1px solid rgba(201,162,39,0.12);">
              این پیام از پلتفرم میزیتو ارسال شده است.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def _load_mail_status() -> dict[str, Any]:
    if not MAIL_STATUS_FILE.exists():
        return {}
    try:
        import json

        data = json.loads(MAIL_STATUS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_mail_status(payload: dict[str, Any]) -> None:
    import json

    PLATFORM.mkdir(parents=True, exist_ok=True)
    MAIL_STATUS_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def mail_public_status() -> dict[str, Any]:
    cfg = mail_config()
    last = _load_mail_status()
    return {
        "configured": bool(cfg["configured"]),
        "mode": cfg["mode"],
        "fromEmail": cfg["fromEmail"] if cfg["configured"] else "",
        "fromName": cfg["fromName"],
        "host": cfg["host"] if cfg["configured"] else "",
        "port": cfg["port"] if cfg["configured"] else None,
        "secure": cfg["secure"] if cfg["configured"] else "",
        "hasPassword": bool(cfg["hasPassword"]),
        "lastError": str(last.get("lastError") or "") or None,
        "lastSentAt": last.get("lastSentAt"),
        "lastMode": last.get("lastMode"),
    }


def mail_health() -> dict[str, str]:
    cfg = mail_config()
    last = _load_mail_status()
    last_error = str(last.get("lastError") or "").strip()
    if not cfg["configured"]:
        return {"status": "warning", "detail": "not configured (log mode)"}
    if last_error and last.get("lastOk") is False:
        return {"status": "critical", "detail": "send failed"}
    return {"status": "healthy", "detail": "smtp configured"}


def _log_mail(to: str, subject: str, text: str, html: str | None) -> str:
    MAIL_LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    path = MAIL_LOG_DIR / f"{stamp}-{uuid.uuid4().hex[:8]}.eml.txt"
    parts = [
        f"To: {to}",
        f"Subject: {subject}",
        f"Date: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}",
        "",
        text or "",
        "",
    ]
    if html:
        parts.extend(["--- HTML ---", html, ""])
    path.write_text("\n".join(parts), encoding="utf-8")
    return str(path)


def _send_smtp(
    cfg: dict[str, Any],
    to: str,
    subject: str,
    text: str,
    html: str | None,
) -> None:
    from_email = str(cfg["fromEmail"])
    from_name = str(cfg["fromName"] or "میزیتو")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, from_email))
    msg["To"] = to
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=from_email.split("@")[-1] if "@" in from_email else "miiziito.local")
    msg.attach(MIMEText(text or "", "plain", "utf-8"))
    if html:
        msg.attach(MIMEText(html, "html", "utf-8"))

    host = str(cfg["host"])
    port = int(cfg["port"] or 587)
    user = str(cfg.get("user") or "")
    password = str(cfg.get("password") or "")
    secure = str(cfg.get("secure") or "tls")

    if secure == "ssl":
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=context, timeout=30) as server:
            if user:
                server.login(user, password)
            server.sendmail(from_email, [to], msg.as_string())
        return

    with smtplib.SMTP(host, port, timeout=30) as server:
        server.ehlo()
        if secure == "tls":
            context = ssl.create_default_context()
            server.starttls(context=context)
            server.ehlo()
        if user:
            server.login(user, password)
        server.sendmail(from_email, [to], msg.as_string())


def send_platform_mail(
    to: str,
    subject: str,
    text: str,
    html: str | None = None,
) -> dict[str, Any]:
    to = str(to or "").strip()
    subject = str(subject or "").strip()
    text = str(text or "")
    if not to or "@" not in to:
        return {"ok": False, "mode": "none", "error": "invalid_recipient"}
    if not subject:
        return {"ok": False, "mode": "none", "error": "missing_subject"}

    cfg = mail_config()
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    if not cfg["configured"]:
        path = _log_mail(to, subject, text, html)
        _save_mail_status(
            {
                "lastOk": True,
                "lastMode": "log",
                "lastSentAt": now,
                "lastError": "",
                "lastPath": path,
            }
        )
        return {"ok": True, "mode": "log", "path": path}

    try:
        _send_smtp(cfg, to, subject, text, html)
        _save_mail_status(
            {
                "lastOk": True,
                "lastMode": "smtp",
                "lastSentAt": now,
                "lastError": "",
            }
        )
        return {"ok": True, "mode": "smtp"}
    except Exception as exc:
        # Still log failed attempt for debugging
        path = _log_mail(to, subject, text, html)
        err = str(exc)[:300]
        _save_mail_status(
            {
                "lastOk": False,
                "lastMode": "smtp",
                "lastSentAt": now,
                "lastError": err,
                "lastPath": path,
            }
        )
        return {"ok": False, "mode": "smtp", "error": err, "path": path}
