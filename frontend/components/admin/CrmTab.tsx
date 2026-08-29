"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Customer, CustomerTier, Invoice, Order } from "@/lib/types";
import {
  CRM_TIER_OPTIONS,
  buildCrmProfiles,
  crmKpis,
  customerTierLabel,
  filterCrmProfiles,
  isBirthdaySoon,
  needsFollowUp,
  normalizeTags,
  normalizeTier,
  suggestCrmImports,
  type CrmProfile,
  type CrmRecentVisit,
  type CrmSegment,
} from "@/lib/crm";
import {
  formatDaysAgo,
  formatLastTouch,
  formatOrderTime,
  formatPriceAsNumber,
  toPersianDigits,
} from "@/lib/format";
import { formatJalaliIso, toIsoDate } from "@/lib/jalali";
import { DEFAULT_CAFE_NAME_FA } from "@/lib/brand";
import { apiJson, cashierHeaders } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { LoadingShimmer } from "@/components/admin/LoadingShimmer";
import { CpSelect } from "@/components/ui/CpSelect";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { INVOICE_STATUS_LABEL, ORDER_STATUS_LABEL, PAY_METHOD_LABEL } from "@/lib/types";
import {
  SMS_TEMPLATES,
  buildBulkSmsText,
  buildPersonalizedBulkSmsText,
  buildSmsText,
  personalizeBulkBody,
  phoneDigits,
  smsComposeHref,
  smsComposeHrefMulti,
  type SmsTemplateId,
} from "@/lib/sms";
import { mergeSiteSettings, type SiteSettings } from "@/lib/settings";

type Props = {
  active: boolean;
  invoices?: Invoice[];
  orders?: Order[];
  focusCustomerId?: string | null;
  onFocusCustomerConsumed?: () => void;
  onOpenVisit?: (visit: CrmRecentVisit) => void;
};

type Draft = {
  id?: string;
  name: string;
  phone: string;
  birthday: string;
  notes: string;
  tier: CustomerTier;
  tagsText: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  phone: "",
  birthday: "",
  notes: "",
  tier: "standard",
  tagsText: "",
};

const SEGMENTS: Array<{ id: CrmSegment; label: string }> = [
  { id: "all", label: "همه" },
  { id: "active", label: "فعال ۳۰ روز" },
  { id: "vip", label: "VIP" },
  { id: "gold", label: "طلایی+" },
  { id: "birthday", label: "تولد نزدیک" },
  { id: "followup", label: "نیاز به پیگیری" },
  { id: "atrisk", label: "در معرض ریزش" },
  { id: "inactive", label: "غیرفعال" },
  { id: "top", label: "بیشترین خرید" },
];

function formatCrmWhen(ts?: number | null) {
  if (!ts) return "—";
  return `${formatJalaliIso(toIsoDate(ts), true)} · ${formatOrderTime(ts)}`;
}

function visitStatusLabel(visit: CrmRecentVisit) {
  if (visit.kind === "invoice") {
    return INVOICE_STATUS_LABEL[visit.status] || visit.status;
  }
  return ORDER_STATUS_LABEL[visit.status] || visit.status;
}

function invoiceNumber(inv: Invoice) {
  return String(inv.number ?? inv.id?.slice(-4) ?? "—");
}

function segmentCount(profiles: CrmProfile[], id: CrmSegment) {
  if (id === "all") return profiles.length;
  return filterCrmProfiles(profiles, id, "").length;
}

function tagsToText(tags?: string[]) {
  return (tags || []).join("، ");
}

function textToTags(value: string) {
  return normalizeTags(
    value
      .split(/[,،]/)
      .map((t) => t.trim())
      .filter(Boolean)
  );
}

export function CrmTab({
  active,
  invoices = [],
  orders = [],
  focusCustomerId,
  onFocusCustomerConsumed,
  onOpenVisit,
}: Props) {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<CrmSegment>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [mounted, setMounted] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsTemplate, setSmsTemplate] = useState<SmsTemplateId>("followup");
  const [smsBody, setSmsBody] = useState("");
  const [smsTarget, setSmsTarget] = useState<CrmProfile | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [bulkQuery, setBulkQuery] = useState("");
  const [bulkTemplate, setBulkTemplate] =
    useState<SmsTemplateId>("followup");
  const [bulkBody, setBulkBody] = useState("");
  const [bulkPersonalized, setBulkPersonalized] = useState(false);
  const [bulkIndex, setBulkIndex] = useState(0);
  const [cafeName, setCafeName] = useState(DEFAULT_CAFE_NAME_FA);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!active) return;
    apiJson<{ settings?: Partial<SiteSettings> }>("/api/settings", {
      headers: cashierHeaders(),
    })
      .then((data) => {
        const s = mergeSiteSettings(data.settings || {});
        if (s.restaurantNameFa) setCafeName(s.restaurantNameFa);
      })
      .catch(() => {});
  }, [active]);

  function loadCustomers() {
    setLoading(true);
    setError("");
    return apiJson<{ customers?: Customer[] }>("/api/customers", {
      headers: cashierHeaders(),
    })
      .then((data) => setCustomers(data.customers || []))
      .catch(() => setError("بارگذاری باشگاه مشتریان ناموفق بود"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!active) return;
    loadCustomers();
  }, [active]);

  useEffect(() => {
    if (!focusCustomerId) return;
    setSelectedId(focusCustomerId);
    onFocusCustomerConsumed?.();
  }, [focusCustomerId, onFocusCustomerConsumed]);

  useEffect(() => {
    if (!detailInvoice) return;
    const next = invoices.find((inv) => inv.id === detailInvoice.id);
    if (next && next !== detailInvoice) setDetailInvoice(next);
    if (!next) setDetailInvoice(null);
  }, [invoices, detailInvoice]);

  useEffect(() => {
    if (!detailInvoice) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDetailInvoice(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [detailInvoice]);

  function openVisit(visit: CrmRecentVisit) {
    const byId = visit.invoiceId
      ? invoices.find((inv) => inv.id === visit.invoiceId)
      : null;
    const byOrder =
      !byId && visit.orderId
        ? invoices.find((inv) => inv.orderId === visit.orderId)
        : null;
    const invoice = byId || byOrder || null;
    if (invoice) {
      setDetailInvoice(invoice);
      return;
    }
    if (visit.kind === "invoice") {
      showToast("فاکتور پیدا نشد");
      return;
    }
    onOpenVisit?.(visit);
  }

  useEffect(() => {
    if (!dialogOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDialogOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialogOpen]);

  useEffect(() => {
    if (!bulkOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setBulkOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [bulkOpen]);

  const profiles = useMemo(
    () => buildCrmProfiles(customers, invoices, orders),
    [customers, invoices, orders]
  );
  const kpis = useMemo(() => crmKpis(profiles), [profiles]);
  const filtered = useMemo(
    () => filterCrmProfiles(profiles, segment, q),
    [profiles, segment, q]
  );
  const suggestions = useMemo(
    () => suggestCrmImports(customers, invoices),
    [customers, invoices]
  );
  const selected =
    profiles.find((p) => p.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (!selectedId && filtered[0]) setSelectedId(filtered[0].id);
    if (selectedId && !profiles.some((p) => p.id === selectedId)) {
      setSelectedId(filtered[0]?.id || null);
    }
  }, [filtered, profiles, selectedId]);

  function openAdd(seed?: { name?: string; phone?: string }) {
    setDraft({
      ...EMPTY_DRAFT,
      name: seed?.name || "",
      phone: seed?.phone || "",
    });
    setDialogOpen(true);
  }

  function openEdit(profile: CrmProfile) {
    setDraft({
      id: profile.id,
      name: profile.name || "",
      phone: profile.phone || "",
      birthday: profile.birthday || "",
      notes: profile.notes || "",
      tier: normalizeTier(profile.tier),
      tagsText: tagsToText(profile.tags),
    });
    setDialogOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      showToast("نام مشتری الزامی است");
      return;
    }
    setBusy(true);
    try {
      const data = await apiJson<{ customers?: Customer[] }>("/api/customers", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({
          action: draft.id ? "update" : "add",
          id: draft.id,
          name,
          phone: draft.phone.trim(),
          birthday: draft.birthday,
          notes: draft.notes.trim(),
          tier: draft.tier,
          tags: textToTags(draft.tagsText),
        }),
      });
      const next = data.customers || [];
      setCustomers(next);
      setDialogOpen(false);
      if (!draft.id && next.length) {
        const created = next.find((c) => c.name === name);
        if (created) setSelectedId(created.id);
      }
      showToast(draft.id ? "پروفایل به‌روز شد" : "مشتری به باشگاه اضافه شد");
    } catch {
      showToast("ذخیره ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function removeCustomer(profile: CrmProfile) {
    if (!window.confirm(`«${profile.name}» از باشگاه مشتریان حذف شود؟`)) return;
    setBusy(true);
    try {
      const data = await apiJson<{ customers?: Customer[] }>("/api/customers", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({ action: "remove", id: profile.id }),
      });
      setCustomers(data.customers || []);
      if (selectedId === profile.id) setSelectedId(null);
      showToast("مشتری حذف شد");
    } catch {
      showToast("حذف ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function markContacted(
    profile: CrmProfile,
    toastText = "تماس ثبت شد"
  ) {
    setBusy(true);
    try {
      const data = await apiJson<{ customers?: Customer[] }>("/api/customers", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({ action: "touch", id: profile.id }),
      });
      setCustomers(data.customers || []);
      showToast(toastText);
    } catch {
      showToast("ثبت تماس ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  function openSms(profile: CrmProfile) {
    if (!profile.phone) {
      showToast("این مشتری شماره موبایل ندارد");
      return;
    }
    const preferred: SmsTemplateId = isBirthdaySoon(profile.birthday)
      ? "birthday"
      : "followup";
    setSmsTarget(profile);
    setSmsTemplate(preferred);
    setSmsBody(buildSmsText(preferred, profile, cafeName));
    setSmsOpen(true);
  }

  function applySmsTemplate(id: SmsTemplateId) {
    setSmsTemplate(id);
    if (!smsTarget) return;
    if (id === "custom") return;
    setSmsBody(buildSmsText(id, smsTarget, cafeName));
  }

  async function copySmsText() {
    const text = smsBody.trim();
    if (!text) {
      showToast("متن پیامک خالی است");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("متن پیامک کپی شد");
    } catch {
      showToast("کپی متن ناموفق بود");
    }
  }

  async function sendSmsToCustomer() {
    if (!smsTarget?.phone) {
      showToast("شماره موبایل موجود نیست");
      return;
    }
    const text = smsBody.trim();
    if (!text) {
      showToast("متن پیامک را بنویسید");
      return;
    }
    const href = smsComposeHref(smsTarget.phone, text);
    window.location.href = href;
    setSmsOpen(false);
    await markContacted(smsTarget, "پیامک آماده ارسال شد");
  }

  const bulkAllWithPhone = useMemo(() => {
    return profiles
      .filter((p) => Boolean(String(p.phone || "").trim()))
      .slice()
      .sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "fa")
      );
  }, [profiles]);

  const bulkCandidates = useMemo(() => {
    const needle = bulkQuery.trim().toLowerCase();
    if (!needle) return bulkAllWithPhone;
    return bulkAllWithPhone.filter((p) => {
      const hay = [p.name, p.phone, ...(p.tags || [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [bulkAllWithPhone, bulkQuery]);

  const bulkRecipients = useMemo(() => {
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return bulkIds
      .map((id) => byId.get(id))
      .filter((p): p is CrmProfile =>
        Boolean(p && String(p.phone || "").trim())
      );
  }, [profiles, bulkIds]);

  function openSmsApp(href: string) {
    const a = document.createElement("a");
    a.href = href;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function uniqueRecipientPhones(rows: CrmProfile[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of rows) {
      const key = phoneDigits(String(p.phone || ""));
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(String(p.phone).trim());
    }
    return out;
  }

  function openBulkSms() {
    if (!bulkAllWithPhone.length) {
      showToast("هیچ مشتری با شماره موبایل ثبت نشده است");
      return;
    }
    const segmentIds = filtered
      .filter((p) => Boolean(String(p.phone || "").trim()))
      .map((p) => p.id);
    setBulkIds(segmentIds);
    setBulkQuery("");
    setBulkTemplate("followup");
    setBulkBody(buildBulkSmsText("followup", cafeName));
    setBulkPersonalized(false);
    setBulkIndex(0);
    setBulkOpen(true);
  }

  function applyBulkTemplate(id: SmsTemplateId) {
    setBulkTemplate(id);
    setBulkIndex(0);
    if (id === "custom") return;
    setBulkBody(
      bulkPersonalized
        ? buildPersonalizedBulkSmsText(id, cafeName)
        : buildBulkSmsText(id, cafeName)
    );
  }

  function setBulkPersonalizedMode(on: boolean) {
    setBulkPersonalized(on);
    setBulkIndex(0);
    if (bulkTemplate === "custom") return;
    setBulkBody(
      on
        ? buildPersonalizedBulkSmsText(bulkTemplate, cafeName)
        : buildBulkSmsText(bulkTemplate, cafeName)
    );
  }

  function toggleBulkId(id: string) {
    setBulkIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setBulkIndex(0);
  }

  function selectVisibleBulk() {
    setBulkIds((prev) => {
      const next = new Set(prev);
      bulkCandidates.forEach((p) => next.add(p.id));
      return [...next];
    });
    setBulkIndex(0);
  }

  function selectAllCustomersBulk() {
    setBulkIds(bulkAllWithPhone.map((p) => p.id));
    setBulkIndex(0);
  }

  function clearBulk() {
    setBulkIds([]);
    setBulkIndex(0);
  }

  async function copyBulkText() {
    const text = bulkBody.trim();
    if (!text) {
      showToast("متن پیامک خالی است");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("متن پیامک کپی شد");
    } catch {
      showToast("کپی متن ناموفق بود");
    }
  }

  async function copyBulkPhones() {
    const phones = uniqueRecipientPhones(bulkRecipients);
    if (!phones.length) {
      showToast("گیرنده انتخاب نشده است");
      return;
    }
    try {
      await navigator.clipboard.writeText(phones.join("\n"));
      showToast(`${toPersianDigits(phones.length)} شماره کپی شد`);
    } catch {
      showToast("کپی شماره ناموفق بود");
    }
  }

  function sendBulkGroupSms() {
    if (!bulkRecipients.length) {
      showToast("گیرنده انتخاب نشده است");
      return;
    }
    const text = bulkBody.trim();
    if (!text) {
      showToast("متن پیامک را بنویسید");
      return;
    }
    if (bulkPersonalized) {
      showToast("برای پیام شخصی، از «ارسال بعدی» استفاده کنید");
      return;
    }
    const phones = uniqueRecipientPhones(bulkRecipients);
    if (!phones.length) {
      showToast("شماره معتبری برای ارسال نیست");
      return;
    }
    openSmsApp(smsComposeHrefMulti(phones, text));
  }

  function sendBulkNext() {
    if (!bulkRecipients.length) {
      showToast("گیرنده انتخاب نشده است");
      return;
    }
    const textBase = bulkBody.trim();
    if (!textBase) {
      showToast("متن پیامک را بنویسید");
      return;
    }
    const i = Math.min(Math.max(0, bulkIndex), bulkRecipients.length - 1);
    const target = bulkRecipients[i];
    if (!target?.phone) {
      showToast("شماره موبایل موجود نیست");
      return;
    }
    const text = bulkPersonalized
      ? personalizeBulkBody(textBase, target, cafeName)
      : textBase;
    openSmsApp(smsComposeHref(target.phone, text));
    if (i + 1 < bulkRecipients.length) {
      setBulkIndex(i + 1);
      showToast(
        `پیامک ${toPersianDigits(i + 1)} از ${toPersianDigits(bulkRecipients.length)} — بعدی آماده است`
      );
    } else {
      showToast("همه گیرنده‌ها باز شدند");
      setBulkIndex(0);
    }
  }

  async function setTier(profile: CrmProfile, tier: CustomerTier) {
    setBusy(true);
    try {
      const data = await apiJson<{ customers?: Customer[] }>("/api/customers", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({
          action: "update",
          id: profile.id,
          name: profile.name,
          phone: profile.phone,
          birthday: profile.birthday,
          notes: profile.notes,
          tags: profile.tags,
          tier,
          lastContactAt: profile.lastContactAt,
        }),
      });
      setCustomers(data.customers || []);
      showToast(`سطح به «${customerTierLabel(tier)}» تغییر کرد`);
    } catch {
      showToast("تغییر سطح ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-tab admin-tab--crm crm-page">
      <header className="crm-header">
        <div className="crm-header-text">
          <h3 className="crm-title">باشگاه مشتریان</h3>
          <p className="crm-subtitle">
            پروفایل، سطح وفاداری و پیگیری مشتریان ثبت‌شده
          </p>
        </div>
        <div className="crm-header-actions">
          <button
            type="button"
            className="cp-btn cp-btn--ghost"
            onClick={openBulkSms}
          >
            پیام گروهی
          </button>
          <button
            type="button"
            className="cp-btn cp-btn--primary"
            onClick={() => openAdd()}
          >
            + مشتری جدید
          </button>
        </div>
      </header>

      <section className="crm-hero" aria-label="خلاصه باشگاه مشتریان">
        <div className="crm-hero-main">
          <span className="crm-hero-label">کل مشتریان</span>
          <strong className="crm-hero-value">
            {toPersianDigits(kpis.total)}
          </strong>
          <em className="crm-hero-note">
            فروش ثبت‌شده{" "}
            <span className="cp-num">{formatPriceAsNumber(kpis.revenue)}</span>
          </em>
        </div>
        <ul className="crm-hero-side">
          <li>
            <span>فعال ۳۰ روز</span>
            <strong>{toPersianDigits(kpis.active)}</strong>
          </li>
          <li>
            <span>جدید این ماه</span>
            <strong>{toPersianDigits(kpis.newThisMonth)}</strong>
          </li>
          <li>
            <span>بازگشتی</span>
            <strong>{toPersianDigits(kpis.returning)}</strong>
          </li>
          <li>
            <span>VIP</span>
            <strong>{toPersianDigits(kpis.vip)}</strong>
          </li>
          <li>
            <span>میانگین خرید</span>
            <strong className="cp-num">
              {formatPriceAsNumber(kpis.avgSpend)}
            </strong>
          </li>
          <li>
            <span>در معرض ریزش</span>
            <strong>{toPersianDigits(kpis.atRisk)}</strong>
          </li>
          <li>
            <span>تولد نزدیک</span>
            <strong>{toPersianDigits(kpis.birthday)}</strong>
          </li>
          <li>
            <span>نیاز به پیگیری</span>
            <strong>{toPersianDigits(kpis.followup)}</strong>
          </li>
        </ul>
      </section>

      {suggestions.length ? (
        <section className="crm-suggest">
          <div className="crm-suggest-head">
            <h4>پیشنهاد ورود به باشگاه</h4>
            <p>مشتریانی که در فاکتور هستند ولی هنوز ثبت نشده‌اند</p>
          </div>
          <div className="crm-suggest-list">
            {suggestions.slice(0, 8).map((s) => (
              <button
                key={`${s.name}-${s.phone}`}
                type="button"
                className="crm-suggest-chip"
                onClick={() => openAdd({ name: s.name, phone: s.phone })}
              >
                <strong>{s.name || "بدون نام"}</strong>
                <em>
                  {toPersianDigits(s.visits)} خرید ·{" "}
                  {formatPriceAsNumber(s.spend)}
                </em>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="crm-toolbar">
        <input
          type="search"
          className="crm-search"
          placeholder="جستجو نام، تلفن، تگ یا یادداشت…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="crm-segments" role="tablist" aria-label="سگمنت">
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={segment === s.id}
              className={`crm-segment${segment === s.id ? " is-active" : ""}`}
              onClick={() => setSegment(s.id)}
            >
              {s.label}
              <em>{toPersianDigits(segmentCount(profiles, s.id))}</em>
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="crm-error">{error}</p> : null}

      {loading ? (
        <LoadingShimmer variant="list" count={6} />
      ) : (
        <div className="crm-layout">
          <ul className="crm-list">
            {filtered.length === 0 ? (
              <li className="crm-empty">
                <strong>مشتری‌ای در این سگمنت نیست</strong>
                <span>سگمنت یا جستجو را عوض کنید، یا مشتری جدید بسازید</span>
              </li>
            ) : (
              filtered.map((profile) => (
                <li key={profile.id} className="crm-list-item">
                  <button
                    type="button"
                    className={`crm-row${selected?.id === profile.id ? " is-active" : ""}${profile.tier === "vip" ? " is-vip" : ""}${needsFollowUp(profile) ? " is-followup" : ""}`}
                    onClick={() => setSelectedId(profile.id)}
                  >
                    <div className="crm-row-main">
                      <strong>{profile.name}</strong>
                      <small>
                        {profile.phone ? (
                          <span className="cp-num" dir="ltr">
                            {profile.phone}
                          </span>
                        ) : (
                          "بدون تلفن"
                        )}
                        {isBirthdaySoon(profile.birthday) ? (
                          <span className="crm-badge is-birthday">تولد</span>
                        ) : null}
                        {needsFollowUp(profile) ? (
                          <span className="crm-badge is-followup">پیگیری</span>
                        ) : null}
                      </small>
                    </div>
                    <div className="crm-row-meta">
                      <span className={`crm-tier is-${profile.tier || "standard"}`}>
                        {customerTierLabel(profile.tier)}
                      </span>
                      <em className="cp-num">
                        {formatPriceAsNumber(profile.spend)}
                      </em>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>

          {selected ? (
            <aside className="crm-detail" aria-label="پروفایل مشتری">
              <header className="crm-detail-head">
                <div>
                  <h4>{selected.name}</h4>
                  <p>
                    {selected.phone ? (
                      <a href={`tel:${selected.phone}`} dir="ltr" className="cp-num">
                        {selected.phone}
                      </a>
                    ) : (
                      "بدون تلفن"
                    )}
                  </p>
                </div>
                <div className="crm-detail-head-tools">
                  <span className={`crm-tier is-${selected.tier || "standard"}`}>
                    {customerTierLabel(selected.tier)}
                  </span>
                  <div className="crm-detail-quick">
                    <button
                      type="button"
                      className="cp-btn cp-btn--primary"
                      onClick={() => openEdit(selected)}
                    >
                      ویرایش
                    </button>
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost is-danger"
                      disabled={busy}
                      onClick={() => removeCustomer(selected)}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              </header>

              <div className="crm-detail-stats">
                <div>
                  <span>مراجعات</span>
                  <strong>{toPersianDigits(selected.visits)}</strong>
                </div>
                <div>
                  <span>جمع خرید</span>
                  <strong className="cp-num">
                    {formatPriceAsNumber(selected.spend)}
                  </strong>
                </div>
                <div>
                  <span>میانگین فاکتور</span>
                  <strong className="cp-num">
                    {formatPriceAsNumber(selected.avgTicket)}
                  </strong>
                </div>
                <div>
                  <span>آخرین مراجعه</span>
                  <strong>{formatDaysAgo(selected.lastVisitAt)}</strong>
                </div>
                <div>
                  <span>تعداد سفارش</span>
                  <strong>{toPersianDigits(selected.orderCount)}</strong>
                </div>
                <div>
                  <span>خرید ماه جاری</span>
                  <strong className="cp-num">
                    {formatPriceAsNumber(selected.monthSpend)}
                  </strong>
                </div>
              </div>

              <div className="crm-detail-block">
                <span className="crm-detail-label">سطح وفاداری</span>
                <div className="crm-tier-picks">
                  {CRM_TIER_OPTIONS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`crm-tier-pick${selected.tier === t.id ? " is-active" : ""}`}
                      disabled={busy}
                      onClick={() => setTier(selected, t.id)}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              </div>

              {(selected.tags || []).length ? (
                <div className="crm-detail-block">
                  <span className="crm-detail-label">تگ‌ها</span>
                  <div className="crm-tags">
                    {selected.tags!.map((tag) => (
                      <span key={tag} className="crm-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {selected.birthday ? (
                <div className="crm-detail-block">
                  <span className="crm-detail-label">تاریخ تولد</span>
                  <p className="crm-detail-text cp-num">
                    {formatJalaliIso(selected.birthday)}
                    {isBirthdaySoon(selected.birthday) ? " · نزدیک است" : ""}
                  </p>
                </div>
              ) : null}

              {selected.notes ? (
                <div className="crm-detail-block">
                  <span className="crm-detail-label">یادداشت</span>
                  <p className="crm-detail-text">{selected.notes}</p>
                </div>
              ) : null}

              <div className="crm-detail-block">
                <span className="crm-detail-label">آخرین تماس / پیامک</span>
                <p className="crm-detail-text">
                  {formatLastTouch(selected.lastContactAt)}
                </p>
              </div>

              <div className="crm-detail-actions">
                <button
                  type="button"
                  className="cp-btn cp-btn--primary"
                  disabled={busy || !selected.phone}
                  onClick={() => openSms(selected)}
                >
                  پیامک
                </button>
                <button
                  type="button"
                  className="cp-btn cp-btn--ghost"
                  disabled={busy}
                  onClick={() => markContacted(selected)}
                >
                  ثبت تماس
                </button>
              </div>

              <div className="crm-detail-block">
                <span className="crm-detail-label">محبوب‌ترین محصولات</span>
                {selected.favorites.length === 0 ? (
                  <p className="crm-detail-text is-muted">
                    هنوز اطلاعات کافی برای نمایش محصولات محبوب وجود ندارد.
                  </p>
                ) : (
                  <ul className="crm-fav-list">
                    {selected.favorites.map((fav) => (
                      <li key={fav.name}>
                        <strong>{fav.name}</strong>
                        <em>× {toPersianDigits(fav.count)}</em>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selected.visitPattern ? (
                <div className="crm-detail-block">
                  <span className="crm-detail-label">الگوی مراجعه</span>
                  <ul className="crm-insight-list">
                    <li>
                      <span>میانگین مراجعه</span>
                      <strong>
                        {toPersianDigits(selected.visitPattern.avgMonthly)} بار
                        در ماه
                      </strong>
                    </li>
                    {selected.visitPattern.usualHours ? (
                      <li>
                        <span>ساعت معمول</span>
                        <strong>{selected.visitPattern.usualHours}</strong>
                      </li>
                    ) : null}
                    {selected.visitPattern.busyDays.length ? (
                      <li>
                        <span>روزهای پرتکرار</span>
                        <strong>
                          {selected.visitPattern.busyDays.join("، ")}
                        </strong>
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              <div className="crm-detail-block">
                <span className="crm-detail-label">مراجعه‌های اخیر</span>
                {selected.recentVisits.length === 0 ? (
                  <p className="crm-detail-text is-muted">
                    هنوز سفارشی برای این مشتری ثبت نشده است.
                  </p>
                ) : (
                  <ul className="crm-invoice-list">
                    {selected.recentVisits.map((visit) => (
                      <li key={visit.key}>
                        <button
                          type="button"
                          className="crm-visit-row"
                          onClick={() => openVisit(visit)}
                        >
                          <strong className="cp-num">
                            {visit.kind === "invoice"
                              ? `#${toPersianDigits(String(visit.number || "—"))}`
                              : `سفارش ${toPersianDigits(visit.orderId?.slice(-4) || "—")}`}
                          </strong>
                          <span>
                            {formatCrmWhen(visit.createdAt)} · میز{" "}
                            {toPersianDigits(String(visit.table || "—"))} ·{" "}
                            {visitStatusLabel(visit)}
                          </span>
                          <em className="cp-num">
                            {formatPriceAsNumber(visit.total)}
                          </em>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          ) : (
            <aside className="crm-detail crm-detail--empty">
              <p>یک مشتری را از لیست انتخاب کنید</p>
            </aside>
          )}
        </div>
      )}

      {mounted && smsOpen && smsTarget
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="crm-sms-title"
              onClick={() => setSmsOpen(false)}
            >
              <div
                className="table-glass-dialog menu-glass-dialog crm-glass-dialog crm-sms-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 id="crm-sms-title" className="table-glass-title">
                      ارسال پیامک
                    </h4>
                    <p className="table-glass-sub">
                      {smsTarget.name} ·{" "}
                      <span className="cp-num" dir="ltr">
                        {smsTarget.phone}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    onClick={() => setSmsOpen(false)}
                  >
                    ×
                  </button>
                </header>

                <div className="crm-sms-templates" role="tablist">
                  {SMS_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={smsTemplate === t.id}
                      className={`crm-sms-template${smsTemplate === t.id ? " is-active" : ""}`}
                      onClick={() => applySmsTemplate(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <label className="crm-field">
                  <span>متن پیامک</span>
                  <textarea
                    rows={5}
                    value={smsBody}
                    onChange={(e) => {
                      setSmsTemplate("custom");
                      setSmsBody(e.target.value);
                    }}
                    placeholder="متن پیامک را بنویسید یا از قالب بالا انتخاب کنید…"
                  />
                </label>

                <p className="crm-sms-hint">
                  با زدن «ارسال»، برنامه پیامک گوشی/تبلت با این متن برای همین
                  مشتری باز می‌شود.
                </p>

                <footer className="tables-manage-dialog-footer">
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    onClick={() => void copySmsText()}
                  >
                    کپی متن
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    onClick={() => setSmsOpen(false)}
                  >
                    انصراف
                  </button>
                  <button
                    type="button"
                    className={`cp-btn cp-btn--primary${busy ? " is-loading" : ""}`}
                    disabled={busy || !smsBody.trim()}
                    onClick={() => void sendSmsToCustomer()}
                  >
                    ارسال به مشتری
                  </button>
                </footer>
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && bulkOpen
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="crm-bulk-sms-title"
              onClick={() => setBulkOpen(false)}
            >
              <div
                className="table-glass-dialog menu-glass-dialog crm-glass-dialog crm-bulk-sms-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 id="crm-bulk-sms-title" className="table-glass-title">
                      پیام گروهی
                    </h4>
                    <p className="table-glass-sub">
                      همه مشتریان دارای موبایل ·{" "}
                      {toPersianDigits(bulkAllWithPhone.length)} نفر
                    </p>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    onClick={() => setBulkOpen(false)}
                  >
                    ×
                  </button>
                </header>

                <div className="crm-bulk-toolbar">
                  <span>
                    {toPersianDigits(bulkRecipients.length)} انتخاب‌شده از{" "}
                    {toPersianDigits(bulkAllWithPhone.length)}
                  </span>
                  <div className="crm-bulk-toolbar-actions">
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost"
                      onClick={selectVisibleBulk}
                    >
                      انتخاب نتایج
                    </button>
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost"
                      onClick={selectAllCustomersBulk}
                    >
                      انتخاب همه
                    </button>
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost"
                      onClick={clearBulk}
                    >
                      پاک کردن
                    </button>
                  </div>
                </div>

                <input
                  type="search"
                  className="crm-bulk-search"
                  placeholder="جستجوی نام یا شماره در همه مشتریان…"
                  value={bulkQuery}
                  onChange={(e) => setBulkQuery(e.target.value)}
                />

                <ul className="crm-bulk-recipients" aria-label="گیرندگان">
                  {bulkCandidates.length === 0 ? (
                    <li className="crm-bulk-empty">
                      {bulkAllWithPhone.length
                        ? "نتیجه‌ای با این جستجو نیست"
                        : "مشتری با شماره موبایل نیست"}
                    </li>
                  ) : (
                    bulkCandidates.map((p) => {
                      const checked = bulkIds.includes(p.id);
                      const isNext =
                        bulkPersonalized &&
                        bulkRecipients[bulkIndex]?.id === p.id;
                      return (
                        <li key={p.id}>
                          <label
                            className={`crm-bulk-recipient${checked ? " is-checked" : ""}${isNext ? " is-next" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleBulkId(p.id)}
                            />
                            <span className="crm-bulk-recipient-main">
                              <strong>{p.name || "بدون نام"}</strong>
                              <em className="cp-num" dir="ltr">
                                {p.phone}
                              </em>
                            </span>
                            {isNext ? (
                              <span className="crm-bulk-next-tag">بعدی</span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })
                  )}
                </ul>

                <div className="crm-sms-templates" role="tablist">
                  {SMS_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={bulkTemplate === t.id}
                      className={`crm-sms-template${bulkTemplate === t.id ? " is-active" : ""}`}
                      onClick={() => applyBulkTemplate(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <label className="crm-bulk-personalize">
                  <input
                    type="checkbox"
                    checked={bulkPersonalized}
                    onChange={(e) => setBulkPersonalizedMode(e.target.checked)}
                  />
                  <span>
                    شخصی‌سازی نام برای هر نفر (ارسال یکی‌یکی با{" "}
                    <code>{"{{name}}"}</code>)
                  </span>
                </label>

                <label className="crm-field">
                  <span>متن پیامک</span>
                  <textarea
                    rows={5}
                    value={bulkBody}
                    onChange={(e) => {
                      setBulkTemplate("custom");
                      setBulkBody(e.target.value);
                      setBulkIndex(0);
                    }}
                    placeholder="یک پیام برای همه بنویسید…"
                  />
                </label>

                <p className="crm-sms-hint">
                  {bulkPersonalized
                    ? `ارسال بعدی پیامک ${toPersianDigits(Math.min(bulkIndex + 1, Math.max(bulkRecipients.length, 1)))} از ${toPersianDigits(bulkRecipients.length || 0)} را باز می‌کند.`
                    : "ارسال گروهی برنامه پیامک را با همه شماره‌ها و همین متن باز می‌کند (بیشتر روی اندروید)."}
                </p>

                <footer className="tables-manage-dialog-footer crm-bulk-footer">
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    onClick={() => void copyBulkText()}
                  >
                    کپی متن
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    onClick={() => void copyBulkPhones()}
                  >
                    کپی شماره‌ها
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    onClick={() => setBulkOpen(false)}
                  >
                    انصراف
                  </button>
                  {bulkPersonalized ? (
                    <button
                      type="button"
                      className="cp-btn cp-btn--primary"
                      disabled={!bulkRecipients.length || !bulkBody.trim()}
                      onClick={sendBulkNext}
                    >
                      ارسال بعدی
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="cp-btn cp-btn--primary"
                      disabled={!bulkRecipients.length || !bulkBody.trim()}
                      onClick={sendBulkGroupSms}
                    >
                      ارسال گروهی
                    </button>
                  )}
                </footer>
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && detailInvoice
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="جزئیات فاکتور"
              onClick={() => setDetailInvoice(null)}
            >
              <div
                className="table-glass-dialog menu-glass-dialog invoice-glass-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 className="table-glass-title">
                      فاکتور #
                      {toPersianDigits(invoiceNumber(detailInvoice))}
                    </h4>
                    <p className="table-glass-sub">
                      میز{" "}
                      {toPersianDigits(String(detailInvoice.table || "—"))} ·{" "}
                      {formatOrderTime(detailInvoice.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    onClick={() => setDetailInvoice(null)}
                  >
                    ×
                  </button>
                </header>

                <div className="invoice-glass-status-row">
                  <span
                    className={`invoices-badge invoices-badge--${detailInvoice.status || "unpaid"}`}
                  >
                    {INVOICE_STATUS_LABEL[detailInvoice.status || "unpaid"] ||
                      detailInvoice.status}
                  </span>
                  <span className="invoice-glass-pay-chip">
                    {PAY_METHOD_LABEL[detailInvoice.payMethod || ""] ||
                      "بدون پرداخت"}
                  </span>
                </div>

                {(detailInvoice.customerName || detailInvoice.customerPhone) && (
                  <p className="invoice-glass-customer">
                    {[detailInvoice.customerName, detailInvoice.customerPhone]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}

                {detailInvoice.items?.length ? (
                  <section className="menu-glass-section invoice-glass-items">
                    <span className="table-glass-label">آیتم‌ها</span>
                    <div className="table-glass-card">
                      <ul className="table-glass-list">
                        {detailInvoice.items.map((it, idx) => (
                          <li key={`${it.name}-${idx}`}>
                            <span>
                              {toPersianDigits(it.count || 1)}× {it.name}
                            </span>
                            <span className="cp-num">
                              {formatPriceAsNumber(
                                it.line ??
                                  (Number(it.price) || 0) * (it.count || 1)
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                ) : null}

                <section className="menu-glass-section">
                  <span className="table-glass-label">خلاصه مبلغ</span>
                  <div className="table-glass-receipt">
                    {typeof detailInvoice.subtotal === "number" ? (
                      <div className="table-glass-receipt-line">
                        <span>جمع جزء</span>
                        <strong className="cp-num">
                          {formatPriceAsNumber(detailInvoice.subtotal)}
                        </strong>
                      </div>
                    ) : null}
                    {(detailInvoice.discountAmount || 0) > 0 ? (
                      <div className="table-glass-receipt-line is-discount">
                        <span>تخفیف</span>
                        <strong className="cp-num">
                          −
                          {formatPriceAsNumber(
                            detailInvoice.discountAmount || 0
                          )}
                        </strong>
                      </div>
                    ) : null}
                    {(detailInvoice.tax || 0) > 0 ? (
                      <div className="table-glass-receipt-line">
                        <span>مالیات</span>
                        <strong className="cp-num">
                          +{formatPriceAsNumber(detailInvoice.tax || 0)}
                        </strong>
                      </div>
                    ) : null}
                    <div className="table-glass-receipt-total">
                      <span>مبلغ نهایی</span>
                      <strong className="cp-num">
                        {formatPriceAsNumber(detailInvoice.total || 0)}
                      </strong>
                    </div>
                  </div>
                </section>

                {detailInvoice.payments?.length ? (
                  <section className="menu-glass-section invoice-glass-payments">
                    <span className="table-glass-label">پرداخت‌ها</span>
                    <div className="table-glass-card">
                      <ul className="table-glass-list">
                        {detailInvoice.payments.map((p, idx) => (
                          <li key={`${p.method}-${idx}`}>
                            <span>
                              {PAY_METHOD_LABEL[p.method || ""] ||
                                p.method ||
                                "—"}
                            </span>
                            <span className="cp-num">
                              {formatPriceAsNumber(p.amount || 0)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                ) : null}

                <footer className="menu-glass-actions">
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    onClick={() => setDetailInvoice(null)}
                  >
                    بستن
                  </button>
                </footer>
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && dialogOpen
        ? createPortal(
            <div
              className="table-glass-overlay"
              onClick={(e) => {
                if (e.target === e.currentTarget) setDialogOpen(false);
              }}
            >
              <form
                className="table-glass-dialog menu-glass-dialog crm-glass-dialog"
                onSubmit={save}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 className="table-glass-title">
                      {draft.id ? "ویرایش عضو باشگاه" : "عضو جدید باشگاه مشتریان"}
                    </h4>
                    <p className="table-glass-sub">
                      سطح وفاداری، تگ و یادداشت برای پیگیری بهتر
                    </p>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    onClick={() => setDialogOpen(false)}
                  >
                    ×
                  </button>
                </header>

                <div className="crm-form">
                  <label className="crm-field">
                    <span>نام</span>
                    <input
                      type="text"
                      required
                      value={draft.name}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, name: e.target.value }))
                      }
                    />
                  </label>
                  <label className="crm-field">
                    <span>موبایل</span>
                    <input
                      type="tel"
                      dir="ltr"
                      value={draft.phone}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, phone: e.target.value }))
                      }
                      placeholder="09…"
                    />
                  </label>
                  <div className="crm-field-row">
                    <label className="crm-field">
                      <span>سطح</span>
                      <CpSelect
                        value={draft.tier}
                        options={CRM_TIER_OPTIONS.map(
                          (o) => [o.id, o.title] as [string, string]
                        )}
                        onChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            tier: v as CustomerTier,
                          }))
                        }
                      />
                    </label>
                    <JalaliDatePicker
                      label="تاریخ تولد"
                      hint="اختیاری"
                      value={draft.birthday}
                      placeholder="انتخاب نشده"
                      disabled={busy}
                      spanPastYears={90}
                      spanFutureYears={0}
                      defaultViewYearsAgo={25}
                      onChange={(iso) =>
                        setDraft((d) => ({ ...d, birthday: iso || "" }))
                      }
                    />
                  </div>
                  <label className="crm-field">
                    <span>تگ‌ها (با ویرگول)</span>
                    <input
                      type="text"
                      value={draft.tagsText}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, tagsText: e.target.value }))
                      }
                      placeholder="مثلاً گیاه‌خوار، میز ثابت، مهمان ویژه"
                    />
                  </label>
                  <label className="crm-field">
                    <span>یادداشت</span>
                    <textarea
                      rows={3}
                      value={draft.notes}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, notes: e.target.value }))
                      }
                      placeholder="ترجیحات، آلرژی، یادآوری پیگیری…"
                    />
                  </label>
                </div>

                <footer className="tables-manage-dialog-footer">
                  {draft.id ? (
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost is-danger"
                      disabled={busy}
                      onClick={() => {
                        const profile = profiles.find((p) => p.id === draft.id);
                        if (!profile) return;
                        setDialogOpen(false);
                        void removeCustomer(profile);
                      }}
                    >
                      حذف مشتری
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    onClick={() => setDialogOpen(false)}
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className={`cp-btn cp-btn--primary${busy ? " is-loading" : ""}`}
                    disabled={busy}
                  >
                    ذخیره
                  </button>
                </footer>
              </form>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
