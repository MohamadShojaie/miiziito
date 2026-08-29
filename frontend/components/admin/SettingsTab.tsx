"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiJson, cashierHeaders } from "@/lib/api";
import { toPersianDigits } from "@/lib/format";
import { assetUrl } from "@/lib/menu-utils";
import type { Invoice, Order } from "@/lib/types";
import {
  applySiteTheme,
  DEFAULT_SITE_SETTINGS,
  MENU_STRUCTURE_OPTIONS,
  mergeSiteSettings,
  resolveMenuStructure,
  type MenuStructureId,
  type SiteSettings,
} from "@/lib/settings";
import { useToast } from "@/components/ToastProvider";
import { LoadingShimmer } from "@/components/admin/LoadingShimmer";
import { SITE_CONFIG } from "@/lib/config";

type Props = {
  active: boolean;
  orders: Order[];
  invoices: Invoice[];
};

type SettingsPayload = {
  settings?: Partial<SiteSettings>;
  summary?: SettingsSummary;
};

type SettingsSummary = {
  orderCount?: number;
  invoiceCount?: number;
  tableCount?: number;
  customerCount?: number;
  customers?: Array<{ name: string; invoices: number; phone?: string }>;
};

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="settings-toggle">
      <span className="settings-toggle-copy">
        <strong>{label}</strong>
        {hint ? <em>{hint}</em> : null}
      </span>
      <input
        type="checkbox"
        className="settings-toggle-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="settings-toggle-track" aria-hidden="true" />
    </label>
  );
}

function ImageField({
  label,
  hint,
  preview,
  onPick,
  onClear,
}: {
  label: string;
  hint: string;
  preview: string;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="settings-image-field">
      <div className="settings-image-copy">
        <strong>{label}</strong>
        <em>{hint}</em>
      </div>
      <div className={`settings-image-preview${preview ? "" : " is-empty"}`}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" />
        ) : (
          <span>بدون تصویر</span>
        )}
      </div>
      <div className="settings-image-actions">
        <button
          type="button"
          className="cp-btn cp-btn--ghost"
          onClick={() => inputRef.current?.click()}
        >
          انتخاب تصویر
        </button>
        {preview ? (
          <button type="button" className="cp-btn cp-btn--ghost" onClick={onClear}>
            حذف
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function PreviewCard({
  settings,
  logoSrc,
  bgSrc,
}: {
  settings: SiteSettings;
  logoSrc: string;
  bgSrc: string;
}) {
  const layout = resolveMenuStructure(settings.menuStructure);
  const showBg = settings.showBackgroundOnMenu && !!bgSrc;
  const showLogo = settings.showLogoOnMenu && !!logoSrc;
  const showContact =
    settings.showContactOnMenu && !!(settings.phone || settings.address);
  return (
    <div
      className={`settings-preview-card settings-preview-card--${layout}`}
      style={
        {
          "--preview-primary": settings.primary,
          "--preview-secondary": settings.secondary,
          ...(showBg
            ? {
                backgroundImage: `linear-gradient(160deg, rgba(0,0,0,.55), rgba(0,0,0,.72)), url(${bgSrc})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {}),
        } as React.CSSProperties
      }
    >
      <div className="settings-preview-header">
        {showLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="settings-preview-logo" src={logoSrc} alt="" />
        ) : null}
        <h4>
          {settings.restaurantNameFa}{" "}
          <span>{settings.restaurantNameEn}</span>
        </h4>
        <p>{settings.tagline || "—"}</p>
        {showContact ? (
          <div className="settings-preview-contact">
            {settings.phone ? <span dir="ltr">{settings.phone}</span> : null}
            {settings.address ? <em>{settings.address}</em> : null}
          </div>
        ) : null}
      </div>
      <div className={`settings-preview-shell settings-preview-shell--${layout}`}>
        <div className="settings-preview-tabs">
          <span className="is-active">قهوه</span>
          <span>نوشیدنی</span>
          <span>غذا</span>
        </div>
        <div className={`settings-preview-items settings-preview-items--${layout}`}>
          <div className="settings-preview-item">
            <span>لاته</span>
            <strong>۲۴۰٬۰۰۰</strong>
          </div>
          <div className="settings-preview-item">
            <span>کاپوچینو</span>
            <strong>۲۲۰٬۰۰۰</strong>
          </div>
          <div className="settings-preview-item">
            <span>اسپرسو</span>
            <strong>۱۸۰٬۰۰۰</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function StructureThumb({ id }: { id: MenuStructureId }) {
  return (
    <div className={`settings-structure-thumb settings-structure-thumb--${id}`} aria-hidden="true">
      <span className="settings-structure-thumb-rail" />
      <span className="settings-structure-thumb-body">
        <i />
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

export function SettingsTab({ active, orders, invoices }: Props) {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [summary, setSummary] = useState<SettingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [logoDraft, setLogoDraft] = useState<string | null>(null);
  const [bgDraft, setBgDraft] = useState<string | null>(null);
  const [logoCleared, setLogoCleared] = useState(false);
  const [bgCleared, setBgCleared] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    apiJson<SettingsPayload>("/api/settings", { headers: cashierHeaders() })
      .then((data) => {
        if (cancelled) return;
        const next = mergeSiteSettings(data.settings);
        setSettings(next);
        setSummary(data.summary || null);
        setLogoDraft(null);
        setBgDraft(null);
        setLogoCleared(false);
        setBgCleared(false);
        applySiteTheme(next);
        setDirty(false);
      })
      .catch(() => {
        if (!cancelled) setError("بارگذاری تنظیمات ناموفق بود");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !dirty) return;
    applySiteTheme(settings);
  }, [active, dirty, settings]);

  const localSummary = useMemo(() => {
    const customersMap = new Map<
      string,
      { name: string; invoices: number; phone: string }
    >();
    invoices.forEach((inv) => {
      const name = String(inv.customerName || "").trim();
      if (!name) return;
      const entry = customersMap.get(name) || {
        name,
        invoices: 0,
        phone: "",
      };
      entry.invoices += 1;
      const phone = String(inv.customerPhone || "").trim();
      if (phone) entry.phone = phone;
      customersMap.set(name, entry);
    });
    const customers = [...customersMap.values()]
      .sort((a, b) => b.invoices - a.invoices)
      .slice(0, 8);
    return {
      orderCount: orders.length,
      invoiceCount: invoices.length,
      customerCount: customersMap.size,
      customers,
    };
  }, [orders, invoices]);

  const logoPreview =
    logoDraft ||
    (!logoCleared && settings.logo ? assetUrl(settings.logo) : "");
  const bgPreview =
    bgDraft ||
    (!bgCleared && settings.backgroundImage
      ? assetUrl(settings.backgroundImage)
      : "");

  function patch(partial: Partial<SiteSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      return mergeSiteSettings(next);
    });
    setDirty(true);
  }

  function patchOptional(partial: Partial<Pick<SiteSettings, "address" | "phone">>) {
    setSettings((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  }

  function readImage(file: File, onReady: (dataUrl: string) => void) {
    if (!file.type.startsWith("image/")) {
      showToast("فرمت تصویر نامعتبر است");
      return;
    }
    if (file.size > 2_500_000) {
      showToast("حجم تصویر بیش از ۲.۵ مگابایت است");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onReady(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload: SiteSettings = {
        ...settings,
        logo: logoDraft || (logoCleared ? "" : settings.logo),
        backgroundImage: bgDraft || (bgCleared ? "" : settings.backgroundImage),
        showLogoOnReceipt: !!settings.showLogoOnReceipt,
        showContactOnReceipt: !!settings.showContactOnReceipt,
        receiptFooterMessage:
          String(settings.receiptFooterMessage || "").trim() ||
          DEFAULT_SITE_SETTINGS.receiptFooterMessage,
      };
      const data = await apiJson<SettingsPayload>("/api/settings", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({ settings: payload }),
      });
      const next = mergeSiteSettings(data.settings);
      // Guard against stale API responses that drop receipt fields.
      if (
        typeof data.settings?.showLogoOnReceipt !== "boolean" ||
        typeof data.settings?.receiptFooterMessage !== "string"
      ) {
        setError(
          "سرور تنظیمات فاکتور را برنگرداند — صفحه را رفرش کنید و دوباره ذخیره کنید"
        );
        setSaving(false);
        return;
      }
      setSettings(next);
      setSummary(data.summary || null);
      setLogoDraft(null);
      setBgDraft(null);
      setLogoCleared(false);
      setBgCleared(false);
      applySiteTheme(next);
      setDirty(false);
      showToast("تنظیمات ذخیره شد");
    } catch {
      setError("ذخیره تنظیمات ناموفق بود");
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    setSettings(DEFAULT_SITE_SETTINGS);
    setLogoDraft(null);
    setBgDraft(null);
    setLogoCleared(true);
    setBgCleared(true);
    setDirty(true);
  }

  const customers =
    summary?.customers?.length ? summary.customers : localSummary.customers;
  const customerCount =
    summary?.customerCount ?? localSummary.customerCount ?? 0;

  if (loading) {
    return (
      <div className="admin-tab admin-tab--settings settings-page">
        <header className="settings-header">
          <h3 className="settings-title">تنظیمات</h3>
        </header>
        <div className="settings-grid">
          <LoadingShimmer variant="settings" />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-tab admin-tab--settings settings-page">
      <header className="settings-header">
        <div>
          <h3 className="settings-title">تنظیمات</h3>
          <p className="settings-subtitle">
            اطلاعات کافه و ظاهر منوی مشتری را از اینجا مدیریت کنید.
          </p>
        </div>
        <div className="settings-header-actions">
          <button
            type="button"
            className="cp-btn cp-btn--ghost"
            onClick={resetDefaults}
          >
            بازنشانی پیش‌فرض
          </button>
          <button
            type="submit"
            form="settings-form"
            className={`cp-btn cp-btn--primary${saving ? " is-loading" : ""}`}
            disabled={saving || !dirty}
          >
            {saving ? "در حال ذخیره…" : "ذخیره تغییرات"}
          </button>
        </div>
      </header>

      {error ? <p className="settings-error">{error}</p> : null}

      <div className="settings-grid">
        <section className="settings-card settings-card--summary">
          <div className="settings-card-head">
            <h4>خلاصه داده‌ها</h4>
            <p>نمای کلی از سفارش‌ها و مشتریان ثبت‌شده</p>
          </div>
          <div className="settings-kpi-row">
            <div className="settings-kpi">
              <span>سفارش‌ها</span>
              <strong>{toPersianDigits(localSummary.orderCount || 0)}</strong>
            </div>
            <div className="settings-kpi">
              <span>فاکتورها</span>
              <strong>{toPersianDigits(localSummary.invoiceCount || 0)}</strong>
            </div>
            <div className="settings-kpi">
              <span>میزها</span>
              <strong>
                {toPersianDigits(summary?.tableCount ?? 0)}
              </strong>
            </div>
            <div className="settings-kpi">
              <span>مشتریان</span>
              <strong>{toPersianDigits(customerCount)}</strong>
            </div>
          </div>
          {customers?.length ? (
            <ul className="settings-customer-list">
              {customers.map((c) => (
                <li key={c.name}>
                  <div className="settings-customer-main">
                    <span>{c.name}</span>
                    {c.phone ? (
                      <small dir="ltr">{c.phone}</small>
                    ) : null}
                  </div>
                  <em>{toPersianDigits(c.invoices)} فاکتور</em>
                </li>
              ))}
            </ul>
          ) : (
            <p className="settings-empty">
              هنوز نام مشتری در فاکتورها ثبت نشده است.
            </p>
          )}
        </section>

        <section className="settings-card settings-card--preview">
          <div className="settings-card-head">
            <h4>پیش‌نمایش منو</h4>
            <p>نمای تقریبی از رنگ‌ها و متن سربرگ</p>
          </div>
          <PreviewCard
            settings={settings}
            logoSrc={logoPreview}
            bgSrc={bgPreview}
          />
        </section>

        <form id="settings-form" className="settings-form" onSubmit={save}>
          <section className="settings-card">
            <div className="settings-card-head">
              <h4>اطلاعات رستوران</h4>
              <p>نام و متن‌هایی که مشتری در منو می‌بیند</p>
            </div>
            <div className="settings-fields">
              <label className="settings-field">
                <span>نام فارسی</span>
                <input
                  type="text"
                  value={settings.restaurantNameFa}
                  onChange={(e) =>
                    patch({ restaurantNameFa: e.target.value })
                  }
                />
              </label>
              <label className="settings-field">
                <span>نام انگلیسی</span>
                <input
                  type="text"
                  dir="ltr"
                  value={settings.restaurantNameEn}
                  onChange={(e) =>
                    patch({ restaurantNameEn: e.target.value })
                  }
                />
              </label>
              <label className="settings-field settings-field--wide">
                <span>شعار / توضیح کوتاه</span>
                <input
                  type="text"
                  value={settings.tagline}
                  onChange={(e) => patch({ tagline: e.target.value })}
                />
              </label>
              <label className="settings-field">
                <span>شماره تماس (اختیاری)</span>
                <input
                  type="tel"
                  dir="ltr"
                  placeholder="۰۹…"
                  value={settings.phone}
                  onChange={(e) => patchOptional({ phone: e.target.value })}
                />
              </label>
              <label className="settings-field">
                <span>آدرس (اختیاری)</span>
                <input
                  type="text"
                  placeholder="خیابان، پلاک…"
                  value={settings.address}
                  onChange={(e) => patchOptional({ address: e.target.value })}
                />
              </label>
              <div className="settings-field settings-field--wide">
                <Toggle
                  checked={settings.showContactOnMenu}
                  onChange={(v) => patch({ showContactOnMenu: v })}
                  label="نمایش تلفن و آدرس در منوی مشتری"
                  hint="فقط وقتی اطلاعات بالا پر شده باشد"
                />
              </div>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <h4>لوگو و پس‌زمینه</h4>
              <p>
                تصویر را آپلود کنید، سوییچ را روشن کنید، سپس ذخیره کنید تا در
                منوی مشتری نمایش داده شود
              </p>
            </div>
            <div className="settings-image-grid">
              <ImageField
                label="لوگوی کافه"
                hint="PNG یا JPG — ترجیحاً مربع"
                preview={logoPreview}
                onPick={(file) =>
                  readImage(file, (dataUrl) => {
                    setLogoDraft(dataUrl);
                    setLogoCleared(false);
                    setDirty(true);
                  })
                }
                onClear={() => {
                  setLogoDraft(null);
                  setLogoCleared(true);
                  setDirty(true);
                }}
              />
              <ImageField
                label="تصویر پس‌زمینه"
                hint="برای سربرگ منوی مشتری"
                preview={bgPreview}
                onPick={(file) =>
                  readImage(file, (dataUrl) => {
                    setBgDraft(dataUrl);
                    setBgCleared(false);
                    setDirty(true);
                  })
                }
                onClear={() => {
                  setBgDraft(null);
                  setBgCleared(true);
                  setDirty(true);
                }}
              />
            </div>
            <div className="settings-toggles settings-toggles--images">
              <Toggle
                checked={settings.showLogoOnMenu}
                onChange={(v) => patch({ showLogoOnMenu: v })}
                label="نمایش لوگو در منو"
                hint="اگر لوگو آپلود شده باشد"
              />
              <Toggle
                checked={settings.showBackgroundOnMenu}
                onChange={(v) => patch({ showBackgroundOnMenu: v })}
                label="نمایش تصویر پس‌زمینه در منو"
                hint="روی سربرگ منوی مشتری"
              />
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <h4>تنظیمات فاکتور</h4>
              <p>
                گزینه‌های چاپ حرارتی و دانلود فاکتور — لوگو از بخش بالا استفاده
                می‌شود
              </p>
            </div>
            <div className="settings-fields">
              <div className="settings-field settings-field--wide">
                <Toggle
                  checked={settings.showLogoOnReceipt}
                  onChange={(v) => patch({ showLogoOnReceipt: v })}
                  label="چاپ لوگو روی فاکتور"
                  hint="لوگوی آپلودشده در بالای رسید چاپ می‌شود"
                />
              </div>
              <div className="settings-field settings-field--wide">
                <Toggle
                  checked={settings.showContactOnReceipt}
                  onChange={(v) => patch({ showContactOnReceipt: v })}
                  label="چاپ تلفن و آدرس روی فاکتور"
                  hint="فقط وقتی در اطلاعات رستوران پر شده باشند"
                />
              </div>
              <label className="settings-field settings-field--wide">
                <span>متن پایانی فاکتور</span>
                <input
                  type="text"
                  value={settings.receiptFooterMessage}
                  onChange={(e) =>
                    patch({ receiptFooterMessage: e.target.value })
                  }
                  placeholder="به امید دیدار مجدد"
                />
              </label>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <h4>ساختار منو</h4>
              <p>
                یکی از قالب‌های آماده را برای منوی مشتری انتخاب کنید؛ منوی شخصی
                فقط با پشتیبانی فعال می‌شود.
              </p>
            </div>
            <div
              className="settings-structure-grid"
              role="radiogroup"
              aria-label="ساختار منو"
            >
              {MENU_STRUCTURE_OPTIONS.map((opt) => {
                const selected = settings.menuStructure === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`settings-structure-card${selected ? " is-selected" : ""}${opt.requiresSupport ? " is-personal" : ""}`}
                    onClick={() => patch({ menuStructure: opt.id })}
                  >
                    <StructureThumb id={opt.id} />
                    <div className="settings-structure-copy">
                      <strong>
                        {opt.title}
                        {opt.requiresSupport ? (
                          <span className="settings-structure-badge">پشتیبانی</span>
                        ) : null}
                      </strong>
                      <em>{opt.description}</em>
                    </div>
                  </button>
                );
              })}
            </div>
            {settings.menuStructure === "personal" ? (
              <div className="settings-structure-support">
                <p>
                  برای ساخت و فعال‌سازی «منوی شخصی من» با پشتیبانی تماس بگیرید.
                  تا زمان فعال‌سازی، منوی مشتری با قالب کلاسیک نمایش داده می‌شود.
                </p>
                <div className="settings-structure-support-actions">
                  <a
                    className="cp-btn cp-btn--ghost"
                    href={settings.telegram || SITE_CONFIG.telegram}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    تلگرام پشتیبانی
                  </a>
                  <a
                    className="cp-btn cp-btn--ghost"
                    href={`mailto:${settings.email || SITE_CONFIG.email}`}
                  >
                    ایمیل پشتیبانی
                  </a>
                </div>
              </div>
            ) : null}
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <h4>طراحی منو</h4>
              <p>رنگ‌ها و بخش‌های قابل نمایش در منوی مشتری</p>
            </div>
            <div className="settings-color-row">
              <label className="settings-color">
                <span>رنگ اصلی</span>
                <div className="settings-color-input">
                  <input
                    type="color"
                    value={settings.primary}
                    onChange={(e) => patch({ primary: e.target.value })}
                  />
                  <input
                    type="text"
                    dir="ltr"
                    value={settings.primary}
                    onChange={(e) => patch({ primary: e.target.value })}
                  />
                </div>
              </label>
              <label className="settings-color">
                <span>رنگ ثانویه</span>
                <div className="settings-color-input">
                  <input
                    type="color"
                    value={settings.secondary}
                    onChange={(e) => patch({ secondary: e.target.value })}
                  />
                  <input
                    type="text"
                    dir="ltr"
                    value={settings.secondary}
                    onChange={(e) => patch({ secondary: e.target.value })}
                  />
                </div>
              </label>
            </div>
            <div className="settings-toggles">
              <Toggle
                checked={settings.showNewSection}
                onChange={(v) => patch({ showNewSection: v })}
                label="نمایش بخش «تازه‌ها»"
                hint="ردیف آیتم‌های جدید در هر دسته"
              />
            </div>
          </section>
        </form>
      </div>
    </div>
  );
}
