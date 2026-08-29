"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Coupon } from "@/lib/types";
import { apiJson, cashierHeaders } from "@/lib/api";
import {
  couponDiscountLabel,
  couponUsageLabel,
  isCouponUsageExhausted,
  normalizeCouponCode,
  validateCoupon,
} from "@/lib/coupons";
import { toPersianDigits } from "@/lib/format";
import { formatJalaliIso, isoToMs, toIsoDate } from "@/lib/jalali";
import { useToast } from "@/components/ToastProvider";
import { LoadingShimmer } from "@/components/admin/LoadingShimmer";
import { CpSelect } from "@/components/ui/CpSelect";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";

type Draft = {
  id?: string;
  code: string;
  label: string;
  discountType: "percent" | "fixed";
  discountValue: string;
  active: boolean;
  expiresAt: string;
  usageLimitEnabled: boolean;
  usageLimit: string;
};

const EMPTY_DRAFT: Draft = {
  code: "",
  label: "",
  discountType: "percent",
  discountValue: "10",
  active: true,
  expiresAt: "",
  usageLimitEnabled: false,
  usageLimit: "5",
};

const DISCOUNT_TYPE_OPTIONS = [
  ["percent", "درصد"],
  ["fixed", "مبلغ ثابت (تومان)"],
] as const;

function msFromIsoDate(value: string): number | null {
  if (!value.trim()) return null;
  const ms = isoToMs(value);
  if (!ms) return null;
  return ms + 86400000 - 1;
}

function isoFromMs(value?: number | null): string {
  if (!value || value <= 0) return "";
  return toIsoDate(value);
}

export function CouponsTab({ active }: { active: boolean }) {
  const { showToast } = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [checkCode, setCheckCode] = useState("");
  const [checkMsg, setCheckMsg] = useState("");
  const [checkOk, setCheckOk] = useState<boolean | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  function loadCoupons() {
    setLoading(true);
    setError("");
    return apiJson<{ coupons?: Coupon[] }>("/api/coupons", {
      headers: cashierHeaders(),
    })
      .then((data) => setCoupons(data.coupons || []))
      .catch(() => setError("بارگذاری کوپن‌ها ناموفق بود"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!active) return;
    loadCoupons();
  }, [active]);

  useEffect(() => {
    if (!dialogOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDialogOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialogOpen]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return coupons;
    return coupons.filter((c) => {
      const hay = `${c.code} ${c.label || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [coupons, q]);

  function openAdd() {
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  }

  function openEdit(coupon: Coupon) {
    const limit = coupon.usageLimit && coupon.usageLimit > 0 ? coupon.usageLimit : null;
    setDraft({
      id: coupon.id,
      code: coupon.code,
      label: coupon.label || "",
      discountType: coupon.discountType,
      discountValue: String(coupon.discountValue),
      active: coupon.active !== false,
      expiresAt: isoFromMs(coupon.expiresAt),
      usageLimitEnabled: !!limit,
      usageLimit: limit ? String(limit) : "5",
    });
    setDialogOpen(true);
  }

  async function checkCoupon() {
    const code = checkCode.trim();
    if (!code) {
      setCheckMsg("کد را وارد کنید");
      setCheckOk(false);
      return;
    }
    const local = validateCoupon(coupons, code);
    if (local.valid) {
      setCheckOk(true);
      setCheckMsg(
        `معتبر — ${local.coupon.label || local.coupon.code} (${couponDiscountLabel(local.coupon)})`
      );
      return;
    }
    try {
      const data = await apiJson<{
        valid?: boolean;
        message?: string;
        coupon?: Coupon;
      }>("/api/coupons", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({ action: "validate", code }),
      });
      if (data.valid && data.coupon) {
        setCheckOk(true);
        setCheckMsg(
          `معتبر — ${data.coupon.label || data.coupon.code} (${couponDiscountLabel(data.coupon)})`
        );
      } else {
        setCheckOk(false);
        setCheckMsg(data.message || "کد نامعتبر است");
      }
    } catch {
      setCheckOk(false);
      setCheckMsg(local.error);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const code = normalizeCouponCode(draft.code);
    if (!code) {
      showToast("کد کوپن الزامی است");
      return;
    }
    const discountValue = Math.max(0, Number(draft.discountValue) || 0);
    if (discountValue <= 0) {
      showToast("مقدار تخفیف را وارد کنید");
      return;
    }
    if (draft.discountType === "percent" && discountValue > 100) {
      showToast("درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد");
      return;
    }
    const usageLimit = draft.usageLimitEnabled
      ? Math.max(1, Math.round(Number(draft.usageLimit) || 0))
      : null;
    if (draft.usageLimitEnabled && (!usageLimit || usageLimit <= 0)) {
      showToast("حداکثر تعداد استفاده را وارد کنید");
      return;
    }
    setBusy(true);
    try {
      const action = draft.id ? "update" : "add";
      const data = await apiJson<{ coupons?: Coupon[] }>("/api/coupons", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({
          action,
          id: draft.id,
          code,
          label: draft.label.trim(),
          discountType: draft.discountType,
          discountValue,
          active: draft.active,
          expiresAt: msFromIsoDate(draft.expiresAt),
          usageLimit,
        }),
      });
      setCoupons(data.coupons || []);
      setDialogOpen(false);
      showToast(draft.id ? "کوپن به‌روزرسانی شد" : "کوپن اضافه شد");
    } catch {
      showToast("ذخیره کوپن ناموفق بود — شاید کد تکراری باشد");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft.id) return;
    if (!window.confirm(`کوپن «${draft.code}» حذف شود؟`)) return;
    setBusy(true);
    try {
      const data = await apiJson<{ coupons?: Coupon[] }>("/api/coupons", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({ action: "remove", id: draft.id }),
      });
      setCoupons(data.coupons || []);
      setDialogOpen(false);
      showToast("کوپن حذف شد");
    } catch {
      showToast("حذف کوپن ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-tab admin-tab--coupons coupons-page">
      <header className="coupons-header">
        <div>
          <h3 className="coupons-title">کوپن‌های تخفیف</h3>
          <p className="coupons-subtitle">
            ساخت و بررسی کدهای تخفیف برای فاکتور
          </p>
        </div>
        <div className="coupons-header-actions">
          <button
            type="button"
            className="cp-btn cp-btn--primary"
            onClick={openAdd}
          >
            + کوپن جدید
          </button>
        </div>
      </header>

      <section className="coupons-check-card">
        <div className="coupons-check-head">
          <h4>بررسی کد</h4>
          <p>قبل از فاکتور، اعتبار کد را اینجا تست کنید</p>
        </div>
        <div className="coupons-check-row">
          <input
            type="text"
            className="coupons-search"
            dir="ltr"
            placeholder="مثلاً lumi10"
            value={checkCode}
            onChange={(e) => {
              setCheckCode(e.target.value);
              setCheckMsg("");
              setCheckOk(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                checkCoupon();
              }
            }}
          />
          <button
            type="button"
            className="cp-btn cp-btn--ghost"
            onClick={checkCoupon}
          >
            بررسی
          </button>
        </div>
        {checkMsg ? (
          <p
            className={`coupons-check-msg${checkOk ? " is-ok" : " is-error"}`}
          >
            {checkMsg}
          </p>
        ) : null}
      </section>

      <div className="coupons-toolbar">
        <input
          type="search"
          className="coupons-search"
          placeholder="جستجو کد یا عنوان…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="coupons-count">
          {toPersianDigits(filtered.length)} / {toPersianDigits(coupons.length)}
        </p>
      </div>

      {error ? <p className="coupons-error">{error}</p> : null}

      {loading ? (
        <LoadingShimmer variant="list" count={4} />
      ) : filtered.length ? (
        <ul className="coupons-list">
          {filtered.map((coupon) => {
            const expired =
              !!coupon.expiresAt &&
              coupon.expiresAt > 0 &&
              Date.now() > coupon.expiresAt;
            const exhausted = isCouponUsageExhausted(coupon);
            const usageLabel = couponUsageLabel(coupon);
            return (
              <li key={coupon.id}>
                <button
                  type="button"
                  className={`coupons-row${!coupon.active ? " is-inactive" : ""}${expired || exhausted ? " is-expired" : ""}`}
                  onClick={() => openEdit(coupon)}
                >
                  <div className="coupons-row-main">
                    <strong dir="ltr">{coupon.code}</strong>
                    <small>{coupon.label || "بدون عنوان"}</small>
                    <em>{couponDiscountLabel(coupon)} تخفیف</em>
                    {usageLabel ? (
                      <small className="coupons-usage cp-num">
                        استفاده: {toPersianDigits(usageLabel)}
                      </small>
                    ) : null}
                  </div>
                  <div className="coupons-row-meta">
                    {!coupon.active ? (
                      <span className="coupons-pill is-muted">غیرفعال</span>
                    ) : expired ? (
                      <span className="coupons-pill is-muted">منقضی</span>
                    ) : exhausted ? (
                      <span className="coupons-pill is-muted">تمام شد</span>
                    ) : (
                      <span className="coupons-pill">فعال</span>
                    )}
                    {coupon.expiresAt ? (
                      <small>{formatJalaliIso(isoFromMs(coupon.expiresAt), true)}</small>
                    ) : null}
                    <span className="coupons-row-action">ویرایش</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="coupons-empty">
          <p className="coupons-empty-title">
            {q.trim() ? "کوپنی پیدا نشد" : "هنوز کوپنی ثبت نشده"}
          </p>
          <p className="coupons-empty-hint">
            کدهای تخفیف را اینجا بسازید؛ در زمان ثبت فاکتور با دکمه «اعمال» استفاده می‌شوند.
          </p>
          {!q.trim() ? (
            <button type="button" className="cp-btn cp-btn--primary" onClick={openAdd}>
              افزودن کوپن
            </button>
          ) : null}
        </div>
      )}

      {mounted && dialogOpen
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="presentation"
              onClick={() => !busy && setDialogOpen(false)}
            >
              <div
                className="table-glass-dialog coupons-glass-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="coupon-dialog-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 id="coupon-dialog-title" className="table-glass-title">
                      {draft.id ? "ویرایش کوپن" : "کوپن جدید"}
                    </h4>
                    <p className="table-glass-sub">
                      کد انگلیسی/عددی بدون فاصله — مثلاً lumi10
                    </p>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    disabled={busy}
                    onClick={() => setDialogOpen(false)}
                  >
                    ×
                  </button>
                </header>

                <form className="coupons-form" onSubmit={save}>
                  <label className="coupons-field">
                    <span>کد کوپن</span>
                    <input
                      type="text"
                      dir="ltr"
                      required
                      autoFocus
                      placeholder="lumi10"
                      value={draft.code}
                      disabled={busy}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, code: e.target.value }))
                      }
                    />
                  </label>
                  <label className="coupons-field">
                    <span>عنوان (اختیاری)</span>
                    <input
                      type="text"
                      placeholder="۱۰٪ تخفیف ویژه"
                      value={draft.label}
                      disabled={busy}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, label: e.target.value }))
                      }
                    />
                  </label>
                  <div className="coupons-field-row">
                    <div className="coupons-field">
                      <CpSelect
                        label="نوع تخفیف"
                        value={draft.discountType}
                        options={DISCOUNT_TYPE_OPTIONS}
                        disabled={busy}
                        onChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            discountType: v as "percent" | "fixed",
                          }))
                        }
                      />
                    </div>
                    <label className="coupons-field">
                      <span>مقدار</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        className="cp-num"
                        value={draft.discountValue}
                        disabled={busy}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            discountValue: e.target.value.replace(/[^\d.]/g, ""),
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="coupons-field">
                    <JalaliDatePicker
                      label="تاریخ انقضا (اختیاری)"
                      value={draft.expiresAt}
                      placeholder="بدون انقضا"
                      disabled={busy}
                      onChange={(iso) =>
                        setDraft((d) => ({ ...d, expiresAt: iso }))
                      }
                    />
                  </div>
                  <label className="coupons-toggle">
                    <span>محدودیت تعداد استفاده</span>
                    <input
                      type="checkbox"
                      checked={draft.usageLimitEnabled}
                      disabled={busy}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          usageLimitEnabled: e.target.checked,
                        }))
                      }
                    />
                  </label>
                  {draft.usageLimitEnabled ? (
                    <label className="coupons-field">
                      <span>حداکثر دفعات استفاده</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        className="cp-num"
                        value={draft.usageLimit}
                        disabled={busy}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            usageLimit: e.target.value.replace(/[^\d]/g, ""),
                          }))
                        }
                      />
                      {draft.id ? (
                        <small className="coupons-field-hint">
                          استفاده‌شده:{" "}
                          {toPersianDigits(
                            coupons.find((c) => c.id === draft.id)?.usedCount || 0
                          )}
                        </small>
                      ) : null}
                    </label>
                  ) : null}
                  <label className="coupons-toggle">
                    <span>کد فعال باشد</span>
                    <input
                      type="checkbox"
                      checked={draft.active}
                      disabled={busy}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, active: e.target.checked }))
                      }
                    />
                  </label>

                  <footer className="menu-glass-actions">
                    {draft.id ? (
                      <button
                        type="button"
                        className="cp-btn cp-btn--ghost coupons-delete-btn"
                        disabled={busy}
                        onClick={remove}
                      >
                        حذف
                      </button>
                    ) : (
                      <span />
                    )}
                    <div className="coupons-header-actions">
                      <button
                        type="button"
                        className="cp-btn cp-btn--ghost"
                        disabled={busy}
                        onClick={() => setDialogOpen(false)}
                      >
                        انصراف
                      </button>
                      <button
                        type="submit"
                        className={`cp-btn cp-btn--primary${busy ? " is-loading" : ""}`}
                        disabled={busy}
                      >
                        {busy ? "در حال ذخیره…" : "ذخیره"}
                      </button>
                    </div>
                  </footer>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
