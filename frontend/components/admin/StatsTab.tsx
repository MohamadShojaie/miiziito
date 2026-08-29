"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiJson, cashierHeaders } from "@/lib/api";
import {
  formatOrderTime,
  formatPriceAsNumber,
  toPersianDigits,
} from "@/lib/format";
import { formatJalaliIso, toIsoDate } from "@/lib/jalali";
import { LoadingShimmer } from "@/components/admin/LoadingShimmer";
import { useToast } from "@/components/ToastProvider";
import {
  INVOICE_STATUS_LABEL,
  PAY_METHOD_LABEL,
  type Invoice,
  type TablesPayload,
} from "@/lib/types";

type Stats = {
  todaySales?: number;
  weekSales?: number;
  monthSales?: number;
  todayCount?: number;
  invoiceCount?: number;
  averageTotal?: number;
  unpaidCount?: number;
  unpaidTotal?: number;
  cashSales?: number;
  cardSales?: number;
  onlineSales?: number;
  discountTotal?: number;
  refundTotal?: number;
  peakHour?: number | null;
  topItems?: Array<{ name: string; count: number }>;
  hours?: Record<string | number, number> | number[];
};

function normalizeHours(raw: Stats["hours"]): number[] {
  const out = Array.from({ length: 24 }, () => 0);
  if (!raw) return out;
  if (Array.isArray(raw)) {
    raw.forEach((v, i) => {
      if (i >= 0 && i < 24) out[i] = Number(v) || 0;
    });
    return out;
  }
  Object.entries(raw).forEach(([k, v]) => {
    const h = Number(k);
    if (h >= 0 && h < 24) out[h] = Number(v) || 0;
  });
  return out;
}

function HourChart({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  const busyHours = hours
    .map((v, i) => ({ i, v }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);

  return (
    <div className="stats-chart">
      <div className="stats-chart-head">
        <h4>نمودار شلوغی ساعتی</h4>
        <p>تعداد فاکتورهای پرداخت‌شده در هر ساعت روز</p>
      </div>
      <div className="stats-hour-bars" role="img" aria-label="نمودار ساعتی">
        {hours.map((v, i) => (
          <div key={i} className="stats-hour-col">
            <span
              className={`stats-hour-bar${v === max && v > 0 ? " is-peak" : ""}`}
              style={{ height: `${Math.max(v > 0 ? 8 : 3, (v / max) * 100)}%` }}
              title={`${toPersianDigits(i)}:۰۰ — ${toPersianDigits(v)} فاکتور`}
            />
          </div>
        ))}
      </div>
      <div className="stats-hour-labels">
        <span>{toPersianDigits(0)}</span>
        <span>{toPersianDigits(6)}</span>
        <span>{toPersianDigits(12)}</span>
        <span>{toPersianDigits(18)}</span>
        <span>{toPersianDigits(23)}</span>
      </div>
      {busyHours.length ? (
        <p className="stats-hour-note">
          پرترافیک‌ترین:{" "}
          {busyHours
            .map((h) => `${toPersianDigits(h.i)}:۰۰ (${toPersianDigits(h.v)})`)
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function PayChart({
  cash,
  card,
  online,
}: {
  cash: number;
  card: number;
  online: number;
}) {
  const total = Math.max(0, cash + card + online);
  const rows = [
    { key: "cash", label: "نقدی", value: cash, tone: "cash" },
    { key: "card", label: "کارت", value: card, tone: "card" },
    { key: "online", label: "آنلاین", value: online, tone: "online" },
  ];
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="stats-chart">
      <div className="stats-chart-head">
        <h4>روش‌های پرداخت</h4>
        <p>سهم مبلغ پرداخت‌شده از هر روش</p>
      </div>
      <div className="stats-pay">
        <svg className="stats-donut" viewBox="0 0 120 120" aria-hidden="true">
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="color-mix(in srgb, var(--text) 12%, transparent)"
            strokeWidth="14"
          />
          {total > 0
            ? rows.map((row) => {
                const len = (row.value / total) * c;
                const el = (
                  <circle
                    key={row.key}
                    className={`stats-donut-seg is-${row.tone}`}
                    cx="60"
                    cy="60"
                    r={r}
                    fill="none"
                    strokeWidth="14"
                    strokeDasharray={`${len} ${c - len}`}
                    strokeDashoffset={-offset}
                    transform="rotate(-90 60 60)"
                  />
                );
                offset += len;
                return el;
              })
            : null}
          <text
            x="60"
            y="56"
            textAnchor="middle"
            className="stats-donut-label"
          >
            جمع
          </text>
          <text
            x="60"
            y="72"
            textAnchor="middle"
            className="stats-donut-value"
          >
            {total ? formatPriceAsNumber(total) : "—"}
          </text>
        </svg>
        <ul className="stats-pay-legend">
          {rows.map((row) => {
            const pct = total ? Math.round((row.value / total) * 100) : 0;
            return (
              <li key={row.key}>
                <span className={`stats-pay-dot is-${row.tone}`} />
                <div>
                  <strong>{row.label}</strong>
                  <span>
                    {formatPriceAsNumber(row.value)} ·{" "}
                    {toPersianDigits(pct)}٪
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function TopItemsChart({
  items,
}: {
  items: Array<{ name: string; count: number }>;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="stats-chart stats-chart--wide">
      <div className="stats-chart-head">
        <h4>پرفروش‌ترین آیتم‌ها</h4>
        <p>بر اساس تعداد فروش در فاکتورهای پرداخت‌شده</p>
      </div>
      {items.length ? (
        <ul className="stats-top-list">
          {items.map((item, idx) => (
            <li key={item.name}>
              <div className="stats-top-meta">
                <span className="stats-top-rank">
                  {toPersianDigits(idx + 1)}
                </span>
                <strong>{item.name}</strong>
                <span className="cp-num">
                  {toPersianDigits(item.count)} فروش
                </span>
              </div>
              <div className="stats-top-track">
                <span
                  className="stats-top-fill"
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="stats-empty">هنوز دادهٔ فروشی ثبت نشده است.</p>
      )}
    </div>
  );
}

function invoiceNumber(inv: Invoice) {
  return String(inv.number || inv.id.slice(-4));
}

type DebtorInvoice = {
  id: string;
  number: string;
  table: string;
  total: number;
  createdAt?: number;
};

type Debtor = {
  key: string;
  name: string;
  phone: string;
  total: number;
  invoices: DebtorInvoice[];
};

function debtorKey(inv: Invoice) {
  const phone = String(inv.customerPhone || "").trim();
  const name = String(inv.customerName || "").trim();
  if (phone) return `p:${phone}`;
  if (name) return `n:${name}`;
  return `inv:${inv.id}`;
}

function buildDebtors(invoices: Invoice[]): Debtor[] {
  const map = new Map<string, Debtor>();
  invoices.forEach((inv) => {
    if ((inv.status || "unpaid") !== "unpaid") return;
    const key = debtorKey(inv);
    const name = String(inv.customerName || "").trim() || "بدون نام";
    const phone = String(inv.customerPhone || "").trim();
    const total = Math.max(0, Number(inv.total) || 0);
    const entry = map.get(key) || {
      key,
      name,
      phone,
      total: 0,
      invoices: [],
    };
    if (name !== "بدون نام") entry.name = name;
    if (phone) entry.phone = phone;
    entry.total += total;
    entry.invoices.push({
      id: inv.id,
      number: invoiceNumber(inv),
      table: String(inv.table || "—"),
      total,
      createdAt: inv.createdAt,
    });
    map.set(key, entry);
  });
  return [...map.values()]
    .map((d) => ({
      ...d,
      invoices: d.invoices.sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
      ),
    }))
    .sort((a, b) => b.total - a.total);
}

function invoiceWhen(ts?: number) {
  if (!ts) return "—";
  return `${formatJalaliIso(toIsoDate(ts), true)} · ${formatOrderTime(ts)}`;
}

export function StatsTab({
  active,
  invoices = [],
  onPatched,
}: {
  active: boolean;
  invoices?: Invoice[];
  onPatched?: (data: TablesPayload) => void;
}) {
  const { showToast } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [debtorQuery, setDebtorQuery] = useState("");
  const [debtorsOpen, setDebtorsOpen] = useState(false);
  const [selectedDebtorKey, setSelectedDebtorKey] = useState<string | null>(
    null
  );
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    apiJson<{ stats?: Stats }>("/api/stats", { headers: cashierHeaders() })
      .then((data) => {
        if (!cancelled) setStats(data.stats || {});
      })
      .catch(() => {
        if (!cancelled) setError("بارگذاری آمار ناموفق بود");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!debtorsOpen && !detailInvoice) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (detailInvoice) {
        setDetailInvoice(null);
        return;
      }
      if (selectedDebtorKey) {
        setSelectedDebtorKey(null);
        return;
      }
      setDebtorsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [debtorsOpen, detailInvoice, selectedDebtorKey]);

  const hours = useMemo(
    () => normalizeHours(stats?.hours),
    [stats?.hours]
  );

  const debtors = useMemo(() => buildDebtors(invoices), [invoices]);
  const visibleDebtors = useMemo(() => {
    const needle = debtorQuery.trim().toLowerCase();
    if (!needle) return debtors;
    return debtors.filter((d) => {
      const hay = [
        d.name,
        d.phone,
        ...d.invoices.map((inv) => `${inv.number} ${inv.table}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [debtors, debtorQuery]);

  const selectedDebtor =
    debtors.find((d) => d.key === selectedDebtorKey) || null;

  useEffect(() => {
    if (!selectedDebtorKey) return;
    if (!debtors.some((d) => d.key === selectedDebtorKey)) {
      setSelectedDebtorKey(null);
    }
  }, [debtors, selectedDebtorKey]);

  function openDebtorsDialog() {
    setSelectedDebtorKey(null);
    setDebtorQuery("");
    setDebtorsOpen(true);
  }

  function closeDebtorsDialog() {
    setDebtorsOpen(false);
    setSelectedDebtorKey(null);
  }

  function openInvoiceDetail(id: string) {
    const inv = invoices.find((i) => i.id === id) || null;
    if (inv) setDetailInvoice(inv);
  }

  async function markDetailPaid() {
    if (!detailInvoice || payBusy) return;
    if ((detailInvoice.status || "") !== "unpaid") return;
    const total = Math.round(Number(detailInvoice.total) || 0);
    if (total <= 0) {
      showToast("مبلغ فاکتور نامعتبر است");
      return;
    }
    setPayBusy(true);
    try {
      const data = await apiJson<TablesPayload>(
        `/api/invoices/${detailInvoice.id}`,
        {
          method: "POST",
          headers: cashierHeaders(),
          body: JSON.stringify({
            action: "pay",
            payments: [{ method: "cash", amount: total }],
          }),
        }
      );
      onPatched?.(data);
      if (data.invoice) {
        setDetailInvoice(data.invoice);
      } else {
        setDetailInvoice((prev) =>
          prev
            ? {
                ...prev,
                status: "paid",
                payMethod: "cash",
                payments: [{ method: "cash", amount: total }],
              }
            : prev
        );
      }
      showToast("پرداخت ثبت شد");
      apiJson<{ stats?: Stats }>("/api/stats", {
        headers: cashierHeaders(),
      })
        .then((res) => setStats(res.stats || {}))
        .catch(() => {});
    } catch (err) {
      const code =
        err instanceof Error && err.message ? err.message : "request_failed";
      const hints: Record<string, string> = {
        payment_mismatch: "مبلغ پرداخت با فاکتور هم‌خوانی ندارد",
        invoice_cancelled: "فاکتور لغو شده است",
      };
      showToast(hints[code] || "ثبت پرداخت ناموفق بود");
    } finally {
      setPayBusy(false);
    }
  }

  if (error) {
    return (
      <div className="admin-tab admin-tab--stats stats-page">
        <p className="stats-error">{error}</p>
      </div>
    );
  }

  if (loading || !stats) {
    return (
      <div className="admin-tab admin-tab--stats stats-page">
        <header className="stats-header">
          <h3 className="stats-title">آمار فروش</h3>
        </header>
        <LoadingShimmer variant="stats" />
      </div>
    );
  }

  const peak = stats.peakHour ?? 0;
  const payTotal =
    (stats.cashSales || 0) + (stats.cardSales || 0) + (stats.onlineSales || 0);
  const unpaidPeople = debtors.length || stats.unpaidCount || 0;

  function refreshStats() {
    setLoading(true);
    apiJson<{ stats?: Stats }>("/api/stats", {
      headers: cashierHeaders(),
    })
      .then((data) => setStats(data.stats || {}))
      .catch(() => setError("بارگذاری آمار ناموفق بود"))
      .finally(() => setLoading(false));
  }

  return (
    <div className="admin-tab admin-tab--stats stats-page">
      <header className="stats-header">
        <div className="stats-header-text">
          <h3 className="stats-title">آمار فروش</h3>
          <p className="stats-subtitle">
            خلاصهٔ عملکرد کافه بر اساس فاکتورهای ثبت‌شده
          </p>
        </div>
        <button
          type="button"
          className="cp-btn cp-btn--ghost stats-refresh"
          onClick={refreshStats}
        >
          به‌روزرسانی
        </button>
      </header>

      <section className="stats-hero" aria-label="فروش امروز">
        <div className="stats-hero-main">
          <span className="stats-hero-label">فروش امروز</span>
          <strong className="stats-hero-value cp-num">
            {formatPriceAsNumber(stats.todaySales || 0)}
          </strong>
          <em className="stats-hero-note">
            {toPersianDigits(stats.todayCount || 0)} فاکتور امروز
          </em>
        </div>
        <ul className="stats-hero-side">
          <li>
            <span>این هفته</span>
            <strong className="cp-num">
              {formatPriceAsNumber(stats.weekSales || 0)}
            </strong>
          </li>
          <li>
            <span>این ماه</span>
            <strong className="cp-num">
              {formatPriceAsNumber(stats.monthSales || 0)}
            </strong>
          </li>
          <li>
            <span>میانگین فاکتور</span>
            <strong className="cp-num">
              {formatPriceAsNumber(stats.averageTotal || 0)}
            </strong>
          </li>
        </ul>
      </section>

      <section className="stats-glance" aria-label="شاخص‌های جانبی">
        <button
          type="button"
          className="stats-glance-debtors"
          onClick={openDebtorsDialog}
        >
          <div className="stats-glance-debtors-copy">
            <span className="stats-glance-label">بدهکارها</span>
            <strong className="stats-glance-debtors-value cp-num">
              {formatPriceAsNumber(stats.unpaidTotal || 0)}
            </strong>
            <em className="stats-glance-meta">
              {toPersianDigits(unpaidPeople)} نفر ·{" "}
              {toPersianDigits(stats.unpaidCount || 0)} فاکتور پرداخت‌نشده
            </em>
          </div>
          <span className="stats-glance-action">مشاهده فهرست</span>
        </button>

        <ul className="stats-glance-metrics">
          <li>
            <span className="stats-glance-label">جمع پرداخت‌ها</span>
            <strong className="stats-glance-value cp-num">
              {formatPriceAsNumber(payTotal)}
            </strong>
          </li>
          <li>
            <span className="stats-glance-label">تخفیف‌ها</span>
            <strong className="stats-glance-value cp-num">
              {formatPriceAsNumber(stats.discountTotal || 0)}
            </strong>
          </li>
          <li>
            <span className="stats-glance-label">ساعت شلوغ</span>
            <strong className="stats-glance-value">
              {toPersianDigits(String(peak).padStart(2, "0"))}:
              {toPersianDigits("00")}
            </strong>
          </li>
        </ul>
      </section>

      <section className="stats-debtors-entry" id="stats-debtors">
        <div className="stats-chart-head">
          <h4>بدهکارها</h4>
          <p>فهرست مشتریان با فاکتور پرداخت‌نشده را در پنجره شیشه‌ای ببینید</p>
        </div>
        <button
          type="button"
          className="orders-primary-btn stats-debtors-open-btn"
          onClick={openDebtorsDialog}
          disabled={!debtors.length}
        >
          {debtors.length
            ? `مشاهده ${toPersianDigits(debtors.length)} بدهکار`
            : "بدهکاری ثبت نشده"}
        </button>
      </section>

      <section className="stats-charts">
        <HourChart hours={hours} />
        <PayChart
          cash={stats.cashSales || 0}
          card={stats.cardSales || 0}
          online={stats.onlineSales || 0}
        />
        <TopItemsChart items={stats.topItems || []} />
      </section>

      {debtorsOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="بدهکارها"
              onClick={closeDebtorsDialog}
            >
              <div
                className="table-glass-dialog menu-glass-dialog stats-debtors-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    {selectedDebtor ? (
                      <>
                        <button
                          type="button"
                          className="stats-debtors-back"
                          onClick={() => setSelectedDebtorKey(null)}
                        >
                          ← بازگشت به فهرست
                        </button>
                        <h4 className="table-glass-title">
                          {selectedDebtor.name}
                        </h4>
                        <p className="table-glass-sub">
                          {selectedDebtor.phone ? (
                            <span dir="ltr">{selectedDebtor.phone}</span>
                          ) : (
                            "بدون موبایل"
                          )}
                          {" · "}
                          {toPersianDigits(selectedDebtor.invoices.length)}{" "}
                          فاکتور ·{" "}
                          <span className="cp-num">
                            {formatPriceAsNumber(selectedDebtor.total)}
                          </span>
                        </p>
                      </>
                    ) : (
                      <>
                        <h4 className="table-glass-title">بدهکارها</h4>
                        <p className="table-glass-sub">
                          روی هر نفر بزنید تا فاکتورهای پرداخت‌نشده را ببینید
                        </p>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    onClick={closeDebtorsDialog}
                  >
                    ×
                  </button>
                </header>

                {!selectedDebtor ? (
                  <>
                    <div className="stats-debtors-toolbar">
                      <input
                        type="search"
                        className="stats-debtors-search"
                        placeholder="جستجوی نام، موبایل یا شماره فاکتور…"
                        value={debtorQuery}
                        onChange={(e) => setDebtorQuery(e.target.value)}
                      />
                      <span className="stats-debtors-sum cp-num">
                        {formatPriceAsNumber(
                          visibleDebtors.reduce((s, d) => s + d.total, 0)
                        )}
                      </span>
                    </div>
                    {visibleDebtors.length ? (
                      <ul className="stats-debtor-list">
                        {visibleDebtors.map((d) => (
                          <li key={d.key} className="stats-debtor">
                            <button
                              type="button"
                              className="stats-debtor-head"
                              onClick={() => setSelectedDebtorKey(d.key)}
                            >
                              <span className="stats-debtor-who">
                                <strong>{d.name}</strong>
                                {d.phone ? (
                                  <em dir="ltr">{d.phone}</em>
                                ) : null}
                              </span>
                              <span className="stats-debtor-amt">
                                <strong className="cp-num">
                                  {formatPriceAsNumber(d.total)}
                                </strong>
                                <em>
                                  {toPersianDigits(d.invoices.length)} فاکتور
                                </em>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="stats-empty">
                        بدهکاری با این جستجو پیدا نشد.
                      </p>
                    )}
                  </>
                ) : (
                  <ul className="stats-debtor-invoices stats-debtor-invoices--dialog">
                    {selectedDebtor.invoices.map((inv) => (
                      <li key={inv.id}>
                        <button
                          type="button"
                          className="stats-debtor-invoice-btn"
                          onClick={() => openInvoiceDetail(inv.id)}
                        >
                          <span>
                            <strong>
                              فاکتور {toPersianDigits(inv.number)}
                            </strong>
                            <small>
                              میز {toPersianDigits(inv.table)} ·{" "}
                              {invoiceWhen(inv.createdAt)}
                            </small>
                          </span>
                          <strong className="cp-num">
                            {formatPriceAsNumber(inv.total)}
                          </strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>,
            document.body
          )
        : null}

      {detailInvoice && typeof document !== "undefined"
        ? createPortal(
            <div
              className="table-glass-overlay stats-invoice-overlay"
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

                {(detailInvoice.customerName ||
                  detailInvoice.customerPhone) && (
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
                      <span>مبلغ قابل پرداخت</span>
                      <strong className="cp-num">
                        {formatPriceAsNumber(detailInvoice.total || 0)}
                      </strong>
                    </div>
                  </div>
                </section>

                <footer className="menu-glass-actions">
                  {(detailInvoice.status || "") === "unpaid" ? (
                    <button
                      type="button"
                      className={`orders-primary-btn is-invoice${
                        payBusy ? " is-loading" : ""
                      }`}
                      disabled={payBusy}
                      onClick={() => void markDetailPaid()}
                    >
                      {payBusy ? "در حال ثبت…" : "پرداخت شد"}
                    </button>
                  ) : null}
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
    </div>
  );
}
