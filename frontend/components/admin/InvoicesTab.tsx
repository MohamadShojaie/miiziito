"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Invoice, TablesPayload } from "@/lib/types";
import {
  formatOrderTime,
  formatPriceAsNumber,
  toPersianDigits,
} from "@/lib/format";
import { INVOICE_STATUS_LABEL, PAY_METHOD_LABEL } from "@/lib/types";
import { DateRangePicker } from "@/components/admin/DateRangePicker";
import { CpSelect } from "@/components/ui/CpSelect";
import { isoToMs, startOfDayMs, toIsoDate } from "@/lib/jalali";
import { apiJson, cashierHeaders } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { LoadingShimmer } from "@/components/admin/LoadingShimmer";
import {
  invoicePrintHtml,
  invoiceToReceipt,
  printErrorMessage,
  printHtmlDocument,
  printReceipt,
} from "@/lib/printer";
import { invoiceToEscPosBase64 } from "@/lib/receipt-image";
import {
  DEFAULT_SITE_SETTINGS,
  mergeSiteSettings,
  type SiteSettings,
} from "@/lib/settings";
import { DEFAULT_CAFE_NAME_FA } from "@/lib/brand";
import { CardPaymentModal } from "@/components/admin/CardPaymentModal";
import {
  defaultTerminal,
  listPaymentTerminals,
  type PaymentTerminal,
} from "@/lib/payment";

function rangeFor(
  filter: string,
  fromDate: string,
  toDate: string
): [number, number] {
  const now = new Date();
  const today = startOfDayMs(now);
  if (filter === "today") return [today, today + 86400000];
  if (filter === "yesterday") return [today - 86400000, today];
  if (filter === "week") return [today - 6 * 86400000, today + 86400000];
  if (filter === "month") {
    const m = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return [m, today + 86400000];
  }
  if (filter === "custom") {
    const from = isoToMs(fromDate);
    const to = isoToMs(toDate);
    if (!from && !to) return [0, 0];
    if (from && !to) return [from, from + 86400000];
    if (!from && to) return [to, to + 86400000];
    const start = Math.min(from, to);
    const end = Math.max(from, to) + 86400000;
    return [start, end];
  }
  return [0, 0];
}

function runInvoicesMotion(update: () => void) {
  if (typeof document === "undefined") {
    update();
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  if (reduce || typeof doc.startViewTransition !== "function") {
    update();
    return;
  }
  doc.startViewTransition(update);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function invoiceNumber(inv: Invoice) {
  return String(inv.number || inv.id.slice(-4));
}

const DATE_FILTERS = [
  ["today", "امروز"],
  ["yesterday", "دیروز"],
  ["week", "این هفته"],
  ["month", "این ماه"],
  ["all", "همه"],
  ["custom", "بازه دلخواه"],
] as const;

const STATUS_OPTIONS = [
  ["", "همه وضعیت‌ها"],
  ["paid", "پرداخت‌شده"],
  ["unpaid", "پرداخت‌نشده"],
  ["cancelled", "لغوشده"],
  ["refunded", "برگشت وجه"],
  ["partially_refunded", "برگشت جزئی"],
] as const;

const PAY_OPTIONS = [
  ["", "همه روش‌ها"],
  ["cash", "نقدی"],
  ["card", "کارت"],
  ["online", "آنلاین"],
  ["mixed", "ترکیبی"],
] as const;

export function InvoicesTab({
  invoices,
  loading = false,
  focusInvoiceId,
  onFocusInvoiceConsumed,
  onPatched,
}: {
  invoices: Invoice[];
  loading?: boolean;
  focusInvoiceId?: string | null;
  onFocusInvoiceConsumed?: () => void;
  onPatched?: (data: TablesPayload) => void;
}) {
  const { showToast } = useToast();
  const todayStr = toIsoDate(startOfDayMs());
  const [dateFilter, setDateFilter] = useState("today");
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [customPickerKey, setCustomPickerKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [payFilter, setPayFilter] = useState("");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [editInv, setEditInv] = useState<Invoice | null>(null);
  const [openDd, setOpenDd] = useState<"status" | "pay" | null>(null);
  const [busyId, setBusyId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftDiscountType, setDraftDiscountType] = useState<
    "" | "percent" | "fixed"
  >("");
  const [draftDiscountValue, setDraftDiscountValue] = useState("");
  const [draftPayMethod, setDraftPayMethod] = useState<"cash" | "card" | "online">(
    "cash"
  );
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(
    DEFAULT_SITE_SETTINGS
  );
  const [payTerminals, setPayTerminals] = useState<PaymentTerminal[]>([]);
  const [cardPayOpen, setCardPayOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function loadSettings() {
      apiJson<{ settings?: Partial<SiteSettings> }>("/api/settings", {
        headers: cashierHeaders(),
      })
        .then((data) => {
          if (cancelled) return;
          setSiteSettings(mergeSiteSettings(data.settings || {}));
        })
        .catch(() => {});
    }
    loadSettings();
    listPaymentTerminals()
      .then((rows) => {
        if (!cancelled) setPayTerminals(rows);
      })
      .catch(() => {});
    const onFocus = () => loadSettings();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  async function refreshSiteSettings(): Promise<SiteSettings> {
    try {
      const data = await apiJson<{ settings?: Partial<SiteSettings> }>(
        "/api/settings",
        { headers: cashierHeaders() }
      );
      const next = mergeSiteSettings(data.settings || {});
      setSiteSettings(next);
      return next;
    } catch {
      return siteSettings;
    }
  }

  useEffect(() => {
    if (!openDd) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".invoices-dd")) return;
      setOpenDd(null);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [openDd]);

  useEffect(() => {
    if (!focusInvoiceId) return;
    const hit = invoices.find((inv) => inv.id === focusInvoiceId) || null;
    if (hit) {
      setDetail(hit);
      setDateFilter("all");
    }
    onFocusInvoiceConsumed?.();
  }, [focusInvoiceId, invoices, onFocusInvoiceConsumed]);

  useEffect(() => {
    if (!detail && !editInv) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (busyId) return;
        setDetail(null);
        setEditInv(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [detail, editInv, busyId]);

  useEffect(() => {
    if (!editInv) return;
    setDraftName(editInv.customerName || "");
    setDraftPhone(editInv.customerPhone || "");
    const dtype =
      editInv.discountType === "percent" || editInv.discountType === "fixed"
        ? editInv.discountType
        : "";
    setDraftDiscountType(dtype);
    setDraftDiscountValue(
      dtype ? String(editInv.discountValue ?? editInv.discountAmount ?? "") : ""
    );
    const pay =
      editInv.payMethod === "card" || editInv.payMethod === "online"
        ? editInv.payMethod
        : "cash";
    setDraftPayMethod(pay);
  }, [editInv]);

  useEffect(() => {
    if (!detail) return;
    const next = invoices.find((i) => i.id === detail.id);
    if (next && next !== detail) setDetail(next);
  }, [invoices, detail]);

  const filtered = useMemo(() => {
    const [from, to] = rangeFor(dateFilter, fromDate, toDate);
    return invoices
      .filter((inv) => {
        const ts = Number(inv.createdAt || 0);
        if (from && ts < from) return false;
        if (to && ts >= to) return false;
        if (statusFilter && (inv.status || "") !== statusFilter) return false;
        if (payFilter && (inv.payMethod || "") !== payFilter) return false;
        if (q.trim()) {
          const hay = `${inv.number || ""} ${inv.table || ""} ${inv.customerName || ""} ${inv.customerPhone || ""}`;
          if (!hay.includes(q) && !hay.includes(toPersianDigits(q))) return false;
        }
        return true;
      })
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }, [invoices, dateFilter, fromDate, toDate, statusFilter, payFilter, q]);

  const summary = useMemo(() => {
    let sales = 0;
    let count = 0;
    let unpaidCount = 0;
    filtered.forEach((inv) => {
      const st = inv.status || "unpaid";
      if (st === "cancelled") return;
      count += 1;
      if (st === "unpaid") unpaidCount += 1;
      else {
        const refunded = (inv.refunds || []).reduce(
          (s, r) => s + Number(r.amount || 0),
          0
        );
        sales += Math.max(0, Number(inv.total || 0) - refunded);
      }
    });
    return { sales, count, unpaidCount };
  }, [filtered]);

  const hasActiveFilters =
    !!q.trim() ||
    dateFilter !== "today" ||
    !!statusFilter ||
    !!payFilter;

  const emptyMessage = q.trim()
    ? "نتیجه‌ای برای این جستجو پیدا نشد."
    : hasActiveFilters
      ? "فاکتوری با این فیلترها نیست."
      : "هنوز فاکتوری ثبت نشده است.";

  async function printInvoice(inv: Invoice) {
    const settings = await refreshSiteSettings();
    return printHtmlDocument(invoicePrintHtml(inv, settings));
  }

  async function printThermal(inv: Invoice) {
    try {
      const settings = await refreshSiteSettings();
      // Image workflow: full-width receipt → ≤100px strips → GS v 0
      const bytesBase64 = await invoiceToEscPosBase64(inv, settings);
      const result = await printReceipt(invoiceToReceipt(inv, settings), {
        bytesBase64,
      });
      if (result.ok) {
        showToast("رسید روی پرینتر حرارتی چاپ شد");
      } else {
        showToast(printErrorMessage(result));
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      showToast(
        printErrorMessage({ ok: false, error: code || "communication_error" })
      );
    }
  }

  function exportExcel() {
    if (!filtered.length) {
      showToast("فاکتوری برای خروجی نیست");
      return;
    }
    const headers = [
      "شماره",
      "میز",
      "زمان",
      "مشتری",
      "موبایل",
      "جمع جزء",
      "تخفیف",
      "مالیات",
      "مبلغ نهایی",
      "روش پرداخت",
      "وضعیت",
    ];
    const rows = filtered.map((inv) => [
      invoiceNumber(inv),
      String(inv.table || ""),
      formatOrderTime(inv.createdAt),
      inv.customerName || "",
      inv.customerPhone || "",
      String(inv.subtotal ?? ""),
      String(inv.discountAmount ?? 0),
      String(inv.tax ?? 0),
      String(inv.total ?? 0),
      PAY_METHOD_LABEL[inv.payMethod || ""] || inv.payMethod || "",
      INVOICE_STATUS_LABEL[inv.status || "unpaid"] || inv.status || "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(
      `miiziito-invoices-${stamp}.csv`,
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
    );
    showToast("فایل Excel آماده شد");
  }

  function exportPdf() {
    if (!filtered.length) {
      showToast("فاکتوری برای خروجی نیست");
      return;
    }
    const rows = filtered
      .map((inv) => {
        const st = inv.status || "unpaid";
        return `<tr>
          <td>${toPersianDigits(invoiceNumber(inv))}</td>
          <td>${toPersianDigits(String(inv.table || "—"))}</td>
          <td>${formatOrderTime(inv.createdAt)}</td>
          <td>${inv.customerName || "—"}</td>
          <td>${formatPriceAsNumber(inv.total || 0)}</td>
          <td>${PAY_METHOD_LABEL[inv.payMethod || ""] || "—"}</td>
          <td>${INVOICE_STATUS_LABEL[st] || st}</td>
        </tr>`;
      })
      .join("");
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"/><title>خروجی فاکتورها</title>
<style>
  @page { margin: 14mm; }
  @font-face {
    font-family: "Vazir";
    src: url("${origin}/assets/fonts/Vazir.woff2") format("woff2"),
         url("${origin}/assets/fonts/Vazir.woff") format("woff"),
         url("${origin}/assets/fonts/Vazir.ttf") format("truetype");
    font-weight: 400; font-style: normal; font-display: block;
  }
  @font-face {
    font-family: "Vazir";
    src: url("${origin}/assets/fonts/Vazir-Bold.woff2") format("woff2"),
         url("${origin}/assets/fonts/Vazir-Bold.woff") format("woff"),
         url("${origin}/assets/fonts/Vazir-Bold.ttf") format("truetype");
    font-weight: 700; font-style: normal; font-display: block;
  }
  body{font-family:"Vazir",Tahoma,sans-serif;padding:16px;color:#111;line-height:1.6;-webkit-font-smoothing:antialiased}
  h1{font-size:18px;margin:0 0 6px;font-weight:700}
  .meta{font-size:12px;color:#444;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #ddd;padding:7px 6px;text-align:right}
  th{background:#f3f3f3;font-weight:700}
  .foot{margin-top:12px;font-size:13px;font-weight:700}
</style></head><body>
<h1>${siteSettings.restaurantNameFa || DEFAULT_CAFE_NAME_FA} — گزارش فاکتورها</h1>
<div class="meta">${toPersianDigits(filtered.length)} فاکتور · فروش ${formatPriceAsNumber(summary.sales)}</div>
<table>
  <thead><tr><th>شماره</th><th>میز</th><th>زمان</th><th>مشتری</th><th>مبلغ</th><th>پرداخت</th><th>وضعیت</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="foot">جمع فروش: ${formatPriceAsNumber(summary.sales)}</div>
</body></html>`;
    if (!printHtmlDocument(html)) {
      showToast("چاپ مرورگر در دسترس نیست");
      return;
    }
    showToast("پنجره چاپ باز شد — برای PDF گزینه Save as PDF را بزنید");
  }

  async function saveEdit() {
    if (!editInv) return;
    if ((editInv.status || "") === "unpaid" && !draftName.trim()) {
      showToast("برای فاکتور بدهکار نام مشتری الزامی است");
      return;
    }
    setBusyId(editInv.id);
    try {
      const body: Record<string, unknown> = {
        action: "edit",
        customerName: draftName.trim(),
        customerPhone: draftPhone.trim(),
      };
      if ((editInv.status || "unpaid") === "unpaid") {
        body.discountType = draftDiscountType;
        body.discountValue = Number(draftDiscountValue) || 0;
      }
      const data = await apiJson<TablesPayload>(
        `/api/invoices/${editInv.id}`,
        {
          method: "POST",
          headers: cashierHeaders(),
          body: JSON.stringify(body),
        }
      );
      onPatched?.(data);
      if (data.invoice) {
        setDetail((prev) =>
          prev?.id === data.invoice!.id ? data.invoice! : prev
        );
      }
      setEditInv(null);
      showToast("فاکتور ویرایش شد");
    } catch (err) {
      const code =
        err instanceof Error && err.message ? err.message : "request_failed";
      const hints: Record<string, string> = {
        invoice_cancelled: "فاکتور لغو شده قابل ویرایش نیست",
        auth_required: "لطفاً دوباره وارد شوید",
        not_found: "فاکتور پیدا نشد",
        customer_required: "برای فاکتور بدهکار نام مشتری الزامی است",
      };
      showToast(hints[code] || "ویرایش ناموفق بود");
    } finally {
      setBusyId("");
    }
  }

  async function markPaid(
    paymentsOverride?: Array<Record<string, unknown>>,
    inv?: Invoice | null
  ) {
    const target = inv || editInv;
    if (!target) return;
    const total = Math.round(Number(target.total) || 0);
    if (total <= 0) {
      showToast("مبلغ فاکتور نامعتبر است");
      return;
    }
    const activeTerminal = defaultTerminal(payTerminals);
    if (
      !inv &&
      draftPayMethod === "card" &&
      activeTerminal &&
      !paymentsOverride
    ) {
      setCardPayOpen(true);
      return;
    }
    setBusyId(target.id);
    try {
      const payments = paymentsOverride || [
        {
          method: inv ? "cash" : draftPayMethod,
          amount: total,
        },
      ];
      const data = await apiJson<TablesPayload>(
        `/api/invoices/${target.id}`,
        {
          method: "POST",
          headers: cashierHeaders(),
          body: JSON.stringify({
            action: "pay",
            payments,
          }),
        }
      );
      onPatched?.(data);
      if (data.invoice) {
        setDetail((prev) =>
          prev?.id === data.invoice!.id ? data.invoice! : prev
        );
      } else if (inv) {
        setDetail((prev) =>
          prev?.id === inv.id
            ? {
                ...prev,
                status: "paid",
                payMethod: "cash",
                payments: [{ method: "cash", amount: total }],
              }
            : prev
        );
      }
      if (!inv) setEditInv(null);
      showToast("پرداخت ثبت شد");
    } catch (err) {
      const code =
        err instanceof Error && err.message ? err.message : "request_failed";
      const hints: Record<string, string> = {
        payment_mismatch: "مبلغ پرداخت با فاکتور هم‌خوانی ندارد",
        invoice_cancelled: "فاکتور لغو شده است",
      };
      showToast(hints[code] || "ثبت پرداخت ناموفق بود");
    } finally {
      setBusyId("");
    }
  }

  async function cancelInvoice() {
    if (!editInv) return;
    if (!window.confirm("این فاکتور لغو شود؟")) return;
    setBusyId(editInv.id);
    try {
      const data = await apiJson<TablesPayload>(
        `/api/invoices/${editInv.id}`,
        {
          method: "POST",
          headers: cashierHeaders(),
          body: JSON.stringify({ action: "cancel" }),
        }
      );
      onPatched?.(data);
      setEditInv(null);
      setDetail(null);
      showToast("فاکتور لغو شد");
    } catch {
      showToast("لغو فاکتور ناموفق بود");
    } finally {
      setBusyId("");
    }
  }

  const editBusy = !!editInv && busyId === editInv.id;
  const editUnpaid = (editInv?.status || "") === "unpaid";

  return (
    <div className="invoices-page">
      <header className="invoices-header">
        <div className="invoices-header-text">
          <h3 className="invoices-title">فاکتورها</h3>
          <p className="invoices-subtitle">
            مدیریت فاکتورهای ثبت‌شده —{" "}
            <span className="invoices-subtitle-count">
              {loading ? "…" : `${toPersianDigits(summary.count)} فاکتور`}
            </span>
            {!loading && summary.unpaidCount > 0 ? (
              <>
                {" "}
                ·{" "}
                <span className="invoices-subtitle-unpaid">
                  {toPersianDigits(summary.unpaidCount)} پرداخت‌نشده
                </span>
              </>
            ) : null}
            {!loading && summary.sales > 0 ? (
              <> · فروش {formatPriceAsNumber(summary.sales)}</>
            ) : null}
          </p>
        </div>
        {!loading ? (
        <div className="invoices-header-actions">
          <button
            type="button"
            className="cp-btn cp-btn--ghost"
            onClick={exportExcel}
            disabled={!filtered.length}
          >
            خروجی Excel
          </button>
          <button
            type="button"
            className="cp-btn cp-btn--ghost"
            onClick={exportPdf}
            disabled={!filtered.length}
          >
            خروجی PDF
          </button>
        </div>
        ) : null}
      </header>

      {loading ? <LoadingShimmer variant="invoices" /> : null}

      {!loading ? (
      <>
      <section className="invoices-toolbar">
        <div className="invoices-search cp-search-wrap">
          <span className="cp-search-icon" aria-hidden="true" />
          <input
            className="cp-search invoices-search-input"
            type="search"
            placeholder="جستجو: شماره فاکتور، میز، مشتری، موبایل…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="جستجوی فاکتور"
          />
        </div>

        <div className="invoices-filter-row">
          <div className="invoices-filters" role="tablist" aria-label="بازه زمانی">
            {DATE_FILTERS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={dateFilter === key}
                className={`invoices-filter${dateFilter === key ? " is-active" : ""}`}
                onClick={() => {
                  if (dateFilter === key && key !== "custom") return;
                  runInvoicesMotion(() => {
                    setDateFilter(key);
                    if (key === "custom") setCustomPickerKey((k) => k + 1);
                  });
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {dateFilter === "custom" ? (
            <DateRangePicker
              key={customPickerKey}
              from={fromDate}
              to={toDate}
              autoOpen
              onChange={(from, to) => {
                setFromDate(from);
                setToDate(to);
                setDateFilter("custom");
              }}
            />
          ) : null}
        </div>

        <div className="invoices-selects">
          <div className={`invoices-dd${openDd === "status" ? " is-open" : ""}`}>
            <button
              type="button"
              className="invoices-dd-toggle"
              onClick={() =>
                setOpenDd(openDd === "status" ? null : "status")
              }
            >
              <span>
                {statusFilter
                  ? INVOICE_STATUS_LABEL[statusFilter] || statusFilter
                  : "همه وضعیت‌ها"}
              </span>
              <span aria-hidden="true">▾</span>
            </button>
            {openDd === "status" ? (
              <div className="invoices-dd-menu" role="listbox">
                {STATUS_OPTIONS.map(([v, label]) => (
                  <button
                    key={label}
                    type="button"
                    className={statusFilter === v ? "is-active" : undefined}
                    onClick={() => {
                      runInvoicesMotion(() => setStatusFilter(v));
                      setOpenDd(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className={`invoices-dd${openDd === "pay" ? " is-open" : ""}`}>
            <button
              type="button"
              className="invoices-dd-toggle"
              onClick={() => setOpenDd(openDd === "pay" ? null : "pay")}
            >
              <span>
                {payFilter
                  ? PAY_METHOD_LABEL[payFilter] || payFilter
                  : "همه روش‌ها"}
              </span>
              <span aria-hidden="true">▾</span>
            </button>
            {openDd === "pay" ? (
              <div className="invoices-dd-menu" role="listbox">
                {PAY_OPTIONS.map(([v, label]) => (
                  <button
                    key={label}
                    type="button"
                    className={payFilter === v ? "is-active" : undefined}
                    onClick={() => {
                      runInvoicesMotion(() => setPayFilter(v));
                      setOpenDd(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {!filtered.length ? (
        <div className="invoices-empty">
          <div className="invoices-empty-icon" aria-hidden="true">
            ◌
          </div>
          <p className="invoices-empty-title">{emptyMessage}</p>
          <p className="invoices-empty-hint">
            فاکتورهای ثبت‌شده از سفارش‌ها اینجا نمایش داده می‌شوند.
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              className="cp-btn cp-btn--ghost"
              onClick={() => {
                runInvoicesMotion(() => {
                  setQ("");
                  setDateFilter("today");
                  setFromDate(todayStr);
                  setToDate(todayStr);
                  setStatusFilter("");
                  setPayFilter("");
                });
              }}
            >
              پاک کردن فیلترها
            </button>
          ) : null}
        </div>
      ) : (
        <div className="invoices-table-wrap">
          <table className="invoices-table">
            <thead>
              <tr>
                <th>شماره</th>
                <th>میز</th>
                <th>زمان</th>
                <th>مشتری</th>
                <th>مبلغ</th>
                <th>پرداخت</th>
                <th>وضعیت</th>
                <th>اقدام</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv, index) => {
                const st = inv.status || "unpaid";
                const splitLabel =
                  inv.splitCount && inv.splitCount > 1
                    ? ` · ${toPersianDigits(inv.splitIndex || 0)}/${toPersianDigits(inv.splitCount)}`
                    : "";
                return (
                  <tr
                    key={inv.id}
                    className={`invoices-tr invoices-tr--${st}`}
                    data-status={st}
                    style={{
                      ["--inv-i" as string]: String(Math.min(index, 14)),
                    }}
                  >
                    <td className="cp-num">
                      {toPersianDigits(invoiceNumber(inv))}
                    </td>
                    <td className="cp-num">
                      {toPersianDigits(String(inv.table || "—"))}
                    </td>
                    <td className="cp-num">{formatOrderTime(inv.createdAt)}</td>
                    <td>
                      {(inv.customerName || "—") + splitLabel}
                    </td>
                    <td className="cp-num invoices-td-amount">
                      {formatPriceAsNumber(inv.total || 0)}
                    </td>
                    <td>
                      {PAY_METHOD_LABEL[inv.payMethod || ""] || "—"}
                    </td>
                    <td>
                      <span className={`invoices-badge invoices-badge--${st}`}>
                        <span className="invoices-badge-dot" aria-hidden="true" />
                        {INVOICE_STATUS_LABEL[st] || st}
                      </span>
                    </td>
                    <td>
                      <div className="invoices-table-actions">
                        <button
                          type="button"
                          className="invoices-table-btn"
                          onClick={() => setDetail(inv)}
                        >
                          جزئیات
                        </button>
                        <button
                          type="button"
                          className="invoices-table-btn"
                          disabled={st === "cancelled"}
                          onClick={() => setEditInv(inv)}
                        >
                          ویرایش
                        </button>
                        <button
                          type="button"
                          className="invoices-table-btn"
                          onClick={() => {
                            if (!printInvoice(inv)) {
                              showToast("چاپ مرورگر در دسترس نیست");
                            }
                          }}
                        >
                          چاپ
                        </button>
                        <button
                          type="button"
                          className="invoices-table-btn"
                          onClick={() => printThermal(inv)}
                        >
                          حرارتی
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && typeof document !== "undefined"
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="جزئیات فاکتور"
              onClick={() => setDetail(null)}
            >
              <div
                className="table-glass-dialog menu-glass-dialog invoice-glass-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 className="table-glass-title">
                      فاکتور #
                      {toPersianDigits(invoiceNumber(detail))}
                    </h4>
                    <p className="table-glass-sub">
                      میز {toPersianDigits(String(detail.table || "—"))} ·{" "}
                      {formatOrderTime(detail.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    onClick={() => setDetail(null)}
                  >
                    ×
                  </button>
                </header>

                <div className="invoice-glass-status-row">
                  <span
                    className={`invoices-badge invoices-badge--${detail.status || "unpaid"}`}
                  >
                    {INVOICE_STATUS_LABEL[detail.status || "unpaid"] ||
                      detail.status}
                  </span>
                  <span className="invoice-glass-pay-chip">
                    {PAY_METHOD_LABEL[detail.payMethod || ""] || "بدون پرداخت"}
                  </span>
                </div>

                {(detail.customerName || detail.customerPhone) && (
                  <p className="invoice-glass-customer">
                    {[detail.customerName, detail.customerPhone]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}

                {detail.items?.length ? (
                  <section className="menu-glass-section invoice-glass-items">
                    <span className="table-glass-label">آیتم‌ها</span>
                    <div className="table-glass-card">
                      <ul className="table-glass-list">
                        {detail.items.map((it, idx) => (
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
                    {typeof detail.subtotal === "number" ? (
                      <div className="table-glass-receipt-line">
                        <span>جمع جزء</span>
                        <strong className="cp-num">
                          {formatPriceAsNumber(detail.subtotal)}
                        </strong>
                      </div>
                    ) : null}
                    {(detail.discountAmount || 0) > 0 ? (
                      <div className="table-glass-receipt-line is-discount">
                        <span>تخفیف</span>
                        <strong className="cp-num">
                          −{formatPriceAsNumber(detail.discountAmount || 0)}
                        </strong>
                      </div>
                    ) : null}
                    {(detail.tax || 0) > 0 ? (
                      <div className="table-glass-receipt-line">
                        <span>مالیات</span>
                        <strong className="cp-num">
                          +{formatPriceAsNumber(detail.tax || 0)}
                        </strong>
                      </div>
                    ) : null}
                    <div className="table-glass-receipt-total">
                      <span>مبلغ نهایی</span>
                      <strong className="cp-num">
                        {formatPriceAsNumber(detail.total || 0)}
                      </strong>
                    </div>
                  </div>
                </section>

                {detail.payments?.length ? (
                  <section className="menu-glass-section invoice-glass-payments">
                    <span className="table-glass-label">پرداخت‌ها</span>
                    <div className="table-glass-card">
                      <ul className="table-glass-list">
                        {detail.payments.map((p, idx) => (
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
                  {(detail.status || "") === "unpaid" ? (
                    <button
                      type="button"
                      className={`orders-primary-btn is-invoice${
                        busyId === detail.id ? " is-loading" : ""
                      }`}
                      disabled={busyId === detail.id}
                      onClick={() => markPaid(undefined, detail)}
                    >
                      {busyId === detail.id ? "در حال ثبت…" : "پرداخت شد"}
                    </button>
                  ) : null}
                  {(detail.status || "") !== "cancelled" ? (
                    <button
                      type="button"
                      className="orders-primary-btn"
                      onClick={() => {
                        setEditInv(detail);
                        setDetail(null);
                      }}
                    >
                      ویرایش فاکتور
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="orders-primary-btn"
                    onClick={() => {
                      if (!printInvoice(detail)) {
                        showToast("چاپ مرورگر در دسترس نیست");
                      }
                    }}
                  >
                    چاپ فاکتور
                  </button>
                  <button
                    type="button"
                    className="orders-primary-btn"
                    onClick={() => printThermal(detail)}
                  >
                    چاپ حرارتی
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    onClick={() => setDetail(null)}
                  >
                    بستن
                  </button>
                </footer>
              </div>
            </div>,
            document.body
          )
        : null}

      {editInv && typeof document !== "undefined"
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="invoice-edit-title"
              onClick={() => !editBusy && setEditInv(null)}
            >
              <div
                className="table-glass-dialog menu-glass-dialog invoice-glass-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 id="invoice-edit-title" className="table-glass-title">
                      ویرایش فاکتور #
                      {toPersianDigits(invoiceNumber(editInv))}
                    </h4>
                    <p className="table-glass-sub">
                      میز {toPersianDigits(String(editInv.table || "—"))} ·{" "}
                      {formatPriceAsNumber(editInv.total || 0)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    disabled={editBusy}
                    onClick={() => setEditInv(null)}
                  >
                    ×
                  </button>
                </header>

                <section className="menu-glass-section">
                  <span className="table-glass-label">
                    نام مشتری{editUnpaid ? " *" : ""}
                  </span>
                  <input
                    className={`checkout-input${editUnpaid && !draftName.trim() ? " is-invalid" : ""}`}
                    value={draftName}
                    disabled={editBusy}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder={editUnpaid ? "الزامی برای فاکتور بدهکار" : "اختیاری"}
                    required={editUnpaid}
                    aria-required={editUnpaid || undefined}
                  />
                </section>

                <section className="menu-glass-section">
                  <span className="table-glass-label">موبایل</span>
                  <input
                    className="checkout-input"
                    value={draftPhone}
                    disabled={editBusy}
                    onChange={(e) => setDraftPhone(e.target.value)}
                    placeholder="اختیاری"
                    inputMode="tel"
                  />
                </section>

                {editUnpaid ? (
                  <section className="menu-glass-section">
                    <span className="table-glass-label">تخفیف</span>
                    <div className="invoice-edit-discount">
                      <CpSelect
                        value={draftDiscountType}
                        disabled={editBusy}
                        options={
                          [
                            ["", "بدون تخفیف"],
                            ["percent", "درصدی"],
                            ["fixed", "مبلغ ثابت"],
                          ] as const
                        }
                        onChange={(v) =>
                          setDraftDiscountType(v as "" | "percent" | "fixed")
                        }
                      />
                      <input
                        className="checkout-input"
                        type="number"
                        min={0}
                        value={draftDiscountValue}
                        disabled={editBusy || !draftDiscountType}
                        onChange={(e) => setDraftDiscountValue(e.target.value)}
                        placeholder={
                          draftDiscountType === "percent" ? "مثلاً ۱۰" : "مبلغ"
                        }
                      />
                    </div>
                  </section>
                ) : null}

                {editUnpaid ? (
                  <section className="menu-glass-section">
                    <span className="table-glass-label">ثبت پرداخت</span>
                    <div className="invoice-edit-pay">
                      <CpSelect
                        value={draftPayMethod}
                        disabled={editBusy}
                        options={
                          [
                            ["cash", "نقدی"],
                            ["card", "کارت"],
                            ["online", "آنلاین"],
                          ] as const
                        }
                        onChange={(v) =>
                          setDraftPayMethod(v as "cash" | "card" | "online")
                        }
                      />
                      <button
                        type="button"
                        className="orders-primary-btn is-invoice"
                        disabled={editBusy}
                        onClick={() => markPaid()}
                      >
                        {draftPayMethod === "card" && defaultTerminal(payTerminals)
                          ? "پرداخت با کارت"
                          : "ثبت پرداخت کامل"}
                      </button>
                    </div>
                  </section>
                ) : null}

                <footer className="menu-glass-actions">
                  <button
                    type="button"
                    className={`orders-primary-btn${editBusy ? " is-loading" : ""}`}
                    disabled={editBusy || (editUnpaid && !draftName.trim())}
                    onClick={saveEdit}
                  >
                    {editBusy ? "در حال ذخیره…" : "ذخیره تغییرات"}
                  </button>
                  {(editInv.status || "") !== "cancelled" ? (
                    <button
                      type="button"
                      className="orders-primary-btn is-danger"
                      disabled={editBusy}
                      onClick={cancelInvoice}
                    >
                      لغو فاکتور
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    disabled={editBusy}
                    onClick={() => setEditInv(null)}
                  >
                    انصراف
                  </button>
                </footer>
              </div>
            </div>,
            document.body
          )
        : null}
      <CardPaymentModal
        open={cardPayOpen && !!editInv}
        amount={Math.round(Number(editInv?.total) || 0)}
        invoiceId={editInv?.id || ""}
        terminalId={defaultTerminal(payTerminals)?.id}
        onClose={() => setCardPayOpen(false)}
        onChangeMethod={() => setCardPayOpen(false)}
        onSuccess={({ payment, result }) => {
          setCardPayOpen(false);
          void markPaid([
            {
              method: "card",
              amount: Math.round(Number(editInv?.total) || 0),
              paymentId: payment.id,
              referenceNumber:
                result.referenceNumber || payment.referenceNumber || undefined,
              terminalId: payment.terminalId,
              providerTransactionId:
                result.providerTransactionId ||
                payment.providerTransactionId ||
                undefined,
            },
          ]);
        }}
      />
      </>
      ) : null}
    </div>
  );
}
