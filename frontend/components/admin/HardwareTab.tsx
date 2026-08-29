"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiJson, cashierHeaders } from "@/lib/api";
import { toPersianDigits } from "@/lib/format";
import {
  HARDWARE_CONNECTION_OPTIONS,
  HARDWARE_STATION_OPTIONS,
  HARDWARE_TYPE_OPTIONS,
  defaultStationForType,
  hardwareConnectionLabel,
  hardwareStationLabel,
  hardwareTypeLabel,
  normalizeHardwareDevice,
  type HardwareConnection,
  type HardwareDevice,
  type HardwareDeviceType,
  type HardwareStation,
} from "@/lib/hardware";
import { useToast } from "@/components/ToastProvider";
import { LoadingShimmer } from "@/components/admin/LoadingShimmer";
import { CpSelect } from "@/components/ui/CpSelect";
import {
  discoverPrinters,
  discoveredToHardwareDraft,
  getPrinterCapabilities,
  printErrorMessage,
  testPrinter,
  type DiscoveredPrinter,
  type PrinterCapabilities,
  type PrinterConnectionType,
} from "@/lib/printer";

type Draft = {
  id?: string;
  name: string;
  type: HardwareDeviceType;
  station: HardwareStation;
  connection: HardwareConnection;
  address: string;
  port: string;
  paperWidth: "" | "58" | "80";
  copies: string;
  enabled: boolean;
  notes: string;
  isDefault: boolean;
  codePage: string;
  manufacturer: string;
  model: string;
  vendorId: string;
  productId: string;
  cupsQueue: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  type: "kitchen_printer",
  station: "kitchen",
  connection: "network",
  address: "",
  port: "9100",
  paperWidth: "80",
  copies: "1",
  enabled: true,
  notes: "",
  isDefault: false,
  codePage: "utf8",
  manufacturer: "",
  model: "",
  vendorId: "",
  productId: "",
  cupsQueue: "",
};

function isPrinterType(type: HardwareDeviceType) {
  return (
    type === "kitchen_printer" ||
    type === "bar_printer" ||
    type === "receipt_printer"
  );
}

function endpointLabel(device: {
  address?: string;
  port?: string;
  connection?: string;
  cupsQueue?: string;
}) {
  if (device.cupsQueue) return `CUPS:${device.cupsQueue}`;
  const parts = [device.address, device.port].filter(Boolean);
  if (parts.length) return parts.join(":");
  return hardwareConnectionLabel(
    (device.connection || "network") as HardwareConnection
  );
}

export function HardwareTab({ active }: { active: boolean }) {
  const { showToast } = useToast();
  const [devices, setDevices] = useState<HardwareDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filterType, setFilterType] = useState<"all" | HardwareDeviceType>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [mounted, setMounted] = useState(false);
  const [discoverKind, setDiscoverKind] =
    useState<PrinterConnectionType>("network");
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredPrinter[]>([]);
  const [discoverMeta, setDiscoverMeta] = useState("");
  const [caps, setCaps] = useState<PrinterCapabilities | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  function loadDevices() {
    setLoading(true);
    setError("");
    return apiJson<{ devices?: HardwareDevice[] }>("/api/hardware", {
      headers: cashierHeaders(),
    })
      .then((data) =>
        setDevices((data.devices || []).map((d) => normalizeHardwareDevice(d)))
      )
      .catch(() => setError("بارگذاری دستگاه‌ها ناموفق بود"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!active) return;
    loadDevices();
    getPrinterCapabilities()
      .then((data) => setCaps(data.capabilities || null))
      .catch(() => setCaps(null));
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
    return devices.filter((d) => {
      if (filterType !== "all" && d.type !== filterType) return false;
      if (!needle) return true;
      const hay = `${d.name} ${d.address} ${d.notes} ${hardwareTypeLabel(d.type)} ${hardwareStationLabel(d.station)}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [devices, filterType, q]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: devices.length };
    for (const opt of HARDWARE_TYPE_OPTIONS) map[opt.id] = 0;
    for (const d of devices) map[d.type] = (map[d.type] || 0) + 1;
    return map;
  }, [devices]);

  function openAdd(type?: HardwareDeviceType) {
    const nextType = type || "kitchen_printer";
    setDraft({
      ...EMPTY_DRAFT,
      type: nextType,
      station: defaultStationForType(nextType),
      paperWidth: isPrinterType(nextType) ? "80" : "",
      port: nextType === "waiter_pager" ? "" : "9100",
      name:
        HARDWARE_TYPE_OPTIONS.find((o) => o.id === nextType)?.title || "",
    });
    setDialogOpen(true);
  }

  function openEdit(device: HardwareDevice) {
    setDraft({
      id: device.id,
      name: device.name,
      type: device.type,
      station: device.station,
      connection: device.connection,
      address: device.address,
      port: device.port,
      paperWidth: device.paperWidth,
      copies: String(device.copies || 1),
      enabled: device.enabled,
      notes: device.notes,
      isDefault: Boolean(device.isDefault),
      codePage: device.codePage || "utf8",
      manufacturer: device.manufacturer || "",
      model: device.model || "",
      vendorId: device.vendorId || "",
      productId: device.productId || "",
      cupsQueue: device.cupsQueue || "",
    });
    setDialogOpen(true);
  }

  function openFromDiscovery(found: DiscoveredPrinter) {
    const seed = discoveredToHardwareDraft(found, "receipt_printer");
    setDraft({
      ...EMPTY_DRAFT,
      name: seed.name || found.name,
      type: "receipt_printer",
      station: "cashier",
      connection: found.connection,
      address: seed.address || "",
      port: seed.port || "",
      paperWidth: "80",
      copies: "1",
      enabled: true,
      isDefault: true,
      codePage: "utf8",
      manufacturer: seed.manufacturer || "",
      model: seed.model || "",
      vendorId: seed.vendorId || "",
      productId: seed.productId || "",
      cupsQueue: seed.cupsQueue || "",
      notes: "",
    });
    setDialogOpen(true);
  }

  async function runDiscover(kind: PrinterConnectionType) {
    setDiscoverKind(kind);
    setScanning(true);
    setDiscoverMeta("");
    setDiscovered([]);
    try {
      const data = await discoverPrinters(kind);
      setDiscovered(data.printers || []);
      const bits = [
        data.localIp ? `IP محلی: ${data.localIp}` : "",
        data.subnet ? `شبکه: ${data.subnet}` : "",
        data.scanned != null
          ? `${toPersianDigits(data.scanned)} آدرس اسکن شد`
          : "",
        data.message || "",
      ].filter(Boolean);
      setDiscoverMeta(bits.join(" · "));
      if (!(data.printers || []).length) {
        showToast(data.message || "پرینتری پیدا نشد");
      }
    } catch {
      showToast("جستجوی پرینتر ناموفق بود");
    } finally {
      setScanning(false);
    }
  }

  async function runTest(
    target: HardwareDevice | DiscoveredPrinter,
    savedId?: string
  ) {
    const key = savedId || target.id || endpointLabel(target as HardwareDevice);
    setTestingId(key);
    setBusy(true);
    try {
      const result = await testPrinter(target, savedId);
      if (result.ok) {
        showToast(`تست موفق · ${result.bytes || 0} بایت ارسال شد`);
      } else {
        showToast(printErrorMessage(result));
      }
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? printErrorMessage({ ok: false, error: err.message })
          : "تست پرینتر ناموفق بود";
      showToast(msg);
    } finally {
      setBusy(false);
      setTestingId(null);
    }
  }

  async function saveDevice() {
    const name = draft.name.trim();
    if (!name) {
      showToast("نام دستگاه را وارد کنید");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        action: draft.id ? "update" : "add",
        id: draft.id,
        name,
        type: draft.type,
        station: draft.station,
        connection: draft.connection,
        address: draft.address.trim(),
        port: draft.port.trim(),
        paperWidth: isPrinterType(draft.type) ? draft.paperWidth : "",
        copies: Number(draft.copies) || 1,
        enabled: draft.enabled,
        notes: draft.notes.trim(),
        isDefault: draft.isDefault,
        codePage: draft.codePage || "utf8",
        manufacturer: draft.manufacturer.trim(),
        model: draft.model.trim(),
        vendorId: draft.vendorId.trim(),
        productId: draft.productId.trim(),
        cupsQueue: draft.cupsQueue.trim(),
      };
      const data = await apiJson<{ devices?: HardwareDevice[] }>("/api/hardware", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify(payload),
      });
      setDevices((data.devices || []).map((d) => normalizeHardwareDevice(d)));
      setDialogOpen(false);
      showToast(draft.id ? "دستگاه به‌روز شد" : "دستگاه اضافه شد");
    } catch (err) {
      const code =
        err instanceof Error ? err.message : "";
      showToast(
        code === "duplicate"
          ? "این پرینتر قبلاً ذخیره شده است"
          : "ذخیره دستگاه ناموفق بود"
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleDevice(device: HardwareDevice) {
    setBusy(true);
    try {
      const data = await apiJson<{ devices?: HardwareDevice[] }>("/api/hardware", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({
          action: "toggle",
          id: device.id,
          enabled: !device.enabled,
        }),
      });
      setDevices((data.devices || []).map((d) => normalizeHardwareDevice(d)));
      showToast(device.enabled ? "دستگاه خاموش شد" : "دستگاه روشن شد");
    } catch {
      showToast("تغییر وضعیت ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function removeDevice(device: HardwareDevice) {
    if (!window.confirm(`«${device.name}» حذف شود؟`)) return;
    setBusy(true);
    try {
      const data = await apiJson<{ devices?: HardwareDevice[] }>("/api/hardware", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({ action: "remove", id: device.id }),
      });
      setDevices((data.devices || []).map((d) => normalizeHardwareDevice(d)));
      showToast("دستگاه حذف شد");
    } catch {
      showToast("حذف دستگاه ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function setDefaultDevice(device: HardwareDevice) {
    setBusy(true);
    try {
      const data = await apiJson<{ devices?: HardwareDevice[] }>("/api/hardware", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({ action: "set_default", id: device.id }),
      });
      setDevices((data.devices || []).map((d) => normalizeHardwareDevice(d)));
      showToast(`«${device.name}» به‌عنوان پیش‌فرض تنظیم شد`);
    } catch {
      showToast("تنظیم پرینتر پیش‌فرض ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function testDevice(device: HardwareDevice) {
    if (!device.enabled) {
      showToast("ابتدا دستگاه را فعال کنید");
      return;
    }
    await runTest(device, device.id);
  }

  return (
    <div className="admin-tab admin-tab--hardware hardware-page">
      <header className="hardware-header">
        <div>
          <h3 className="hardware-title">سخت‌افزار و پرینتر حرارتی</h3>
          <p className="hardware-subtitle">
            کشف پرینتر شبکه / بلوتوث / USB، تست ESC/POS، ذخیره و چاپ رسید
          </p>
        </div>
        <div className="hardware-header-actions">
          <button
            type="button"
            className="cp-btn cp-btn--primary"
            onClick={() => openAdd("receipt_printer")}
          >
            + پرینتر جدید
          </button>
        </div>
      </header>

      <section className="printer-discover" aria-label="کشف پرینتر">
        <div className="printer-discover-head">
          <div>
            <h4>کشف پرینتر حرارتی</h4>
            <p>
              شبکه: پورت ۹۱۰۰ · بلوتوث و USB روی میزبان صندوق اسکن می‌شوند
              {caps?.platform ? ` · ${caps.platform}` : ""}
            </p>
          </div>
          <div className="printer-discover-actions">
            <button
              type="button"
              className={`cp-btn cp-btn--ghost${discoverKind === "network" && scanning ? " is-loading" : ""}`}
              disabled={scanning || busy}
              onClick={() => runDiscover("network")}
            >
              شبکه
            </button>
            <button
              type="button"
              className={`cp-btn cp-btn--ghost${discoverKind === "bluetooth" && scanning ? " is-loading" : ""}`}
              disabled={scanning || busy || caps?.bluetooth === false}
              onClick={() => runDiscover("bluetooth")}
              title={
                caps?.bluetooth === false
                  ? "بلوتوث روی این میزبان در دسترس نیست"
                  : undefined
              }
            >
              بلوتوث
            </button>
            <button
              type="button"
              className={`cp-btn cp-btn--ghost${discoverKind === "usb" && scanning ? " is-loading" : ""}`}
              disabled={scanning || busy}
              onClick={() => runDiscover("usb")}
            >
              USB
            </button>
          </div>
        </div>
        {scanning ? (
          <p className="printer-discover-meta">در حال اسکن… لطفاً صبر کنید</p>
        ) : discoverMeta ? (
          <p className="printer-discover-meta">{discoverMeta}</p>
        ) : null}
        {discovered.length ? (
          <ul className="printer-discover-list">
            {discovered.map((p) => (
              <li key={p.id} className="printer-discover-row">
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {hardwareConnectionLabel(p.connection)} ·{" "}
                    {endpointLabel(p)}
                    {p.manufacturer ? ` · ${p.manufacturer}` : ""}
                    {p.vendorId
                      ? ` · ${p.vendorId}:${p.productId || "????"}`
                      : ""}
                  </small>
                  <em>{p.status || "discovered"}</em>
                </div>
                <div className="printer-discover-row-actions">
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost hardware-row-btn"
                    disabled={busy || scanning}
                    onClick={() => runTest(p)}
                  >
                    {testingId === p.id ? "…" : "تست"}
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--primary hardware-row-btn"
                    disabled={busy || scanning}
                    onClick={() => openFromDiscovery(p)}
                  >
                    افزودن
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="hardware-quick">
        <p className="hardware-quick-label">افزودن سریع</p>
        <div className="hardware-quick-grid">
          {HARDWARE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="hardware-quick-card"
              onClick={() => openAdd(opt.id)}
            >
              <strong>{opt.title}</strong>
              <em>{opt.description}</em>
              <span>{toPersianDigits(counts[opt.id] || 0)} دستگاه</span>
            </button>
          ))}
        </div>
      </section>

      <div className="hardware-toolbar">
        <input
          type="search"
          className="hardware-search"
          placeholder="جستجو نام، IP یا بخش…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="hardware-filters" role="tablist" aria-label="نوع دستگاه">
          <button
            type="button"
            role="tab"
            aria-selected={filterType === "all"}
            className={`hardware-filter${filterType === "all" ? " is-active" : ""}`}
            onClick={() => setFilterType("all")}
          >
            همه ({toPersianDigits(counts.all || 0)})
          </button>
          {HARDWARE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={filterType === opt.id}
              className={`hardware-filter${filterType === opt.id ? " is-active" : ""}`}
              onClick={() => setFilterType(opt.id)}
            >
              {opt.title}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="hardware-error">{error}</p> : null}

      {loading ? (
        <LoadingShimmer variant="list" />
      ) : filtered.length === 0 ? (
        <div className="hardware-empty">
          <p className="hardware-empty-title">هنوز دستگاهی ثبت نشده</p>
          <p className="hardware-empty-hint">
            پیجر گارسون یا پرینتر آشپزخانه/بار را از بالا اضافه کنید
          </p>
        </div>
      ) : (
        <ul className="hardware-list">
          {filtered.map((device) => (
            <li
              key={device.id}
              className={`hardware-row${device.enabled ? "" : " is-disabled"}`}
            >
              <div className="hardware-row-main">
                <strong>{device.name}</strong>
                <small>
                  {hardwareTypeLabel(device.type)} ·{" "}
                  {hardwareStationLabel(device.station)}
                </small>
                <em>
                  {hardwareConnectionLabel(device.connection)}
                  {device.address || device.port
                    ? ` · ${endpointLabel(device)}`
                    : ""}
                  {device.paperWidth ? ` · ${device.paperWidth}mm` : ""}
                </em>
              </div>
              <div className="hardware-row-meta">
                <span
                  className={`hardware-pill${device.enabled ? "" : " is-muted"}`}
                >
                  {device.enabled ? "فعال" : "خاموش"}
                </span>
                {device.isDefault ? (
                  <span className="hardware-pill">پیش‌فرض</span>
                ) : null}
                {isPrinterType(device.type) ? (
                  <span className="hardware-pill is-muted">
                    {toPersianDigits(device.copies)} نسخه
                    {device.paperWidth ? ` · ${device.paperWidth}mm` : ""}
                  </span>
                ) : null}
              </div>
              <div className="hardware-row-actions">
                <button
                  type="button"
                  className="cp-btn cp-btn--ghost hardware-row-btn"
                  disabled={busy}
                  onClick={() => testDevice(device)}
                >
                  {testingId === device.id ? "…" : "تست"}
                </button>
                {isPrinterType(device.type) && !device.isDefault ? (
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost hardware-row-btn"
                    disabled={busy}
                    onClick={() => setDefaultDevice(device)}
                  >
                    پیش‌فرض
                  </button>
                ) : null}
                <button
                  type="button"
                  className="cp-btn cp-btn--ghost hardware-row-btn"
                  disabled={busy}
                  onClick={() => toggleDevice(device)}
                >
                  {device.enabled ? "خاموش" : "روشن"}
                </button>
                <button
                  type="button"
                  className="cp-btn cp-btn--ghost hardware-row-btn"
                  disabled={busy}
                  onClick={() => openEdit(device)}
                >
                  ویرایش
                </button>
                <button
                  type="button"
                  className="cp-btn cp-btn--ghost hardware-row-btn is-danger"
                  disabled={busy}
                  onClick={() => removeDevice(device)}
                >
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mounted && dialogOpen
        ? createPortal(
            <div
              className="table-glass-overlay"
              onClick={(e) => {
                if (e.target === e.currentTarget) setDialogOpen(false);
              }}
            >
              <div
                className="table-glass-dialog menu-glass-dialog hardware-glass-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="hardware-dialog-title"
              >
                <header className="table-glass-head">
                  <div>
                    <h4 id="hardware-dialog-title" className="table-glass-title">
                      {draft.id ? "ویرایش دستگاه" : "دستگاه جدید"}
                    </h4>
                    <p className="table-glass-sub">
                      اتصال و محل استفاده را مشخص کنید
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

                <div className="hardware-form">
                  <label className="hardware-field">
                    <span>نام</span>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, name: e.target.value }))
                      }
                      placeholder="مثلاً پرینتر بار گرم"
                    />
                  </label>

                  <div className="hardware-field-row">
                    <label className="hardware-field">
                      <span>نوع</span>
                      <CpSelect
                        value={draft.type}
                        options={HARDWARE_TYPE_OPTIONS.map(
                          (o) => [o.id, o.title] as [string, string]
                        )}
                        onChange={(v) => {
                          const type = v as HardwareDeviceType;
                          setDraft((d) => ({
                            ...d,
                            type,
                            station: defaultStationForType(type),
                            paperWidth: isPrinterType(type)
                              ? d.paperWidth || "80"
                              : "",
                          }));
                        }}
                      />
                    </label>
                    <label className="hardware-field">
                      <span>بخش</span>
                      <CpSelect
                        value={draft.station}
                        options={HARDWARE_STATION_OPTIONS.map(
                          (o) => [o.id, o.title] as [string, string]
                        )}
                        onChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            station: v as HardwareStation,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="hardware-field-row">
                    <label className="hardware-field">
                      <span>نوع اتصال</span>
                      <CpSelect
                        value={draft.connection}
                        options={HARDWARE_CONNECTION_OPTIONS.map(
                          (o) => [o.id, o.title] as [string, string]
                        )}
                        onChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            connection: v as HardwareConnection,
                          }))
                        }
                      />
                    </label>
                    <label className="hardware-field">
                      <span>آدرس / IP / مسیر</span>
                      <input
                        type="text"
                        dir="ltr"
                        value={draft.address}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, address: e.target.value }))
                        }
                        placeholder="192.168.1.50"
                      />
                    </label>
                  </div>

                  <div className="hardware-field-row">
                    <label className="hardware-field">
                      <span>پورت</span>
                      <input
                        type="text"
                        dir="ltr"
                        value={draft.port}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, port: e.target.value }))
                        }
                        placeholder="9100"
                      />
                    </label>
                    {isPrinterType(draft.type) ? (
                      <label className="hardware-field">
                        <span>عرض کاغذ</span>
                        <CpSelect
                          value={draft.paperWidth || "80"}
                          options={[
                            ["58", "۵۸ میلی‌متر"],
                            ["80", "۸۰ میلی‌متر"],
                          ]}
                          onChange={(v) =>
                            setDraft((d) => ({
                              ...d,
                              paperWidth: v as "58" | "80",
                            }))
                          }
                        />
                      </label>
                    ) : (
                      <label className="hardware-field">
                        <span>توضیح کوتاه</span>
                        <input
                          type="text"
                          value={draft.notes}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, notes: e.target.value }))
                          }
                          placeholder="اختیاری"
                        />
                      </label>
                    )}
                  </div>

                  {isPrinterType(draft.type) ? (
                    <div className="hardware-field-row">
                      <label className="hardware-field">
                        <span>تعداد نسخه چاپ</span>
                        <input
                          type="number"
                          min={1}
                          max={9}
                          value={draft.copies}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, copies: e.target.value }))
                          }
                        />
                      </label>
                      <label className="hardware-field">
                        <span>کدپیج</span>
                        <CpSelect
                          value={draft.codePage || "utf8"}
                          options={[
                            ["utf8", "UTF-8"],
                            ["wpc1256", "Windows-1256 (عربی/فارسی)"],
                            ["pc864", "PC864"],
                            ["wpc1252", "Windows-1252"],
                            ["pc437", "PC437"],
                          ]}
                          onChange={(v) =>
                            setDraft((d) => ({ ...d, codePage: v }))
                          }
                        />
                      </label>
                    </div>
                  ) : null}

                  {isPrinterType(draft.type) ? (
                    <div className="hardware-field-row">
                      <label className="hardware-field">
                        <span>سازنده</span>
                        <input
                          type="text"
                          value={draft.manufacturer}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              manufacturer: e.target.value,
                            }))
                          }
                          placeholder="Epson / Xprinter…"
                        />
                      </label>
                      <label className="hardware-field">
                        <span>مدل</span>
                        <input
                          type="text"
                          value={draft.model}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, model: e.target.value }))
                          }
                        />
                      </label>
                    </div>
                  ) : null}

                  {draft.connection === "usb" ? (
                    <label className="hardware-field">
                      <span>صف CUPS (اختیاری)</span>
                      <input
                        type="text"
                        dir="ltr"
                        value={draft.cupsQueue}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, cupsQueue: e.target.value }))
                        }
                        placeholder="queue name"
                      />
                    </label>
                  ) : null}

                  <label className="hardware-field">
                    <span>یادداشت</span>
                    <input
                      type="text"
                      value={draft.notes}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, notes: e.target.value }))
                      }
                      placeholder="اختیاری"
                    />
                  </label>

                  <label className="hardware-toggle">
                    <span>
                      <strong>فعال باشد</strong>
                      <em>سفارش‌ها به این دستگاه ارسال شوند</em>
                    </span>
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, enabled: e.target.checked }))
                      }
                    />
                  </label>

                  {isPrinterType(draft.type) ? (
                    <label className="hardware-toggle">
                      <span>
                        <strong>پرینتر پیش‌فرض</strong>
                        <em>برای چاپ رسید فاکتور استفاده شود</em>
                      </span>
                      <input
                        type="checkbox"
                        checked={draft.isDefault}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            isDefault: e.target.checked,
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </div>

                <footer className="tables-manage-dialog-footer">
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    onClick={() => setDialogOpen(false)}
                  >
                    انصراف
                  </button>
                  <button
                    type="button"
                    className={`cp-btn cp-btn--primary${busy ? " is-loading" : ""}`}
                    disabled={busy}
                    onClick={saveDevice}
                  >
                    ذخیره
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
