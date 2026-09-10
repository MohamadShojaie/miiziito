"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { apiJson, cashierHeaders } from "@/lib/api";
import type { Invoice, Order, TableRegion } from "@/lib/types";
import { ORDER_STATUS_LABEL } from "@/lib/types";
import {
  formatOrderTime,
  formatPriceAsNumber,
  normalizeStatus,
  parsePrice,
  toPersianDigits,
} from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { usePlanAccess } from "@/components/admin/PlanAccess";
import {
  InvoiceCheckoutModal,
  type CheckoutPayload,
} from "@/components/admin/InvoiceCheckoutModal";
import { SplitInvoicesResultModal } from "@/components/admin/SplitInvoicesResultModal";
import { PreparePrintDialog } from "@/components/admin/PreparePrintDialog";
import { LoadingShimmer } from "@/components/admin/LoadingShimmer";
import { TableQrPanel } from "@/components/admin/TableQrPanel";

function tileClass(st: string) {
  if (st === "open" || st === "free") return "free";
  if (st === "full") return "full";
  if (st === "disabled") return "disabled";
  if (st === "reserved") return "reserved";
  return st;
}

function isActiveOrder(order: Order) {
  if (order.type === "waiter" || order.type === "takeaway") return false;
  const st = normalizeStatus(order.status);
  return st === "waiting" || st === "preparing" || st === "ready" || st === "delivered";
}

function nextAction(order: Order): {
  status?: string;
  action?: "invoice";
  label: string;
} | null {
  const st = normalizeStatus(order.status);
  if (st === "waiting") return { status: "preparing", label: "شروع آماده‌سازی" };
  if (st === "preparing") return { status: "ready", label: "آماده شد" };
  if (st === "ready" || st === "delivered") {
    return { action: "invoice", label: "ثبت فاکتور" };
  }
  return null;
}

function orderItems(order: Order) {
  if (order.items?.length) return order.items;
  const fromBatches: Order["items"] = [];
  order.batches?.forEach((b) => {
    b.items?.forEach((it) => fromBatches!.push(it));
  });
  return fromBatches;
}

function slugRegionId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
  if (base) return base.slice(0, 32);
  return `region-${Date.now().toString(36)}`;
}

function parseTableInput(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "").slice(0, 2);
  if (!digits) return "";
  const n = Number(digits);
  if (n < 1 || n > 99) return "";
  return String(n);
}

function runTablesMotion(update: () => void) {
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

type ManageDialog =
  | { kind: "rename_region"; region: TableRegion }
  | { kind: "delete_region"; region: TableRegion }
  | { kind: "rename_table"; table: string }
  | { kind: "delete_table"; table: string };

function TablesManageDialog({
  open,
  title,
  sub,
  labelledBy,
  busy,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  sub?: string;
  labelledBy: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="table-glass-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="table-glass-dialog menu-glass-dialog invoice-glass-dialog"
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
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="tables-manage-dialog-body">{children}</div>
        {footer ? (
          <footer className="tables-manage-dialog-footer">{footer}</footer>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

export function TablesTab({
  tables,
  regions,
  orders,
  invoices = [],
  loading = false,
  onUpdated,
  onPatched,
  onCompose,
  onGoInvoices,
}: {
  tables: Record<string, string>;
  regions?: TableRegion[];
  orders: Order[];
  invoices?: Invoice[];
  loading?: boolean;
  onUpdated: (data: {
    tables?: Record<string, string>;
    regions?: TableRegion[];
  }) => void;
  onPatched?: (data: { orders?: Order[]; invoices?: unknown }) => void;
  onCompose?: (order?: Order | null) => void;
  onGoInvoices?: () => void;
}) {
  const { showToast } = useToast();
  const { has, requestUpgrade } = usePlanAccess();
  const canTableOps = has("tableOps");
  const rooms = regions ?? [];
  const [selected, setSelected] = useState("");
  const [stateBusy, setStateBusy] = useState(false);
  const [manageBusy, setManageBusy] = useState(false);
  const [newRegionName, setNewRegionName] = useState("");
  const [tableDrafts, setTableDrafts] = useState<Record<string, string>>({});
  const [checkoutOrder, setCheckoutOrder] = useState<Order | null>(null);
  const [prepareOrder, setPrepareOrder] = useState<Order | null>(null);
  const [busyId, setBusyId] = useState("");
  const [dialog, setDialog] = useState<ManageDialog | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [splitResult, setSplitResult] = useState<Invoice[]>([]);

  const ordersByTable = useMemo(() => {
    const map = new Map<string, Order[]>();
    orders.forEach((o) => {
      if (!isActiveOrder(o)) return;
      const key = String(o.table);
      const list = map.get(key) || [];
      list.push(o);
      map.set(key, list);
    });
    map.forEach((list) =>
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    );
    return map;
  }, [orders]);

  const busyTables = useMemo(
    () => new Set(ordersByTable.keys()),
    [ordersByTable]
  );

  const tableCount = useMemo(
    () => rooms.reduce((sum, r) => sum + (r.tables?.length || 0), 0),
    [rooms]
  );

  function displayState(num: number) {
    const key = String(num);
    const manual = tables[key];
    if (manual === "disabled") return "disabled";
    if (manual === "reserved") return "reserved";
    if (manual === "full" || busyTables.has(key)) return "full";
    return "free";
  }

  const selectedOrders = selected ? ordersByTable.get(selected) || [] : [];
  const primaryOrder = selectedOrders[0] || null;
  const selectedState = selected ? displayState(Number(selected)) : "";

  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !dialog) setSelected("");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, dialog]);

  function openRenameRegion(region: TableRegion) {
    setRenameValue(region.name);
    setDialog({ kind: "rename_region", region });
  }

  function openRenameTable(table: string) {
    setRenameValue(table);
    setDialog({ kind: "rename_table", table });
  }

  async function setState(num: string, state: string) {
    if (!has("tableOps")) {
      requestUpgrade("tableOps");
      return;
    }
    setStateBusy(true);
    try {
      const data = await apiJson<{
        tables?: Record<string, string>;
        regions?: TableRegion[];
      }>("/api/tables", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({
          action: "state",
          table: num,
          state: state === "free" ? "open" : state,
        }),
      });
      onUpdated(data);
      showToast("وضعیت میز ذخیره شد");
    } catch (err) {
      const code =
        err instanceof Error && err.message ? err.message : "request_failed";
      if (code === "upgrade_required") {
        requestUpgrade("tableOps");
        return;
      }
      showToast("ذخیره وضعیت ناموفق بود");
    } finally {
      setStateBusy(false);
    }
  }

  async function addRegion() {
    const name = newRegionName.trim();
    if (!name) {
      showToast("نام سالن را وارد کنید");
      return;
    }
    setManageBusy(true);
    try {
      const data = await apiJson<{
        tables?: Record<string, string>;
        regions?: TableRegion[];
      }>("/api/tables", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({
          action: "add_region",
          name,
          id: slugRegionId(name),
        }),
      });
      runTablesMotion(() => onUpdated(data));
      setNewRegionName("");
      showToast("سالن جدید اضافه شد");
    } catch (err) {
      const code =
        err instanceof Error && err.message ? err.message : "request_failed";
      const hints: Record<string, string> = {
        name_required: "نام سالن را وارد کنید",
        region_exists: "این سالن از قبل وجود دارد",
      };
      showToast(hints[code] || "افزودن سالن ناموفق بود");
    } finally {
      setManageBusy(false);
    }
  }

  async function addTableToRegion(regionId: string) {
    const table = parseTableInput(tableDrafts[regionId] || "");
    if (!table) {
      showToast("شماره میز را وارد کنید (۱ تا ۹۹)");
      return;
    }
    setManageBusy(true);
    try {
      const data = await apiJson<{
        tables?: Record<string, string>;
        regions?: TableRegion[];
      }>("/api/tables", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({
          action: "add",
          region: regionId,
          table,
        }),
      });
      runTablesMotion(() => onUpdated(data));
      setTableDrafts((prev) => ({ ...prev, [regionId]: "" }));
      showToast(`میز ${toPersianDigits(table)} اضافه شد`);
    } catch (err) {
      const code =
        err instanceof Error && err.message ? err.message : "request_failed";
      const hints: Record<string, string> = {
        table_required: "شماره میز را وارد کنید",
        table_exists: "این میز از قبل وجود دارد",
        region_required: "سالن نامعتبر است",
      };
      showToast(hints[code] || "افزودن میز ناموفق بود");
    } finally {
      setManageBusy(false);
    }
  }

  async function renameRegion() {
    if (!dialog || dialog.kind !== "rename_region") return;
    const name = renameValue.trim();
    if (!name) {
      showToast("نام سالن را وارد کنید");
      return;
    }
    setManageBusy(true);
    try {
      const data = await apiJson<{
        tables?: Record<string, string>;
        regions?: TableRegion[];
      }>("/api/tables", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({
          action: "rename_region",
          id: dialog.region.id,
          name,
        }),
      });
      runTablesMotion(() => onUpdated(data));
      setDialog(null);
      showToast("نام سالن به‌روز شد");
    } catch (err) {
      const code =
        err instanceof Error && err.message ? err.message : "request_failed";
      const hints: Record<string, string> = {
        name_required: "نام سالن را وارد کنید",
        region_required: "سالن پیدا نشد",
      };
      showToast(hints[code] || "ویرایش سالن ناموفق بود");
    } finally {
      setManageBusy(false);
    }
  }

  async function deleteRegion() {
    if (!dialog || dialog.kind !== "delete_region") return;
    const region = dialog.region;
    const busyInRegion = (region.tables || []).some((n) =>
      busyTables.has(String(n))
    );
    if (busyInRegion) {
      showToast("سالن میز فعال دارد؛ ابتدا سفارش‌ها را ببندید");
      return;
    }
    setManageBusy(true);
    try {
      const data = await apiJson<{
        tables?: Record<string, string>;
        regions?: TableRegion[];
      }>("/api/tables", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({
          action: "remove_region",
          id: region.id,
        }),
      });
      runTablesMotion(() => {
        onUpdated(data);
        if (
          selected &&
          (region.tables || []).some((n) => String(n) === selected)
        ) {
          setSelected("");
        }
      });
      setDialog(null);
      showToast("سالن حذف شد");
    } catch (err) {
      const code =
        err instanceof Error && err.message ? err.message : "request_failed";
      const hints: Record<string, string> = {
        region_required: "سالن پیدا نشد",
      };
      showToast(hints[code] || "حذف سالن ناموفق بود");
    } finally {
      setManageBusy(false);
    }
  }

  async function renameTable() {
    if (!dialog || dialog.kind !== "rename_table") return;
    const newTable = parseTableInput(renameValue);
    if (!newTable) {
      showToast("شماره میز را وارد کنید (۱ تا ۹۹)");
      return;
    }
    if (busyTables.has(dialog.table)) {
      showToast("میز سفارش فعال دارد؛ ابتدا سفارش را ببندید");
      return;
    }
    setManageBusy(true);
    try {
      const data = await apiJson<{
        tables?: Record<string, string>;
        regions?: TableRegion[];
      }>("/api/tables", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({
          action: "rename_table",
          table: dialog.table,
          newTable,
        }),
      });
      runTablesMotion(() => {
        onUpdated(data);
        if (selected === dialog.table) setSelected(newTable);
      });
      setDialog(null);
      showToast(`میز به ${toPersianDigits(newTable)} تغییر کرد`);
    } catch (err) {
      const code =
        err instanceof Error && err.message ? err.message : "request_failed";
      const hints: Record<string, string> = {
        table_required: "شماره میز را وارد کنید",
        table_exists: "این شماره از قبل وجود دارد",
        table_unknown: "میز پیدا نشد",
      };
      showToast(hints[code] || "ویرایش میز ناموفق بود");
    } finally {
      setManageBusy(false);
    }
  }

  async function deleteTable() {
    if (!dialog || dialog.kind !== "delete_table") return;
    if (busyTables.has(dialog.table)) {
      showToast("میز سفارش فعال دارد؛ ابتدا سفارش را ببندید");
      return;
    }
    setManageBusy(true);
    try {
      const data = await apiJson<{
        tables?: Record<string, string>;
        regions?: TableRegion[];
      }>("/api/tables", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({
          action: "remove",
          table: dialog.table,
        }),
      });
      runTablesMotion(() => {
        onUpdated(data);
        if (selected === dialog.table) setSelected("");
      });
      setDialog(null);
      showToast(`میز ${toPersianDigits(dialog.table)} حذف شد`);
    } catch (err) {
      const code =
        err instanceof Error && err.message ? err.message : "request_failed";
      const hints: Record<string, string> = {
        table_required: "میز نامعتبر است",
      };
      showToast(hints[code] || "حذف میز ناموفق بود");
    } finally {
      setManageBusy(false);
    }
  }

  function openCheckout(order: Order) {
    if (!has("tableOps")) {
      requestUpgrade("tableOps");
      return;
    }
    if (order.type === "waiter") {
      showToast("سفارش گارسون فاکتور ندارد");
      return;
    }
    if (!has("invoices")) {
      requestUpgrade("invoices");
      return;
    }
    setCheckoutOrder(order);
  }

  function startPreparing(order: Order) {
    if (!has("tableOps")) {
      requestUpgrade("tableOps");
      return;
    }
    if (has("kitchenPrint")) {
      setPrepareOrder(order);
      return;
    }
    patchOrder(order.id, { status: "preparing" });
  }

  async function patchOrder(orderId: string, body: Record<string, unknown>) {
    if (!has("tableOps")) {
      requestUpgrade("tableOps");
      return;
    }
    setBusyId(orderId);
    try {
      const data = await apiJson<{ orders?: Order[] }>(`/api/orders/${orderId}`, {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify(body),
      });
      onPatched?.(data);
      setPrepareOrder(null);
      setCheckoutOrder(null);
    } catch {
      showToast("به‌روزرسانی سفارش ناموفق بود");
    } finally {
      setBusyId("");
    }
  }

  async function submitInvoice(order: Order, checkout: CheckoutPayload) {
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
      }>("/api/invoices", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify(body),
      });
      onPatched?.(data);
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
      }
    } catch (err) {
      const code =
        err instanceof Error && err.message ? err.message : "request_failed";
      const hints: Record<string, string> = {
        not_delivered: "ابتدا سفارش باید آماده شود",
        not_ready: "ابتدا سفارش باید آماده شود",
        not_billable: "این سفارش قابل فاکتور نیست",
        order_cancelled: "سفارش لغو شده است",
        payment_mismatch: "مبلغ پرداخت با فاکتور هم‌خوانی ندارد",
        customer_required: "برای فاکتور بدهکار نام مشتری الزامی است",
        guest_name_required: "نام هر نفر الزامی است",
        upgrade_required: "این قابلیت در پلن فعلی فعال نیست",
      };
      if (code === "upgrade_required") {
        requestUpgrade("invoices");
        return;
      }
      showToast(hints[code] || "خطا در ثبت فاکتور");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="admin-tab admin-tab--tables tables-page">
      <header className="tables-header">
        <div className="tables-header-text">
          <h3 className="tables-title">میزها</h3>
          <p className="tables-subtitle">
            مدیریت سالن‌ها و وضعیت میزها —{" "}
            <span className="tables-subtitle-count">
              {loading
                ? "…"
                : `${toPersianDigits(rooms.length)} سالن · ${toPersianDigits(tableCount)} میز`}
            </span>
          </p>
        </div>
      </header>

      {loading ? <LoadingShimmer variant="tables" /> : null}

      {!loading ? (
      <>
      <section className="tables-toolbar">
        <p className="tables-toolbar-hint">
          روی هر میز بزنید تا وضعیت آن را تنظیم کنید یا سفارش فعال را ببینید.
        </p>
        <div className="cp-chip-bar table-legend">
          <span className="cp-chip table-legend-chip table-legend-chip--free">
            خالی
          </span>
          <span className="cp-chip table-legend-chip table-legend-chip--full">
            پر
          </span>
          <span className="cp-chip table-legend-chip table-legend-chip--reserved">
            رزرو
          </span>
          <span className="cp-chip table-legend-chip table-legend-chip--disabled">
            غیرفعال
          </span>
        </div>
      </section>

      <section className="tables-manage">
        <div className="tables-manage-head">
          <h4 className="tables-manage-title">افزودن سالن</h4>
          <p className="tables-manage-hint">
            سالن جدید بسازید؛ برای هر سالن می‌توانید میز اضافه، ویرایش یا حذف کنید.
          </p>
        </div>
        <div className="tables-manage-add-region">
          <input
            type="text"
            className="checkout-input tables-manage-input"
            placeholder="نام سالن جدید، مثلاً تراس"
            value={newRegionName}
            disabled={manageBusy}
            onChange={(e) => setNewRegionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addRegion();
            }}
          />
          <button
            type="button"
            className="checkout-coupon-apply tables-manage-btn"
            disabled={manageBusy}
            onClick={addRegion}
          >
            افزودن سالن
          </button>
        </div>
      </section>

      <div className="tables-floor">
        {rooms.map((region, regionIdx) => (
          <section
            key={region.id}
            className={`tables-room tables-room--${region.id}`}
            style={{ ["--tables-i" as string]: regionIdx }}
          >
            <div className="tables-room-head">
              <div className="tables-room-title-row">
                <h4 className="tables-room-title">{region.name}</h4>
                <div className="tables-room-actions">
                  <button
                    type="button"
                    className="tables-room-action"
                    disabled={manageBusy}
                    onClick={() => openRenameRegion(region)}
                  >
                    ویرایش
                  </button>
                  <button
                    type="button"
                    className="tables-room-action is-danger"
                    disabled={manageBusy}
                    onClick={() =>
                      setDialog({ kind: "delete_region", region })
                    }
                  >
                    حذف
                  </button>
                </div>
              </div>
              <div className="tables-room-add">
                <input
                  type="text"
                  inputMode="numeric"
                  className="checkout-input tables-room-add-input cp-num"
                  placeholder="شماره میز"
                  value={tableDrafts[region.id] || ""}
                  disabled={manageBusy}
                  onChange={(e) =>
                    setTableDrafts((prev) => ({
                      ...prev,
                      [region.id]: e.target.value
                        .replace(/[^\d]/g, "")
                        .slice(0, 2),
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTableToRegion(region.id);
                  }}
                />
                <button
                  type="button"
                  className="tables-room-add-btn"
                  disabled={manageBusy}
                  onClick={() => addTableToRegion(region.id)}
                >
                  + میز
                </button>
              </div>
            </div>
            <div className="tables-grid">
              {region.tables.map((num, tileIdx) => {
                const st = displayState(num);
                const css = tileClass(st);
                const tableOrders = ordersByTable.get(String(num)) || [];
                const top = tableOrders[0];
                return (
                  <button
                    key={num}
                    type="button"
                    className={`table-tile table-tile--${css}`}
                    style={{
                      ["--tables-tile-i" as string]: tileIdx,
                    }}
                    onClick={() => setSelected(String(num))}
                  >
                    <span className="table-tile-num">
                      میز {toPersianDigits(num)}
                    </span>
                    <span className="table-tile-status">
                      {st === "full"
                        ? top
                          ? ORDER_STATUS_LABEL[normalizeStatus(top.status)] ||
                            "پر"
                          : "پر"
                        : st === "disabled"
                          ? "غیرفعال"
                          : st === "reserved"
                            ? "رزرو"
                            : "خالی"}
                    </span>
                    {top?.total ? (
                      <span className="table-tile-total cp-num">
                        {formatPriceAsNumber(top.total)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {selected
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="dialog"
              aria-modal="true"
              aria-label={`میز ${toPersianDigits(selected)}`}
              onClick={() => setSelected("")}
            >
              <div
                className="table-glass-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 className="table-glass-title">
                      میز {toPersianDigits(selected)}
                    </h4>
                    <p className="table-glass-sub">
                      وضعیت فعلی:{" "}
                      {selectedState === "full"
                        ? "پر"
                        : selectedState === "disabled"
                          ? "غیرفعال"
                          : selectedState === "reserved"
                            ? "رزرو"
                            : "خالی"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="table-glass-close"
                    aria-label="بستن"
                    onClick={() => setSelected("")}
                  >
                    ×
                  </button>
                </header>

                <section className="table-glass-states">
                  <span className="table-glass-label">تغییر وضعیت</span>
                  {!canTableOps ? (
                    <p className="table-glass-lock-hint">
                      در پلن پایه، تغییر وضعیت میز و مدیریت سفارش از این بخش قفل است.
                    </p>
                  ) : null}
                  <div className="table-glass-state-grid">
                    <button
                      type="button"
                      className={`table-glass-state table-glass-state--free${selectedState === "free" ? " is-active" : ""}${!canTableOps ? " is-locked" : ""}`}
                      disabled={stateBusy}
                      onClick={() => setState(selected, "free")}
                    >
                      <span
                        className="table-glass-state-dot"
                        aria-hidden="true"
                      />
                      <span className="table-glass-state-name">خالی</span>
                      <span className="table-glass-state-hint">
                        آماده پذیرش
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`table-glass-state table-glass-state--full${selectedState === "full" ? " is-active" : ""}${!canTableOps ? " is-locked" : ""}`}
                      disabled={stateBusy}
                      onClick={() => setState(selected, "full")}
                    >
                      <span
                        className="table-glass-state-dot"
                        aria-hidden="true"
                      />
                      <span className="table-glass-state-name">پر</span>
                      <span className="table-glass-state-hint">میز اشغال</span>
                    </button>
                    <button
                      type="button"
                      className={`table-glass-state table-glass-state--reserved${selectedState === "reserved" ? " is-active" : ""}${!canTableOps ? " is-locked" : ""}`}
                      disabled={stateBusy}
                      onClick={() => setState(selected, "reserved")}
                    >
                      <span
                        className="table-glass-state-dot"
                        aria-hidden="true"
                      />
                      <span className="table-glass-state-name">رزرو</span>
                      <span className="table-glass-state-hint">
                        نگه داشتن میز
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`table-glass-state table-glass-state--disabled${selectedState === "disabled" ? " is-active" : ""}${!canTableOps ? " is-locked" : ""}`}
                      disabled={stateBusy}
                      onClick={() => setState(selected, "disabled")}
                    >
                      <span
                        className="table-glass-state-dot"
                        aria-hidden="true"
                      />
                      <span className="table-glass-state-name">غیرفعال</span>
                      <span className="table-glass-state-hint">بسته</span>
                    </button>
                  </div>
                </section>

                <section className="tables-tile-manage">
                  <span className="table-glass-label">مدیریت میز</span>
                  <div className="tables-tile-manage-actions">
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost"
                      disabled={manageBusy}
                      onClick={() => openRenameTable(selected)}
                    >
                      ویرایش شماره
                    </button>
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost tables-danger-btn"
                      disabled={manageBusy}
                      onClick={() =>
                        setDialog({ kind: "delete_table", table: selected })
                      }
                    >
                      حذف میز
                    </button>
                  </div>
                </section>

                <TableQrPanel table={selected} />

                {primaryOrder ? (
                  <section className="table-glass-orders">
                    <span className="table-glass-label">سفارش فعال</span>
                    <div className="table-order-panel">
                      {selectedOrders.map((order) => {
                        const st = normalizeStatus(order.status);
                        const next = nextAction(order);
                        const items = orderItems(order) || [];
                        const busy = busyId === order.id;
                        return (
                          <article key={order.id} className="table-order-card">
                            <header className="table-order-card-head">
                              <div>
                                <p className="table-order-meta">
                                  {formatOrderTime(order.createdAt)} ·{" "}
                                  {ORDER_STATUS_LABEL[st] || st}
                                </p>
                                <strong className="table-order-total cp-num">
                                  {formatPriceAsNumber(order.total || 0)}
                                </strong>
                              </div>
                              {onCompose ? (
                                <button
                                  type="button"
                                  className={`cp-btn cp-btn--ghost${!canTableOps ? " is-locked" : ""}`}
                                  disabled={busy}
                                  onClick={() => {
                                    if (!has("tableOps")) {
                                      requestUpgrade("tableOps");
                                      return;
                                    }
                                    onCompose(order);
                                  }}
                                >
                                  {!canTableOps ? "ویرایش (قفل)" : "ویرایش"}
                                </button>
                              ) : null}
                            </header>

                            <ul className="table-order-items">
                              {items.slice(0, 6).map((it, idx) => (
                                <li key={`${order.id}-${idx}`}>
                                  <span>
                                    {toPersianDigits(it.count)}× {it.name}
                                  </span>
                                  <span className="cp-num">
                                    {formatPriceAsNumber(
                                      parsePrice(it.price) * (it.count || 1)
                                    )}
                                  </span>
                                </li>
                              ))}
                              {items.length > 6 ? (
                                <li className="table-order-more">
                                  و {toPersianDigits(items.length - 6)} مورد
                                  دیگر…
                                </li>
                              ) : null}
                            </ul>

                            <footer className="table-order-actions">
                              {next ? (
                                <button
                                  type="button"
                                  className={`orders-primary-btn${next.action === "invoice" ? " is-invoice" : ""}${!canTableOps || (next.action === "invoice" && !has("invoices")) ? " is-locked" : ""}`}
                                  disabled={busy}
                                  onClick={() => {
                                    if (!has("tableOps")) {
                                      requestUpgrade("tableOps");
                                      return;
                                    }
                                    if (next.action === "invoice") {
                                      openCheckout(order);
                                    } else if (next.status === "preparing") {
                                      startPreparing(order);
                                    } else if (next.status) {
                                      patchOrder(order.id, {
                                        status: next.status,
                                      });
                                    }
                                  }}
                                >
                                  {!canTableOps ? `${next.label} (قفل)` : next.label}
                                </button>
                              ) : null}
                              {order.type !== "waiter" &&
                              (st === "preparing" ||
                                st === "ready" ||
                                st === "delivered") &&
                              next?.action !== "invoice" ? (
                                <button
                                  type="button"
                                  className={`orders-primary-btn is-invoice${!canTableOps || !has("invoices") ? " is-locked" : ""}`}
                                  disabled={busy}
                                  onClick={() => openCheckout(order)}
                                >
                                  {!canTableOps
                                    ? "ثبت فاکتور (قفل)"
                                    : !has("invoices")
                                      ? "ثبت فاکتور (قفل)"
                                      : "ثبت فاکتور"}
                                </button>
                              ) : null}
                            </footer>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ) : (
                  <p className="table-order-empty table-glass-empty">
                    سفارشی برای این میز ثبت نشده است.
                  </p>
                )}
              </div>
            </div>,
            document.body
          )
        : null}

      <TablesManageDialog
        open={dialog?.kind === "rename_region"}
        title="ویرایش سالن"
        sub="نام سالن را تغییر دهید."
        labelledBy="tables-rename-region-title"
        busy={manageBusy}
        onClose={() => setDialog(null)}
        footer={
          <>
            <button
              type="button"
              className="cp-btn cp-btn--ghost"
              disabled={manageBusy}
              onClick={() => setDialog(null)}
            >
              انصراف
            </button>
            <button
              type="button"
              className="cp-btn"
              disabled={manageBusy}
              onClick={renameRegion}
            >
              ذخیره
            </button>
          </>
        }
      >
        <span className="table-glass-label">نام سالن</span>
        <input
          type="text"
          className="checkout-input"
          value={renameValue}
          disabled={manageBusy}
          autoFocus
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") renameRegion();
          }}
        />
      </TablesManageDialog>

      <TablesManageDialog
        open={dialog?.kind === "delete_region"}
        title="حذف سالن"
        sub={
          dialog?.kind === "delete_region"
            ? `سالن «${dialog.region.name}» و همه میزهایش حذف می‌شوند.`
            : undefined
        }
        labelledBy="tables-delete-region-title"
        busy={manageBusy}
        onClose={() => setDialog(null)}
        footer={
          <>
            <button
              type="button"
              className="cp-btn cp-btn--ghost"
              disabled={manageBusy}
              onClick={() => setDialog(null)}
            >
              انصراف
            </button>
            <button
              type="button"
              className="cp-btn tables-danger-btn"
              disabled={manageBusy}
              onClick={deleteRegion}
            >
              حذف سالن
            </button>
          </>
        }
      >
        <p className="tables-manage-dialog-warn">
          این کار برگشت‌پذیر نیست. اگر میز فعال دارید، ابتدا سفارش را ببندید.
        </p>
      </TablesManageDialog>

      <TablesManageDialog
        open={dialog?.kind === "rename_table"}
        title="ویرایش شماره میز"
        sub={
          dialog?.kind === "rename_table"
            ? `شماره فعلی: ${toPersianDigits(dialog.table)}`
            : undefined
        }
        labelledBy="tables-rename-table-title"
        busy={manageBusy}
        onClose={() => setDialog(null)}
        footer={
          <>
            <button
              type="button"
              className="cp-btn cp-btn--ghost"
              disabled={manageBusy}
              onClick={() => setDialog(null)}
            >
              انصراف
            </button>
            <button
              type="button"
              className="cp-btn"
              disabled={manageBusy}
              onClick={renameTable}
            >
              ذخیره
            </button>
          </>
        }
      >
        <span className="table-glass-label">شماره جدید (۱ تا ۹۹)</span>
        <input
          type="text"
          inputMode="numeric"
          className="checkout-input cp-num"
          value={renameValue}
          disabled={manageBusy}
          autoFocus
          onChange={(e) =>
            setRenameValue(e.target.value.replace(/[^\d]/g, "").slice(0, 2))
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") renameTable();
          }}
        />
      </TablesManageDialog>

      <TablesManageDialog
        open={dialog?.kind === "delete_table"}
        title="حذف میز"
        sub={
          dialog?.kind === "delete_table"
            ? `میز ${toPersianDigits(dialog.table)} حذف می‌شود.`
            : undefined
        }
        labelledBy="tables-delete-table-title"
        busy={manageBusy}
        onClose={() => setDialog(null)}
        footer={
          <>
            <button
              type="button"
              className="cp-btn cp-btn--ghost"
              disabled={manageBusy}
              onClick={() => setDialog(null)}
            >
              انصراف
            </button>
            <button
              type="button"
              className="cp-btn tables-danger-btn"
              disabled={manageBusy}
              onClick={deleteTable}
            >
              حذف میز
            </button>
          </>
        }
      >
        <p className="tables-manage-dialog-warn">
          اگر این میز سفارش فعال دارد، ابتدا آن را ببندید یا فاکتور کنید.
        </p>
      </TablesManageDialog>

      <InvoiceCheckoutModal
        open={!!checkoutOrder}
        order={checkoutOrder}
        invoices={invoices}
        busy={!!checkoutOrder && busyId === checkoutOrder.id}
        onClose={() => setCheckoutOrder(null)}
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
          await patchOrder(prepareOrder.id, { status: "preparing" });
        }}
      />
      </>
      ) : null}
    </div>
  );
}
