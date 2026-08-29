"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { apiJson, cashierHeaders } from "@/lib/api";
import { DEFAULT_CAFE_NAME_FA } from "@/lib/brand";
import type { Invoice, Order, TableRegion } from "@/lib/types";
import {
  normalizeStatus,
  formatOrderTime,
  formatPriceAsNumber,
  toPersianDigits,
  parsePrice,
} from "@/lib/format";
import { ORDER_STATUS_LABEL, tablesFromRegions } from "@/lib/types";
import { useToast } from "@/components/ToastProvider";
import {
  InvoiceCheckoutModal,
  type CheckoutPayload,
} from "@/components/admin/InvoiceCheckoutModal";
import { SplitInvoicesResultModal } from "@/components/admin/SplitInvoicesResultModal";
import { PreparePrintDialog } from "@/components/admin/PreparePrintDialog";
import { LoadingShimmer } from "@/components/admin/LoadingShimmer";
import { printHtmlDocument } from "@/lib/printer";
import { CustomerOrderCard } from "@/components/admin/CustomerOrderCard";
import {
  CustomerPicker,
  type CustomerPick,
} from "@/components/admin/CustomerPicker";
import {
  buildCrmProfiles,
  findCustomerForOrder,
} from "@/lib/crm";
import type { Customer } from "@/lib/types";

function nextAction(order: Order): {
  status?: string;
  action?: "invoice";
  label: string;
} | null {
  const st = normalizeStatus(order.status);
  if (order.type === "waiter") {
    if (st === "waiting") return { status: "delivered", label: "انجام شد" };
    return null;
  }
  if (st === "waiting") return { status: "preparing", label: "شروع آماده‌سازی" };
  if (st === "preparing") return { status: "ready", label: "آماده شد" };
  if (st === "ready" || st === "delivered") {
    return { action: "invoice", label: "ثبت فاکتور" };
  }
  return null;
}

function isOperational(order: Order) {
  const st = normalizeStatus(order.status);
  if (st === "cancelled" || st === "invoiced") return false;
  if (order.type === "waiter" && st === "delivered") return false;
  return true;
}

function statusLabel(order: Order, st: string) {
  if (order.type === "waiter") {
    return st === "delivered" ? "انجام شد" : "در انتظار گارسون";
  }
  if (st === "delivered") return ORDER_STATUS_LABEL.ready;
  return ORDER_STATUS_LABEL[st] || st;
}

const FILTERS = [
  ["all", "همه"],
  ["waiting", "جدید"],
  ["preparing", "آماده‌سازی"],
  ["ready", "آماده"],
] as const;

const STATUS_OPTIONS = [
  ["waiting", "جدید"],
  ["preparing", "آماده‌سازی"],
  ["ready", "آماده"],
] as const;

const WAITER_STATUS_OPTIONS = [
  ["waiting", "در انتظار گارسون"],
  ["delivered", "انجام شد"],
] as const;

function runOrdersMotion(update: () => void) {
  if (typeof document === "undefined") {
    update();
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished?: Promise<unknown> };
  };
  if (reduce || typeof doc.startViewTransition !== "function") {
    update();
    return;
  }
  doc.startViewTransition(update);
}

function printOrderTicket(order: Order) {
  const st = normalizeStatus(order.status);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const itemsHtml = (order.items || [])
    .map(
      (item) =>
        `<tr><td>${item.name}</td><td>${toPersianDigits(item.count || 1)}</td><td>${formatPriceAsNumber(parsePrice(item.price))}</td></tr>`
    )
    .join("");
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"/><title>تیکت سفارش</title>
<style>
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
  body{font-family:"Vazir",Tahoma,sans-serif;padding:16px;color:#111;line-height:1.65;font-size:13px;-webkit-font-smoothing:antialiased}
  h1{font-size:18px;margin:0 0 8px;font-weight:700}
  .meta{font-size:13px;margin-bottom:12px;color:#333;font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td,th{padding:6px 4px;border-bottom:1px solid #ddd;text-align:right}
  th{font-weight:700}
  .total{margin-top:12px;font-size:15px;font-weight:700}
</style></head><body>
<h1>${DEFAULT_CAFE_NAME_FA} — تیکت سفارش</h1>
<div class="meta">میز ${toPersianDigits(String(order.table))} · ${formatOrderTime(order.createdAt)} · ${ORDER_STATUS_LABEL[st] || st}</div>
<table><thead><tr><th>آیتم</th><th>تعداد</th><th>قیمت</th></tr></thead><tbody>${itemsHtml || "<tr><td colspan='3'>—</td></tr>"}</tbody></table>
<div class="total">مجموع: ${formatPriceAsNumber(order.total || 0)}</div>
</body></html>`;
  return printHtmlDocument(html);
}

function OrderActionDialog({
  title,
  sub,
  labelledBy,
  onClose,
  children,
}: {
  title: string;
  sub?: string;
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="table-glass-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={onClose}
    >
      <div
        className="table-glass-dialog menu-glass-dialog invoice-glass-dialog order-action-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="table-glass-head">
          <div>
            <h4 id={labelledBy} className="table-glass-title">
              {title}
            </h4>
            {sub ? <p className="table-glass-sub">{sub}</p> : null}
          </div>
          <button
            type="button"
            className="table-glass-close"
            aria-label="بستن"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function OrdersTab({
  orders,
  invoices = [],
  tables = {},
  regions,
  loading = false,
  focusOrderId,
  onFocusOrderConsumed,
  onOpenCustomer,
  onPatched,
  onCompose,
  onGoInvoices,
}: {
  orders: Order[];
  invoices?: Invoice[];
  tables?: Record<string, string>;
  regions?: TableRegion[];
  loading?: boolean;
  focusOrderId?: string | null;
  onFocusOrderConsumed?: () => void;
  onOpenCustomer?: (customerId: string) => void;
  onPatched: (data: { orders?: Order[]; invoices?: unknown }) => void;
  onCompose: (order?: Order) => void;
  onGoInvoices?: () => void;
}) {
  const { showToast } = useToast();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [checkoutOrder, setCheckoutOrder] = useState<Order | null>(null);
  const [prepareOrder, setPrepareOrder] = useState<Order | null>(null);
  const [splitResult, setSplitResult] = useState<Invoice[]>([]);
  const [statusOrder, setStatusOrder] = useState<Order | null>(null);
  const [tableOrder, setTableOrder] = useState<Order | null>(null);
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pickingCustomer, setPickingCustomer] = useState(false);

  const allTables = useMemo(() => tablesFromRegions(regions), [regions]);

  useEffect(() => {
    apiJson<{ customers?: Customer[] }>("/api/customers", {
      headers: cashierHeaders(),
    })
      .then((data) =>
        setCustomers(Array.isArray(data.customers) ? data.customers : [])
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!menuFor) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".orders-more")) return;
      setMenuFor(null);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuFor]);

  useEffect(() => {
    if (!detailOrder) return;
    const next = orders.find((o) => o.id === detailOrder.id);
    if (next && next !== detailOrder) setDetailOrder(next);
  }, [orders, detailOrder]);

  useEffect(() => {
    if (!focusOrderId) return;
    const hit =
      orders.find((o) => o.id === focusOrderId) ||
      null;
    if (hit) {
      setDetailOrder(hit);
      setFilter("all");
    }
    onFocusOrderConsumed?.();
  }, [focusOrderId, orders, onFocusOrderConsumed]);

  const crmProfiles = useMemo(
    () => buildCrmProfiles(customers, invoices, orders),
    [customers, invoices, orders]
  );

  const detailCustomer = useMemo(() => {
    if (!detailOrder) return null;
    return findCustomerForOrder(customers, detailOrder, invoices);
  }, [customers, detailOrder, invoices]);

  const detailProfile = useMemo(() => {
    if (!detailCustomer) return null;
    return crmProfiles.find((p) => p.id === detailCustomer.id) || null;
  }, [crmProfiles, detailCustomer]);

  async function setOrderCustomer(
    order: Order,
    pick: CustomerPick | null
  ) {
    setBusyId(order.id);
    try {
      const data = await apiJson<{
        orders?: Order[];
        order?: Order;
      }>(`/api/orders/${order.id}`, {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify(
          pick
            ? {
                action: "customer",
                customerId: pick.id,
                customerName: pick.name,
                customerPhone: pick.phone || "",
              }
            : { action: "customer", customerId: "", clear: true }
        ),
      });
      onPatched(data);
      setPickingCustomer(false);
      showToast(pick ? "مشتری به سفارش متصل شد" : "مشتری از سفارش حذف شد");
      if (data.order) setDetailOrder(data.order);
    } catch {
      showToast("ثبت مشتری سفارش ناموفق بود");
    } finally {
      setBusyId("");
    }
  }

  const counts = useMemo(() => {
    const c = { all: 0, waiting: 0, preparing: 0, ready: 0 };
    orders.forEach((o) => {
      if (!isOperational(o)) return;
      const st = normalizeStatus(o.status);
      c.all += 1;
      const bucket = st === "delivered" ? "ready" : st;
      if (bucket in c) (c as Record<string, number>)[bucket] += 1;
    });
    return c;
  }, [orders]);

  const list = useMemo(() => {
    const needle = q.trim();
    return orders
      .filter((o) => {
        if (!isOperational(o)) return false;
        const st = normalizeStatus(o.status);
        if (
          filter !== "all" &&
          st !== filter &&
          !(filter === "ready" && st === "delivered")
        ) {
          return false;
        }
        if (!needle) return true;
        const hay = `میز ${o.table} ${(o.items || []).map((i) => i.name).join(" ")}`;
        return hay.includes(needle) || hay.includes(toPersianDigits(needle));
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [orders, filter, q]);

  async function patch(orderId: string, body: Record<string, unknown>) {
    setBusyId(orderId);
    try {
      const data = await apiJson<{ orders?: Order[] }>(`/api/orders/${orderId}`, {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify(body),
      });
      if (body.status && filter !== "all" && filter !== body.status) {
        runOrdersMotion(() => {
          setFilter(String(body.status));
          onPatched(data);
        });
      } else {
        onPatched(data);
      }
      setStatusOrder(null);
      setPrepareOrder(null);
      setTableOrder(null);
      setCancelOrder(null);
      if (!body.quiet) showToast("ثبت شد");
    } catch {
      showToast("خطا در ثبت تغییرات");
    } finally {
      setBusyId("");
    }
  }

  function openCheckout(order: Order) {
    if (order.type === "waiter") {
      showToast("سفارش گارسون فاکتور ندارد");
      return;
    }
    setCheckoutOrder(order);
  }

  async function submitInvoice(order: Order, checkout: CheckoutPayload) {
    if (order.type === "waiter") {
      showToast("سفارش گارسون فاکتور ندارد");
      return;
    }
    setBusyId(order.id);
    try {
      const body: Record<string, unknown> = {
        orderId: order.id,
        unpaid: checkout.unpaid,
        tax: checkout.tax,
        customerName: checkout.customerName,
        customerPhone: checkout.customerPhone,
      };
      if (checkout.customerId) {
        body.customerId = checkout.customerId;
      } else if (checkout.customerId === "") {
        body.customerId = "";
      } else if (order.customerId) {
        body.customerId = order.customerId;
      }
      if (checkout.discountType) {
        body.discountType = checkout.discountType;
        body.discountValue = checkout.discountValue;
      }
      if (checkout.couponCode) {
        body.couponCode = checkout.couponCode;
      }
      if (!checkout.unpaid) {
        body.payments = checkout.payments;
      }
      if (checkout.guestSplits && checkout.guestSplits.length > 0) {
        body.guestSplits = checkout.guestSplits;
        body.splits = checkout.guestSplits;
      }
      const data = await apiJson<{
        orders?: Order[];
        invoices?: Invoice[];
        createdInvoices?: Invoice[];
        invoice?: Invoice;
      }>("/api/invoices", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify(body),
      });
      onPatched(data);
      setCheckoutOrder(null);
      const created = Array.isArray(data.createdInvoices)
        ? data.createdInvoices
        : [];
      if (created.length > 1) {
        setSplitResult(created);
        showToast(`${toPersianDigits(created.length)} فاکتور جدا ثبت شد`);
      } else {
        showToast(
          checkout.unpaid ? "فاکتور بدهکار ثبت شد" : "فاکتور ثبت و پرداخت شد"
        );
        onGoInvoices?.();
      }
    } catch (err) {
      const code =
        err instanceof Error && err.message ? err.message : "request_failed";
      const hints: Record<string, string> = {
        not_delivered: "ابتدا سفارش باید آماده شود",
        not_ready: "ابتدا سفارش باید آماده شود",
        not_billable: "این سفارش قابل فاکتور نیست",
        order_cancelled: "سفارش لغو شده است",
        auth_required: "لطفاً دوباره وارد شوید",
        order_required: "شناسه سفارش نامعتبر است",
        not_found: "سفارش پیدا نشد",
        unknown_route: "سرویس فاکتور در دسترس نیست — سرور را ری‌استارت کنید",
        payment_mismatch: "مبلغ پرداخت با فاکتور هم‌خوانی ندارد",
        customer_required: "برای فاکتور بدهکار نام مشتری الزامی است",
        guest_name_required: "نام هر نفر الزامی است",
      };
      showToast(hints[code] || "خطا در ثبت فاکتور");
    } finally {
      setBusyId("");
    }
  }

  function closeMenu() {
    setMenuFor(null);
  }

  const hasQuery = !!q.trim();
  const emptyMessage = hasQuery
    ? "نتیجه‌ای برای این جستجو پیدا نشد."
    : filter !== "all"
      ? "سفارشی در این وضعیت نیست."
      : "هنوز سفارش فعالی وجود ندارد.";

  return (
    <div className="orders-page">
      <header className="orders-header">
        <div className="orders-header-text">
          <h3 className="orders-title">سفارش‌ها</h3>
          <p className="orders-subtitle">
            مدیریت سفارش‌های فعال کافه —{" "}
            <span className="orders-subtitle-count">
              {loading ? "…" : `${toPersianDigits(counts.all)} سفارش`}
            </span>
          </p>
        </div>
      </header>

      {loading ? <LoadingShimmer variant="orders" /> : null}

      {!loading ? (
      <>
      <section className="orders-toolbar">
        <div className="orders-search cp-search-wrap">
          <span className="cp-search-icon" aria-hidden="true" />
          <input
            className="cp-search orders-search-input"
            type="search"
            placeholder="جستجو: میز، آیتم…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="جستجوی سفارش"
          />
        </div>
        <div className="orders-filters" role="tablist" aria-label="فیلتر وضعیت">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`orders-filter${filter === key ? " is-active" : ""}`}
              onClick={() => {
                if (filter === key) return;
                runOrdersMotion(() => setFilter(key));
              }}
            >
              <span>{label}</span>
              <span className="orders-filter-count cp-num">
                {toPersianDigits(counts[key as keyof typeof counts] || 0)}
              </span>
            </button>
          ))}
        </div>
      </section>

      {!list.length ? (
        <div className="orders-empty">
          <div className="orders-empty-icon" aria-hidden="true">
            ◌
          </div>
          <p className="orders-empty-title">{emptyMessage}</p>
          <p className="orders-empty-hint">
            سفارش‌های جدید مشتریان اینجا نمایش داده می‌شوند.
          </p>
          {(hasQuery || filter !== "all") && (
            <button
              type="button"
              className="cp-btn cp-btn--ghost"
              onClick={() => {
                runOrdersMotion(() => {
                  setQ("");
                  setFilter("all");
                });
              }}
            >
              پاک کردن فیلترها
            </button>
          )}
        </div>
      ) : (
        <div className="orders-grid">
          {list.map((order, index) => {
            const st =
              order.type !== "waiter" && normalizeStatus(order.status) === "delivered"
                ? "ready"
                : normalizeStatus(order.status);
            const next = nextAction(order);
            const edited = (order.batches || []).some((b) => !!b.edit);
            const busy = busyId === order.id;
            const menuOpen = menuFor === order.id;
            return (
              <article
                key={order.id}
                className={[
                  "orders-card",
                  `orders-card--${st}`,
                  order.type === "waiter" ? "is-waiter" : "",
                  busy ? "is-busy" : "",
                  menuOpen ? "is-menu-open" : "",
                  st === "waiting" ? "is-new" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-status={st}
                style={{
                  ["--orders-i" as string]: String(Math.min(index, 12)),
                  viewTransitionName: `ord-${String(order.id).replace(/[^a-zA-Z0-9_-]/g, "")}`,
                }}
              >
                <header className="orders-card-head">
                  <div className="orders-card-head-start">
                    <span className="orders-card-table">
                      میز {toPersianDigits(String(order.table))}
                    </span>
                    <span className={`orders-badge orders-badge--${st}`}>
                      <span className="orders-badge-dot" aria-hidden="true" />
                      {statusLabel(order, st)}
                    </span>
                  </div>
                  <time className="orders-card-time cp-num">
                    {formatOrderTime(order.createdAt)}
                  </time>
                </header>

                <div className="orders-card-body">
                  {order.type === "waiter" ? (
                    <p className="orders-waiter-note">
                      میز درخواست گارسون داده است.
                    </p>
                  ) : (
                    <ul className="orders-items">
                      {(order.items || []).map((item, i) => (
                        <li key={i} className="orders-item">
                          <span className="orders-item-name">
                            {item.name}
                            {(item.toppings || []).length ? (
                              <em className="orders-item-tops">
                                {(item.toppings || [])
                                  .map((t) =>
                                    typeof t === "string" ? t : t.name
                                  )
                                  .filter(Boolean)
                                  .join(" · ")}
                              </em>
                            ) : null}
                          </span>
                          <span className="orders-item-meta cp-num">
                            {formatPriceAsNumber(parsePrice(item.price))} ×{" "}
                            {toPersianDigits(item.count || 1)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {edited ? (
                    <p className="orders-edited">
                      ویرایش شد —{" "}
                      {formatOrderTime(order.updatedAt || order.createdAt)}
                    </p>
                  ) : null}
                </div>

                {order.type !== "waiter" ? (
                  <div className="orders-card-total">
                    <span className="orders-total-label">مجموع</span>
                    <strong className="orders-total-value cp-num">
                      {formatPriceAsNumber(order.total || 0)}
                    </strong>
                  </div>
                ) : null}

                <footer className="orders-card-actions">
                  {next ? (
                    <button
                      type="button"
                      className={`orders-primary-btn${next.action === "invoice" ? " is-invoice" : ""}`}
                      disabled={busy}
                      onClick={() => {
                        if (next.action === "invoice") {
                          openCheckout(order);
                        } else if (next.status === "preparing") {
                          setPrepareOrder(order);
                        } else if (next.status) {
                          patch(order.id, { status: next.status });
                        }
                      }}
                    >
                      {next.label}
                    </button>
                  ) : (
                    <span className="orders-done-label">پایان یافته</span>
                  )}
                  <div className="orders-more">
                    <button
                      type="button"
                      className="orders-more-btn"
                      aria-expanded={menuOpen}
                      aria-label="اقدامات بیشتر"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (menuOpen) {
                          closeMenu();
                        } else {
                          setMenuFor(order.id);
                        }
                      }}
                    >
                      ⋯
                    </button>
                    {menuOpen ? (
                      <div className="orders-more-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setDetailOrder(order);
                            closeMenu();
                          }}
                        >
                          جزئیات
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            if (!printOrderTicket(order)) {
                              showToast("چاپ مرورگر در دسترس نیست");
                            }
                            closeMenu();
                          }}
                        >
                          چاپ تیکت
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onCompose(order);
                            closeMenu();
                          }}
                        >
                          ویرایش آیتم‌ها
                        </button>
                        {order.type !== "waiter" &&
                        (st === "ready" || st === "preparing") ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              openCheckout(order);
                              closeMenu();
                            }}
                          >
                            ثبت فاکتور
                          </button>
                        ) : null}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setStatusOrder(order);
                            closeMenu();
                          }}
                        >
                          تغییر وضعیت
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setTableOrder(order);
                            closeMenu();
                          }}
                        >
                          تغییر میز
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="is-danger"
                          onClick={() => {
                            setCancelOrder(order);
                            closeMenu();
                          }}
                        >
                          لغو سفارش
                        </button>
                      </div>
                    ) : null}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      <InvoiceCheckoutModal
        open={!!checkoutOrder}
        order={checkoutOrder}
        invoices={invoices}
        busy={!!checkoutOrder && busyId === checkoutOrder.id}
        onClose={() => {
          if (busyId) return;
          setCheckoutOrder(null);
        }}
        onConfirm={(payload) => {
          if (checkoutOrder) submitInvoice(checkoutOrder, payload);
        }}
      />

      <SplitInvoicesResultModal
        open={splitResult.length > 0}
        invoices={splitResult}
        onClose={() => setSplitResult([])}
        onViewInvoices={() => {
          setSplitResult([]);
          onGoInvoices?.();
        }}
      />

      <PreparePrintDialog
        open={!!prepareOrder}
        order={prepareOrder}
        busy={!!prepareOrder && busyId === prepareOrder.id}
        onClose={() => {
          if (busyId) return;
          setPrepareOrder(null);
        }}
        onConfirm={async () => {
          if (!prepareOrder) return;
          await patch(prepareOrder.id, { status: "preparing" });
        }}
      />

      {detailOrder && typeof document !== "undefined"
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="order-detail-title"
              onClick={() => {
                setDetailOrder(null);
                setPickingCustomer(false);
              }}
            >
              <div
                className="table-glass-dialog menu-glass-dialog invoice-glass-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 id="order-detail-title" className="table-glass-title">
                      جزئیات سفارش
                    </h4>
                    <p className="table-glass-sub">
                      میز {toPersianDigits(String(detailOrder.table))} ·{" "}
                      {formatOrderTime(detailOrder.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    onClick={() => {
                      setDetailOrder(null);
                      setPickingCustomer(false);
                    }}
                  >
                    ×
                  </button>
                </header>

                <div className="invoice-glass-status-row">
                  <span
                    className={`orders-badge orders-badge--${normalizeStatus(detailOrder.status)}`}
                  >
                    <span className="orders-badge-dot" aria-hidden="true" />
                    {statusLabel(
                      detailOrder,
                      normalizeStatus(detailOrder.status)
                    )}
                  </span>
                </div>

                {detailOrder.type !== "waiter" ? (
                  <section className="menu-glass-section">
                    <span className="table-glass-label">مشتری</span>
                    {detailProfile && !pickingCustomer ? (
                      <CustomerOrderCard
                        profile={detailProfile}
                        busy={busyId === detailOrder.id}
                        onOpenCustomer={(id) => {
                          setDetailOrder(null);
                          onOpenCustomer?.(id);
                        }}
                        onChangeCustomer={() => setPickingCustomer(true)}
                        onClearCustomer={() =>
                          void setOrderCustomer(detailOrder, null)
                        }
                      />
                    ) : (
                      <div className="table-glass-card">
                        <CustomerPicker
                          value={
                            pickingCustomer
                              ? null
                              : detailCustomer
                                ? {
                                    id: detailCustomer.id,
                                    name: detailCustomer.name,
                                    phone: detailCustomer.phone,
                                    tier: detailCustomer.tier,
                                  }
                                : null
                          }
                          invoices={invoices}
                          disabled={busyId === detailOrder.id}
                          onChange={(pick) => {
                            if (!pick) {
                              if (detailCustomer) {
                                void setOrderCustomer(detailOrder, null);
                              } else {
                                setPickingCustomer(false);
                              }
                              return;
                            }
                            void setOrderCustomer(detailOrder, pick).then(
                              () => {
                                apiJson<{ customers?: Customer[] }>(
                                  "/api/customers",
                                  { headers: cashierHeaders() }
                                )
                                  .then((data) =>
                                    setCustomers(
                                      Array.isArray(data.customers)
                                        ? data.customers
                                        : []
                                    )
                                  )
                                  .catch(() => {});
                              }
                            );
                          }}
                        />
                        {pickingCustomer && detailProfile ? (
                          <button
                            type="button"
                            className="cp-btn cp-btn--ghost"
                            style={{ marginTop: 8 }}
                            disabled={busyId === detailOrder.id}
                            onClick={() => setPickingCustomer(false)}
                          >
                            انصراف از تغییر
                          </button>
                        ) : null}
                      </div>
                    )}
                  </section>
                ) : null}

                {detailOrder.type === "waiter" ? (
                  <p className="orders-waiter-note">درخواست گارسون</p>
                ) : (
                  <section className="menu-glass-section invoice-glass-items">
                    <span className="table-glass-label">آیتم‌ها</span>
                    <div className="table-glass-card">
                      {(detailOrder.items || []).length ? (
                        <ul className="table-glass-list">
                          {(detailOrder.items || []).map((item, i) => (
                            <li key={`${item.id || item.name}-${i}`}>
                              <span>
                                {toPersianDigits(item.count || 1)}× {item.name}
                                {(item.toppings || []).length ? (
                                  <em className="orders-item-tops">
                                    {" "}
                                    {(item.toppings || [])
                                      .map((t) =>
                                        typeof t === "string" ? t : t.name
                                      )
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </em>
                                ) : null}
                              </span>
                              <span className="cp-num">
                                {formatPriceAsNumber(
                                  parsePrice(item.price) * (item.count || 1)
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="table-glass-empty">آیتمی ثبت نشده.</p>
                      )}
                    </div>
                  </section>
                )}

                {detailOrder.type !== "waiter" ? (
                  <section className="menu-glass-section">
                    <span className="table-glass-label">خلاصه مبلغ</span>
                    <div className="table-glass-receipt">
                      <div className="table-glass-receipt-total">
                        <span>مجموع</span>
                        <strong className="cp-num">
                          {formatPriceAsNumber(detailOrder.total || 0)}
                        </strong>
                      </div>
                    </div>
                  </section>
                ) : null}

                <footer className="menu-glass-actions">
                  <button
                    type="button"
                    className="orders-primary-btn"
                    onClick={() => {
                      if (!printOrderTicket(detailOrder)) {
                        showToast("چاپ مرورگر در دسترس نیست");
                      }
                    }}
                  >
                    چاپ تیکت
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    onClick={() => {
                      setDetailOrder(null);
                      setPickingCustomer(false);
                    }}
                  >
                    بستن
                  </button>
                </footer>
              </div>
            </div>,
            document.body
          )
        : null}

      {statusOrder ? (
        <OrderActionDialog
          title="تغییر وضعیت"
          sub={`میز ${toPersianDigits(String(statusOrder.table))}`}
          labelledBy="order-status-title"
          onClose={() => !busyId && setStatusOrder(null)}
        >
          <section className="menu-glass-section">
            <span className="table-glass-label">وضعیت جدید</span>
            <div className="order-action-status-grid">
              {(statusOrder.type === "waiter"
                ? WAITER_STATUS_OPTIONS
                : STATUS_OPTIONS
              ).map(([key, label]) => {
                const raw = normalizeStatus(statusOrder.status);
                const current =
                  statusOrder.type === "waiter"
                    ? raw === key
                    : (raw === "delivered" ? "ready" : raw) === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`order-action-status order-action-status--${key}${current ? " is-active" : ""}`}
                    disabled={!!busyId}
                    onClick={() => patch(statusOrder.id, { status: key })}
                  >
                    <span className="order-action-status-dot" aria-hidden="true" />
                    <span className="order-action-status-name">{label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </OrderActionDialog>
      ) : null}

      {tableOrder ? (
        <OrderActionDialog
          title="تغییر میز"
          sub={`میز فعلی ${toPersianDigits(String(tableOrder.table))}`}
          labelledBy="order-table-title"
          onClose={() => !busyId && setTableOrder(null)}
        >
          <section className="menu-glass-section">
            <span className="table-glass-label">میز جدید</span>
            <div className="order-action-tables">
              {allTables.map((num) => {
                const key = String(num);
                const disabled = tables[key] === "disabled";
                const current = String(tableOrder.table) === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`compose-glass-table${current ? " is-active" : ""}${disabled ? " is-disabled" : ""}`}
                    disabled={disabled || !!busyId}
                    onClick={() =>
                      patch(tableOrder.id, { action: "table", table: key })
                    }
                  >
                    {toPersianDigits(key)}
                  </button>
                );
              })}
            </div>
          </section>
        </OrderActionDialog>
      ) : null}

      {cancelOrder ? (
        <OrderActionDialog
          title="لغو سفارش"
          sub={`میز ${toPersianDigits(String(cancelOrder.table))}`}
          labelledBy="order-cancel-title"
          onClose={() => !busyId && setCancelOrder(null)}
        >
          <p className="order-action-copy">
            این سفارش لغو شود؟ بعد از لغو دیگر در لیست سفارش‌های فعال دیده
            نمی‌شود.
          </p>
          <footer className="menu-glass-actions">
            <button
              type="button"
              className="orders-primary-btn is-danger"
              disabled={!!busyId}
              onClick={() =>
                patch(cancelOrder.id, { action: "cancel" })
              }
            >
              {busyId === cancelOrder.id ? "در حال لغو…" : "لغو سفارش"}
            </button>
            <button
              type="button"
              className="cp-btn cp-btn--ghost"
              disabled={!!busyId}
              onClick={() => setCancelOrder(null)}
            >
              انصراف
            </button>
          </footer>
        </OrderActionDialog>
      ) : null}
      </>
      ) : null}
    </div>
  );
}
