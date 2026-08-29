"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Order } from "@/lib/types";
import type { HardwareDevice } from "@/lib/hardware";
import {
  hardwareTypeLabel,
  normalizeHardwareDevice,
} from "@/lib/hardware";
import { apiJson, cashierHeaders } from "@/lib/api";
import { toPersianDigits } from "@/lib/format";
import {
  buildStationLookup,
  pickStationPrinter,
  routeOrderItems,
  stationTicketReceipt,
  type PrintStation,
  type RoutedItem,
} from "@/lib/print-routing";
import {
  printErrorMessage,
  printReceipt,
} from "@/lib/printer";
import { stationTicketToEscPosBase64 } from "@/lib/receipt-image";
import {
  DEFAULT_SITE_SETTINGS,
  mergeSiteSettings,
  type SiteSettings,
} from "@/lib/settings";
import { DEFAULT_CAFE_NAME_EN } from "@/lib/brand";
import { useToast } from "@/components/ToastProvider";

type Props = {
  open: boolean;
  order: Order | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function PreparePrintDialog({
  open,
  order,
  busy,
  onClose,
  onConfirm,
}: Props) {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [devices, setDevices] = useState<HardwareDevice[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(
    DEFAULT_SITE_SETTINGS
  );
  const [sendKitchen, setSendKitchen] = useState(true);
  const [sendBar, setSendBar] = useState(true);
  const [lookup, setLookup] = useState(() => buildStationLookup());

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !order) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiJson<{ devices?: HardwareDevice[] }>("/api/hardware", {
        headers: cashierHeaders(),
      }).catch(() => ({ devices: [] as HardwareDevice[] })),
      apiJson<{ overrides?: unknown }>("/api/menu", {
        headers: cashierHeaders(),
        auth: false,
        sandbox: true,
      }).catch(() => ({ overrides: null })),
      apiJson<{ settings?: Partial<SiteSettings> }>("/api/settings", {
        headers: cashierHeaders(),
      }).catch(() => ({ settings: undefined })),
    ])
      .then(([hw, menuRes, settingsRes]) => {
        if (cancelled) return;
        const list = (hw.devices || []).map((d) => normalizeHardwareDevice(d));
        setDevices(list);
        const overrides =
          menuRes &&
          typeof menuRes === "object" &&
          menuRes.overrides &&
          typeof menuRes.overrides === "object"
            ? (menuRes.overrides as Parameters<typeof buildStationLookup>[0])
            : null;
        setLookup(buildStationLookup(overrides));
        setSiteSettings(mergeSiteSettings(settingsRes?.settings));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, order]);

  const routed = useMemo(() => {
    if (!order) return { kitchen: [] as RoutedItem[], bar: [] as RoutedItem[], all: [] as RoutedItem[] };
    return routeOrderItems(order, lookup);
  }, [order, lookup]);

  const kitchenPrinter = useMemo(
    () => pickStationPrinter(devices, "kitchen"),
    [devices]
  );
  const barPrinter = useMemo(
    () => pickStationPrinter(devices, "bar"),
    [devices]
  );

  useEffect(() => {
    if (!open || !order) return;
    setSendKitchen(routed.kitchen.length > 0 && !!kitchenPrinter);
    setSendBar(routed.bar.length > 0 && !!barPrinter);
  }, [
    open,
    order,
    routed.kitchen.length,
    routed.bar.length,
    kitchenPrinter?.id,
    barPrinter?.id,
  ]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy && !printing) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, printing, onClose]);

  async function printStation(
    station: PrintStation,
    items: RoutedItem[],
    printer: HardwareDevice | null
  ) {
    if (!order || !items.length || !printer) return { ok: true as const };
    const receipt = stationTicketReceipt(order, items, station, siteSettings);
    if (printer.paperWidth) receipt.paperWidth = printer.paperWidth;

    // Same image → ESC/POS path as حرارتی invoices (no prices on station tickets)
    try {
      const bytesBase64 = await stationTicketToEscPosBase64(
        order,
        items,
        station,
        siteSettings
      );
      return printReceipt(receipt, {
        printerId: printer.id,
        copies: printer.copies || 1,
        bytesBase64,
      });
    } catch {
      // Fallback to text ESC/POS if canvas render fails
      const page = String(printer.codePage || "").toLowerCase();
      if (page === "wpc1256" || page === "pc864") {
        receipt.codePage = page;
      } else if (!receipt.codePage) {
        receipt.codePage = "wpc1256";
      }
      return printReceipt(receipt, {
        printerId: printer.id,
        copies: printer.copies || 1,
      });
    }
  }

  async function handleConfirm() {
    if (!order) return;
    setPrinting(true);
    try {
      const jobs: Array<{ label: string; result: Awaited<ReturnType<typeof printReceipt>> }> = [];
      if (sendKitchen && routed.kitchen.length) {
        if (!kitchenPrinter) {
          showToast("پرینتر آشپزخانه تنظیم نشده است");
        } else {
          const result = await printStation(
            "kitchen",
            routed.kitchen,
            kitchenPrinter
          );
          jobs.push({ label: "آشپزخانه", result });
        }
      }
      if (sendBar && routed.bar.length) {
        if (!barPrinter) {
          showToast("پرینتر بار تنظیم نشده است");
        } else {
          const result = await printStation("bar", routed.bar, barPrinter);
          jobs.push({ label: "بار", result });
        }
      }
      for (const job of jobs) {
        if (!job.result.ok) {
          showToast(`${job.label}: ${printErrorMessage(job.result)}`);
        }
      }
      const failed = jobs.some((j) => !j.result.ok);
      if (jobs.length && !failed) {
        showToast("تیکت‌ها به پرینتر ارسال شد");
      }
      await onConfirm();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      showToast(
        printErrorMessage({ ok: false, error: code || "communication_error" })
      );
    } finally {
      setPrinting(false);
    }
  }

  async function handleSkipPrint() {
    await onConfirm();
  }

  if (!open || !order || !mounted) return null;

  const blocked = !!busy || printing;
  const brandFa = siteSettings.restaurantNameFa || "";
  const brandEn = siteSettings.restaurantNameEn || DEFAULT_CAFE_NAME_EN;

  return createPortal(
    <div
      className="table-glass-overlay prepare-print-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prepare-print-title"
      onClick={() => {
        if (!blocked) onClose();
      }}
    >
      <div
        className="table-glass-dialog menu-glass-dialog prepare-print-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="table-glass-head">
          <div>
            <h4 id="prepare-print-title" className="table-glass-title">
              شروع آماده‌سازی
            </h4>
            <p className="table-glass-sub">
              میز {toPersianDigits(String(order.table))} · ارسال تیکت به بخش‌ها
            </p>
          </div>
          <button
            type="button"
            className="table-glass-close"
            aria-label="بستن"
            disabled={blocked}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {loading ? (
          <p className="prepare-print-muted">در حال بارگذاری پرینترها…</p>
        ) : (
          <div className="prepare-print-stations">
            <StationBlock
              title="آشپزخانه"
              stationEn="KITCHEN"
              order={order}
              items={routed.kitchen}
              printer={kitchenPrinter}
              brandEn={brandEn}
              brandFa={brandFa}
              checked={sendKitchen}
              disabled={blocked || routed.kitchen.length === 0}
              onChange={setSendKitchen}
            />
            <StationBlock
              title="بار"
              stationEn="BAR"
              order={order}
              items={routed.bar}
              printer={barPrinter}
              brandEn={brandEn}
              brandFa={brandFa}
              checked={sendBar}
              disabled={blocked || routed.bar.length === 0}
              onChange={setSendBar}
            />
          </div>
        )}

        {!kitchenPrinter && !barPrinter ? (
          <p className="prepare-print-warn">
            هنوز پرینتر آشپزخانه یا بار در سخت‌افزار ثبت نشده. می‌توانید بدون
            چاپ ادامه دهید یا از تب سخت‌افزار پرینتر اضافه کنید.
          </p>
        ) : null}

        <footer className="prepare-print-actions">
          <button
            type="button"
            className={`orders-primary-btn${blocked ? " is-loading" : ""}`}
            disabled={blocked}
            onClick={handleConfirm}
          >
            {printing
              ? "در حال ارسال…"
              : sendKitchen || sendBar
                ? "چاپ و شروع آماده‌سازی"
                : "شروع آماده‌سازی"}
          </button>
          {(sendKitchen || sendBar) && (kitchenPrinter || barPrinter) ? (
            <button
              type="button"
              className="cp-btn cp-btn--ghost"
              disabled={blocked}
              onClick={handleSkipPrint}
            >
              فقط شروع بدون چاپ
            </button>
          ) : null}
          <button
            type="button"
            className="cp-btn cp-btn--ghost"
            disabled={blocked}
            onClick={onClose}
          >
            انصراف
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

function StationBlock({
  title,
  stationEn,
  order,
  items,
  printer,
  brandEn,
  brandFa,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  stationEn: string;
  order: Order;
  items: RoutedItem[];
  printer: HardwareDevice | null;
  brandEn: string;
  brandFa: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  const tableLabel =
    order.table != null && String(order.table) !== ""
      ? `میز ${toPersianDigits(String(order.table))}`
      : "—";
  const customer =
    [order.customerName, order.customerPhone].filter(Boolean).join(" · ") ||
    "—";

  return (
    <section
      className={`prepare-print-station${items.length ? "" : " is-empty"}${checked ? " is-on" : ""}`}
    >
      <label className="prepare-print-station-head">
        <input
          type="checkbox"
          checked={checked && items.length > 0}
          disabled={disabled || !items.length}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          <strong>{title}</strong>
          <em>
            {items.length
              ? `${toPersianDigits(items.length)} آیتم`
              : "آیتمی برای این بخش نیست"}
            {printer
              ? ` · ${printer.name}`
              : items.length
                ? " · پرینتر ثبت نشده"
                : ""}
          </em>
        </span>
      </label>
      {printer ? (
        <p className="prepare-print-printer-meta">
          {hardwareTypeLabel(printer.type)}
          {printer.address
            ? ` · ${printer.address}${printer.port ? `:${printer.port}` : ""}`
            : ""}
        </p>
      ) : null}
      {items.length ? (
        <div className="prepare-print-slip" aria-hidden="true">
          <div className="prepare-print-slip-head">
            <span className="prepare-print-slip-box">
              <em>{title}</em>
              <strong>{stationEn}</strong>
            </span>
            <span className="prepare-print-slip-brand">
              <strong>{brandEn}</strong>
              {brandFa ? <em>{brandFa}</em> : null}
            </span>
            <span className="prepare-print-slip-box">
              <em>مکان</em>
              <strong>{tableLabel}</strong>
            </span>
          </div>
          <div className="prepare-print-slip-meta">
            <span>مشتری: {customer}</span>
          </div>
          <table className="prepare-print-slip-table">
            <thead>
              <tr>
                <th className="is-name">نام</th>
                <th className="is-qty">تعداد</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const tops = (it.toppings || [])
                  .map((t) => (typeof t === "string" ? t : t.name))
                  .filter(Boolean);
                return (
                  <tr key={`${it.name}-${i}`}>
                    <td className="is-name">
                      <span>{it.name}</span>
                      {tops.length ? (
                        <em className="prepare-print-tops">
                          {tops.map((t) => `+ ${t}`).join(" · ")}
                        </em>
                      ) : null}
                    </td>
                    <td className="is-qty cp-num">
                      {toPersianDigits(it.count || 1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="prepare-print-slip-foot">سفارش جدید</p>
        </div>
      ) : null}
    </section>
  );
}
