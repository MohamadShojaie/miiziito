"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- hash link back to landing pricing */

import { BrandMark } from "@/components/panel-admin/BrandMark";

import { useEffect, useState } from "react";
import { saFetch, setSaAdminRaw, setSaToken } from "@/lib/super-admin/api";
import type { AdminUser } from "@/lib/super-admin/types";

type CafeOwner = {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  tenantId?: string;
};

const CYCLE_LABEL: Record<string, string> = {
  monthly: "ماهانه",
  "6months": "۶ ماهه",
  yearly: "سالانه",
};

export function LoginPage({
  onAdmin,
  onCafe,
  initialMode = "login",
}: {
  onAdmin: (admin: AdminUser) => void;
  onCafe: (owner: CafeOwner) => void;
  onNavigate?: (href: string) => void;
  initialMode?: "login" | "register";
}) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [cafeName, setCafeName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkout, setCheckout] = useState<{ plan: string; cycle: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const plan = params.get("plan");
    const cycle = params.get("cycle");
    if (plan) setCheckout({ plan, cycle: cycle || "monthly" });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "register") {
      if (password.trim().length < 6) {
        setError("رمز عبور حداقل ۶ کاراکتر باشد.");
        return;
      }
      if (password !== confirmPassword) {
        setError("رمز عبور و تکرار آن یکسان نیست.");
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === "register") {
        const data = await saFetch<{
          token: string;
          kind: string;
          owner: CafeOwner;
        }>("sa-register", {
          method: "POST",
          skipAuth: true,
          body: JSON.stringify({ email, password, cafeName, ownerName, phone }),
        });
        setSaToken(data.token);
        setSaAdminRaw(JSON.stringify({ kind: "cafe", owner: data.owner }));
        onCafe(data.owner);
        return;
      }
      const data = await saFetch<{
        token: string;
        kind: "admin" | "cafe";
        admin?: AdminUser;
        owner?: CafeOwner;
      }>("sa-login", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ email, password, remember }),
      });
      setSaToken(data.token);
      if (data.kind === "admin" && data.admin) {
        setSaAdminRaw(JSON.stringify({ kind: "admin", admin: data.admin }));
        onAdmin(data.admin);
      } else if (data.kind === "cafe" && data.owner) {
        setSaAdminRaw(JSON.stringify({ kind: "cafe", owner: data.owner }));
        onCafe(data.owner);
      } else {
        setError("ورود ناموفق بود.");
      }
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      const msg = (err as Error).message;
      if (status === 429) setError("تلاش‌های زیاد. کمی صبر کنید.");
      else if (status === 409) setError("این ایمیل قبلاً ثبت شده است.");
      else if (msg === "bad_credentials") setError("ایمیل یا رمز عبور اشتباه است.");
      else if (msg === "missing_fields") setError("لطفاً همه فیلدهای ضروری را پر کنید.");
      else if (msg === "weak_password") setError("رمز عبور حداقل ۶ کاراکتر باشد.");
      else setError("خطا در ارتباط. دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sa-login">
      <form className="sa-login-card" onSubmit={submit} dir="rtl">
        <h1>
          <BrandMark />
        </h1>
        <p className="sa-login-sub">
          {mode === "login" ? "ورود به حساب اشتراک" : "ثبت‌نام کافه / رستوران"}
        </p>
        {checkout ? (
          <div className="sa-login-checkout" role="status">
            برای تکمیل خرید پلن، {mode === "login" ? "وارد شوید" : "ثبت‌نام کنید"}.
            {checkout.cycle ? (
              <span className="sa-login-checkout-meta">
                {" "}
                (دوره: {CYCLE_LABEL[checkout.cycle] || checkout.cycle})
              </span>
            ) : null}
          </div>
        ) : null}
        {error ? <div className="sa-login-error">{error}</div> : null}

        {mode === "register" ? (
          <>
            <div className="sa-field">
              <label className="sa-label">نام کافه / رستوران</label>
              <input className="sa-input" value={cafeName} onChange={(e) => setCafeName(e.target.value)} required />
            </div>
            <div className="sa-field">
              <label className="sa-label">نام صاحب</label>
              <input className="sa-input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </div>
            <div className="sa-field">
              <label className="sa-label">شماره تماس</label>
              <input className="sa-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </>
        ) : null}

        <div className="sa-field">
          <label className="sa-label">ایمیل</label>
          <input
            className="sa-input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="sa-field">
          <label className="sa-label">رمز عبور</label>
          <div className="sa-password-field">
            <input
              className="sa-input"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="sa-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "مخفی کردن رمز" : "نمایش رمز"}
              title={showPassword ? "مخفی کردن رمز" : "نمایش رمز"}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9.3 3.1 11 7.5a11.7 11.7 0 01-4.2 5.1M6.1 6.1A11.7 11.7 0 001 12.5C2.7 16.9 7 20 12 20c1.7 0 3.3-.4 4.7-1"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
        </div>

        {mode === "register" ? (
          <div className="sa-field">
            <label className="sa-label">تکرار رمز عبور</label>
            <div className="sa-password-field">
              <input
                className="sa-input"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="sa-password-toggle"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? "مخفی کردن رمز" : "نمایش رمز"}
                title={showConfirmPassword ? "مخفی کردن رمز" : "نمایش رمز"}
              >
                {showConfirmPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9.3 3.1 11 7.5a11.7 11.7 0 01-4.2 5.1M6.1 6.1A11.7 11.7 0 001 12.5C2.7 16.9 7 20 12 20c1.7 0 3.3-.4 4.7-1"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
          </div>
        ) : null}

        {mode === "login" ? (
          <div className="sa-login-actions">
            <label className="sa-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              مرا به خاطر بسپار
            </label>
          </div>
        ) : null}

        <button type="submit" className="sa-btn sa-btn-primary" style={{ width: "100%" }} disabled={loading}>
          {loading ? "لطفاً صبر کنید…" : mode === "login" ? "ورود" : "ثبت‌نام"}
        </button>

        <div style={{ marginTop: 16, textAlign: "center", fontSize: "0.9rem", color: "var(--sa-text-muted)" }}>
          {mode === "login" ? (
            <>
              حساب ندارید؟{" "}
              <button type="button" className="sa-forgot" onClick={() => setMode("register")}>
                ثبت‌نام
              </button>
            </>
          ) : (
            <>
              قبلاً ثبت‌نام کرده‌اید؟{" "}
              <button type="button" className="sa-forgot" onClick={() => setMode("login")}>
                ورود
              </button>
            </>
          )}
          <div style={{ marginTop: 10 }}>
            <a href="/#plans" className="sa-forgot">
              بازگشت به فروشگاه پلن‌ها
            </a>
          </div>
        </div>
      </form>
    </div>
  );
}

export function useQueryParams() {
  const [params, setParams] = useState<URLSearchParams>(new URLSearchParams());
  useEffect(() => {
    setParams(new URLSearchParams(window.location.search));
  }, []);
  return params;
}
