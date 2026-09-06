"use client";

import Link from "next/link";
import { useState } from "react";
import { apiJson, setCashierRole, setCashierToken } from "@/lib/api";
import { setMenuTenantSlug } from "@/lib/tenant";

export function CashierLoginModal({
  tenantSlug = "",
  onSuccess,
  onClose,
  closeHref,
  title = "ورود صندوقدار",
  hint = "رمز عبور را وارد کنید",
  submitLabel = "ورود به پنل",
}: {
  tenantSlug?: string;
  onSuccess?: () => void;
  onClose?: () => void;
  closeHref?: string;
  title?: string;
  hint?: string;
  submitLabel?: string;
}) {
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(false);
    setLoginBusy(true);
    if (tenantSlug) setMenuTenantSlug(tenantSlug);
    try {
      const data = await apiJson<{
        token?: string;
        role?: string;
        sandbox?: string;
      }>("/api/login", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ password: password.trim(), tenant: tenantSlug || undefined }),
      });
      if (!data.token) throw new Error("login");
      setCashierToken(data.token, tenantSlug);
      setCashierRole(
        data.role === "dev" ? "dev" : "cashier",
        data.sandbox || "dev",
        tenantSlug
      );
      setPassword("");
      onSuccess?.();
    } catch {
      setLoginError(true);
    } finally {
      setLoginBusy(false);
    }
  }

  return (
    <div className="modal-overlay cp-modal-overlay is-open">
      <div className="modal-card cp-modal" role="dialog">
        {onClose ? (
          <button type="button" className="modal-close" aria-label="بستن" onClick={onClose}>
            ×
          </button>
        ) : closeHref ? (
          <Link href={closeHref} className="modal-close" aria-label="بستن">
            ×
          </Link>
        ) : null}
        <h2 className="modal-title">{title}</h2>
        <p className="modal-hint">{hint}</p>
        <form className="cashier-login-form" onSubmit={login}>
          <label className="sr-only" htmlFor="cashier-password">
            رمز عبور
          </label>
          <input
            type="password"
            id="cashier-password"
            className="modal-input"
            placeholder="رمز عبور"
            autoComplete="current-password"
            required
            value={password}
            disabled={loginBusy}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <p className="modal-error" hidden={!loginError}>
            رمز اشتباه است
          </p>
          <button
            type="submit"
            className={`modal-submit cp-btn cp-btn--primary cp-btn--block${loginBusy ? " is-loading" : ""}`}
            disabled={loginBusy}
          >
            {submitLabel}
          </button>
        </form>
      </div>
    </div>
  );
}
