"use client";

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

export function LoginPage({
  onAdmin,
  onCafe,
  onNavigate,
  initialMode = "login",
}: {
  onAdmin: (admin: AdminUser) => void;
  onCafe: (owner: CafeOwner) => void;
  onNavigate: (href: string) => void;
  initialMode?: "login" | "register";
}) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cafeName, setCafeName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
          <input
            className="sa-input"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

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
            <button type="button" className="sa-forgot" onClick={() => onNavigate("/panel-admin/")}>
              بازگشت به فروشگاه پلن‌ها
            </button>
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
