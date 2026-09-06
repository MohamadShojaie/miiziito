"use client";

import { useEffect, useState } from "react";
import { saFetch } from "@/lib/super-admin/api";
import { toast } from "./ui/Toast";

export function CafeCashierPasswordField({
  cafeId,
  password: initialPassword,
  hasPassword,
  onUpdated,
}: {
  cafeId: string;
  password?: string;
  hasPassword?: boolean;
  onUpdated?: (hasPassword: boolean, password?: string) => void;
}) {
  const [password, setPassword] = useState(initialPassword || "");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPassword(initialPassword || "");
  }, [initialPassword]);

  async function generatePassword() {
    const label = hasPassword ? "رمز جدید ساخته شود؟ رمز قبلی دیگر کار نمی‌کند." : "رمز پنل صندوقدار ساخته شود؟";
    if (!confirm(label)) return;
    setBusy(true);
    try {
      const res = await saFetch<{
        temporaryPassword?: string;
        cashierPassword?: string;
        cashierAuth?: { hasPassword: boolean };
        cafe?: { settings?: { cashierPassword?: string } };
      }>("sa-cafe", {
        id: cafeId,
        method: "POST",
        body: JSON.stringify({ action: "set_cashier_password" }),
      });
      const nextPassword =
        res.temporaryPassword ||
        res.cashierPassword ||
        res.cafe?.settings?.cashierPassword ||
        "";
      if (nextPassword) {
        setPassword(nextPassword);
        setRevealed(true);
        toast("رمز ساخته شد", "success");
      } else {
        toast("رمز به‌روزرسانی شد", "success");
      }
      onUpdated?.(!!res.cashierAuth?.hasPassword, nextPassword || undefined);
    } catch {
      toast("ساخت رمز ممکن نشد", "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast("رمز کپی شد", "success");
    } catch {
      toast("کپی ناموفق بود", "error");
    }
  }

  if (!password && !hasPassword) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ color: "var(--sa-text-muted)", fontWeight: 500 }}>تنظیم نشده</strong>
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={busy} onClick={generatePassword}>
          {busy ? "…" : "ساخت رمز"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <strong dir="ltr" style={{ fontSize: "0.85rem", fontFamily: "monospace", letterSpacing: "0.04em" }}>
        {password ? (revealed ? password : "••••••••") : "••••••••"}
      </strong>
      {password ? (
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setRevealed((v) => !v)}>
          {revealed ? "پنهان" : "نمایش"}
        </button>
      ) : null}
      {password && revealed ? (
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={copyPassword}>
          کپی
        </button>
      ) : null}
      <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={busy} onClick={generatePassword}>
        {busy ? "…" : hasPassword ? "بازنشانی" : "ساخت رمز"}
      </button>
    </div>
  );
}
