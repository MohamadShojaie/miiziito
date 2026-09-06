"use client";

import { useState } from "react";
import type { AccessCredentialsPayload } from "@/lib/super-admin/access-message";
import { PANEL_GUIDE_PATH } from "@/lib/super-admin/access-message";
import { toast } from "./ui/Toast";

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast(`${label} کپی شد`, "success");
  } catch {
    toast("کپی ممکن نشد", "error");
  }
}

function AccessRow({
  label,
  value,
  href,
  masked,
}: {
  label: string;
  value: string;
  href?: string;
  masked?: boolean;
}) {
  if (!value) return null;
  const shown = masked ? "••••••••" : value;
  return (
    <div className="sa-access-row">
      <div className="sa-access-row-main">
        <span className="sa-access-label">{label}</span>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="sa-access-value" dir="ltr">
            {value}
          </a>
        ) : (
          <strong className="sa-access-value" dir="ltr">
            {shown}
          </strong>
        )}
      </div>
      <div className="sa-access-row-actions">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="sa-btn sa-btn-ghost sa-btn-sm">
            باز کردن
          </a>
        ) : null}
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => copyText(value, label)}>
          کپی
        </button>
      </div>
    </div>
  );
}

export function AccessCredentialsCard({
  payload,
  compact = false,
}: {
  payload: AccessCredentialsPayload;
  compact?: boolean;
}) {
  const [showSecrets, setShowSecrets] = useState(true);
  const guideUrl = payload.guideUrl || PANEL_GUIDE_PATH;

  return (
    <div className={`sa-access-card${compact ? " sa-access-card--compact" : ""}`}>
      <div className="sa-access-card-head">
        <div>
          <h3>اطلاعات دسترسی کافه</h3>
          <p>اول وارد پنل شوید، از «تنظیمات» شروع کنید، بعد منو بسازید.</p>
        </div>
        <a className="sa-btn sa-btn-primary sa-btn-sm" href={guideUrl} download target="_blank" rel="noreferrer">
          دانلود راهنما
        </a>
      </div>

      <div className="sa-access-stack">
        <AccessRow label="آدرس منو" value={payload.menuUrl || ""} href={payload.menuUrl} />
        <AccessRow label="پنل مدیریت (صندوق)" value={payload.adminUrl || ""} href={payload.adminUrl} />
        <AccessRow label="رمز پنل مدیریت" value={payload.cashierPassword || ""} masked={!showSecrets} />
        <AccessRow label="ورود حساب اشتراک" value={payload.accountUrl || ""} href={payload.accountUrl} />
        <AccessRow label="ایمیل حساب" value={payload.accountEmail || ""} />
        {payload.accountPassword ? (
          <AccessRow label="رمز حساب اشتراک" value={payload.accountPassword} masked={!showSecrets} />
        ) : payload.accountPasswordNote ? (
          <p className="sa-access-note">{payload.accountPasswordNote}</p>
        ) : null}
      </div>

      <div className="sa-access-card-foot">
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setShowSecrets((v) => !v)}>
          {showSecrets ? "مخفی کردن رمزها" : "نمایش رمزها"}
        </button>
        <a className="sa-link" href={guideUrl} target="_blank" rel="noreferrer">
          مشاهده راهنمای کار با پنل
        </a>
      </div>
    </div>
  );
}
