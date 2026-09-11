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
  title = "ورود به پنل مدیریت",
  hint = "",
  submitLabel = "ورود",
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
  const [showPassword, setShowPassword] = useState(false);
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
        employeeId?: string;
        section?: string;
        sectionAccess?: string;
        employeeName?: string;
      }>("/api/login", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ password: password.trim(), tenant: tenantSlug || undefined }),
      });
      if (!data.token) throw new Error("login");
      setCashierToken(data.token, tenantSlug);
      const role =
        data.role === "dev"
          ? "dev"
          : data.role === "employee"
            ? "employee"
            : data.role === "manager"
              ? "manager"
              : "manager";
      setCashierRole(role, data.sandbox || "dev", tenantSlug, {
        employeeId: data.employeeId,
        section: data.section,
        sectionAccess: data.sectionAccess,
        employeeName: data.employeeName,
      });
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
      <div className="modal-card cp-modal cashier-login-modal" role="dialog" aria-labelledby="cashier-login-title">
        {onClose ? (
          <button type="button" className="modal-close" aria-label="بستن" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : closeHref ? (
          <Link href={closeHref} className="modal-close" aria-label="بستن">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </Link>
        ) : null}
        <h2 id="cashier-login-title" className="modal-title">
          {title}
        </h2>
        {hint.trim() ? <p className="modal-hint">{hint.trim()}</p> : (
          <p className="modal-hint">مدیر با رمز اصلی؛ کارمندان با رمزی که مدیر برایشان تعریف کرده وارد می‌شوند.</p>
        )}
        <form className="cashier-login-form" onSubmit={login}>
          <label className="modal-field-label" htmlFor="cashier-password">
            رمز عبور
          </label>
          <div className="cashier-login-password">
            <input
              type={showPassword ? "text" : "password"}
              id="cashier-password"
              className="modal-input"
              placeholder="رمز مدیر یا کارمند"
              autoComplete="current-password"
              required
              value={password}
              disabled={loginBusy}
              onChange={(e) => {
                setPassword(e.target.value);
                if (loginError) setLoginError(false);
              }}
              autoFocus
            />
            <button
              type="button"
              className="cashier-login-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "مخفی کردن رمز" : "نمایش رمز"}
              title={showPassword ? "مخفی کردن رمز" : "نمایش رمز"}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9.3 3.1 11 7.5a11.7 11.7 0 01-4.2 5.1M6.1 6.1A11.7 11.7 0 001 12.5C2.7 16.9 7 20 12 20c1.7 0 3.3-.4 4.7-1"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M1 12.5C2.7 8.1 7 5 12 5s9.3 3.1 11 7.5c-1.7 4.4-6 7.5-11 7.5S2.7 16.9 1 12.5z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="12.5" r="3" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              )}
            </button>
          </div>
          {loginError ? <p className="modal-error">رمز عبور اشتباه است</p> : null}
          <button
            type="submit"
            className={`modal-submit cp-btn cp-btn--primary cp-btn--block${loginBusy ? " is-loading" : ""}`}
            disabled={loginBusy || !password.trim()}
          >
            {loginBusy ? "در حال ورود…" : submitLabel}
          </button>
        </form>
      </div>
    </div>
  );
}
