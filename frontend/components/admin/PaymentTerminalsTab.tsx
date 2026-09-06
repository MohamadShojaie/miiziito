"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatPriceAsNumber, toPersianDigits } from "@/lib/format";
import {
  CONNECTION_TYPE_OPTIONS,
  PAYMENT_PROVIDER_OPTIONS,
  agentHealth,
  connectionTypeLabel,
  discoverTerminals,
  discoveredToTerminalDraft,
  isProviderConfigured,
  listPaymentTerminals,
  mutatePaymentTerminal,
  providerLabel,
  testDiscoveredTerminal,
  testTerminalConnection,
  type DiscoveredTerminal,
  type PaymentTerminal,
  type PosDiscoveryKind,
  type TerminalConnectionType,
} from "@/lib/payment";
import { getPrinterCapabilities, type PrinterCapabilities } from "@/lib/printer";
import { useToast } from "@/components/ToastProvider";
import { LoadingShimmer } from "@/components/admin/LoadingShimmer";
import { CpSelect } from "@/components/ui/CpSelect";

type Draft = {
  id?: string;
  name: string;
  provider: string;
  model: string;
  connectionType: TerminalConnectionType;
  host: string;
  port: string;
  protocol: string;
  serialPort: string;
  baudRate: string;
  bluetoothIdentifier: string;
  stationId: string;
  isActive: boolean;
  isDefault: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  provider: "simulator",
  model: "",
  connectionType: "network",
  host: "127.0.0.1",
  port: "",
  protocol: "tcp",
  serialPort: "",
  baudRate: "9600",
  bluetoothIdentifier: "",
  stationId: "",
  isActive: true,
  isDefault: false,
};

function endpointLabel(t: PaymentTerminal): string {
  if (t.connectionType === "network") {
    const parts = [t.host, t.port].filter(Boolean);
    return parts.length ? parts.join(":") : "شبکه";
  }
  if (t.connectionType === "serial" || t.connectionType === "usb") {
    return t.serialPort || t.connectionType;
  }
  if (t.connectionType === "bluetooth") {
    return t.bluetoothIdentifier || "بلوتوث";
  }
  return connectionTypeLabel(t.connectionType);
}

function discoveredEndpointLabel(d: DiscoveredTerminal): string {
  if (d.connectionType === "network") {
    const parts = [d.host, d.port].filter(Boolean);
    return parts.length ? parts.join(":") : "شبکه";
  }
  if (d.connectionType === "serial" || d.connectionType === "usb") {
    return d.serialPort || d.label || connectionTypeLabel(d.connectionType);
  }
  if (d.connectionType === "bluetooth") {
    return d.bluetoothIdentifier || d.label || "بلوتوث";
  }
  return d.label || connectionTypeLabel(d.connectionType);
}

export function PaymentTerminalsTab({ active }: { active: boolean }) {
  const { showToast } = useToast();
  const [terminals, setTerminals] = useState<PaymentTerminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [mounted, setMounted] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [agentOk, setAgentOk] = useState<boolean | null>(null);
  const [testPayId, setTestPayId] = useState<string | null>(null);
  const [confirmTestPay, setConfirmTestPay] = useState(false);
  const [q, setQ] = useState("");
  const [discoverKind, setDiscoverKind] = useState<PosDiscoveryKind>("network");
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredTerminal[]>([]);
  const [discoverMeta, setDiscoverMeta] = useState("");
  const [caps, setCaps] = useState<PrinterCapabilities | null>(null);

  useEffect(() => setMounted(true), []);

  function applyTerminals(rows: PaymentTerminal[]) {
    setTerminals(rows);
    setError("");
  }

  function load() {
    setLoading(true);
    setError("");
    return listPaymentTerminals()
      .then(applyTerminals)
      .catch(() => {
        setError("بارگذاری پایانه‌ها ناموفق بود");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!active) return;
    load();
    agentHealth()
      .then((h) => setAgentOk(!!h.ok && h.payment !== false))
      .catch(() => setAgentOk(false));
    getPrinterCapabilities()
      .then((data) => setCaps(data.capabilities || null))
      .catch(() => setCaps(null));
  }, [active]);

  useEffect(() => {
    if (!dialogOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) setDialogOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialogOpen, busy]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = [...terminals].sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name, "fa");
    });
    if (!needle) return rows;
    return rows.filter((t) => {
      const hay = `${t.name} ${t.provider} ${t.host} ${t.serialPort} ${providerLabel(t.provider)}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [terminals, q]);

  function openAdd(provider = "simulator") {
    setDraft({
      ...EMPTY_DRAFT,
      provider,
      name:
        PAYMENT_PROVIDER_OPTIONS.find((p) => p.id === provider)?.name ||
        "پایانه جدید",
      isDefault: terminals.length === 0,
    });
    setDialogOpen(true);
  }

  function openEdit(t: PaymentTerminal) {
    setDraft({
      id: t.id,
      name: t.name,
      provider: t.provider,
      model: t.model || "",
      connectionType: t.connectionType,
      host: t.host || "",
      port: t.port || "",
      protocol: String(t.protocol || "tcp"),
      serialPort: t.serialPort || "",
      baudRate: String(t.baudRate || 9600),
      bluetoothIdentifier: t.bluetoothIdentifier || "",
      stationId: t.stationId || "",
      isActive: t.isActive,
      isDefault: t.isDefault,
    });
    setDialogOpen(true);
  }

  function openFromDiscovery(found: DiscoveredTerminal, provider = "generic") {
    const seed = discoveredToTerminalDraft(found, provider);
    setDraft({
      ...EMPTY_DRAFT,
      name: seed.name || found.name || "پایانه پرداخت",
      provider: seed.provider || provider,
      connectionType: seed.connectionType || "network",
      host: seed.host || "",
      port: String(seed.port || ""),
      protocol: String(seed.protocol || "tcp"),
      serialPort: seed.serialPort || "",
      baudRate: String(seed.baudRate || 9600),
      bluetoothIdentifier: seed.bluetoothIdentifier || "",
      model: seed.model || "",
      stationId: "",
      isActive: true,
      isDefault: terminals.length === 0,
    });
    setDialogOpen(true);
  }

  async function runDiscover(kind: PosDiscoveryKind) {
    setDiscoverKind(kind);
    setScanning(true);
    setDiscoverMeta("");
    setDiscovered([]);
    try {
      const data = await discoverTerminals(kind);
      setDiscovered(data.devices || []);
      const bits = [
        data.localIp ? `IP محلی: ${data.localIp}` : "",
        data.subnet ? `شبکه: ${data.subnet}` : "",
        data.scanned != null
          ? `${toPersianDigits(data.scanned)} آدرس اسکن شد`
          : "",
        data.message || "",
      ].filter(Boolean);
      setDiscoverMeta(bits.join(" · "));
      if (!(data.devices || []).length) {
        showToast(data.message || "پایانه‌ای پیدا نشد");
      }
    } catch {
      showToast("جستجوی پایانه ناموفق بود", "error");
    } finally {
      setScanning(false);
    }
  }

  async function runDiscoveredTest(found: DiscoveredTerminal) {
    setTestingId(found.id);
    try {
      const result = await testDiscoveredTerminal(found);
      if (result.ok) {
        showToast(result.message || "اتصال برقرار است", "success");
      } else {
        showToast(result.message || "اتصال ناموفق", "error");
      }
    } catch {
      showToast("تست اتصال ناموفق بود", "error");
    } finally {
      setTestingId(null);
    }
  }

  async function saveDraft() {
    if (!draft.name.trim()) {
      showToast("نام پایانه الزامی است", "error");
      return;
    }
    setBusy(true);
    try {
      const data = await mutatePaymentTerminal({
        action: draft.id ? "update" : "add",
        id: draft.id,
        name: draft.name.trim(),
        provider: draft.provider,
        model: draft.model,
        connectionType: draft.connectionType,
        host: draft.host,
        port: draft.port,
        protocol: draft.protocol,
        serialPort: draft.serialPort,
        baudRate: Number(draft.baudRate) || 9600,
        bluetoothIdentifier: draft.bluetoothIdentifier,
        stationId: draft.stationId,
        isActive: draft.isActive,
        isDefault: draft.isDefault,
        configuration: {},
      });
      applyTerminals(data.terminals);
      setDialogOpen(false);
      showToast(draft.id ? "پایانه به‌روز شد" : "پایانه اضافه شد", "success");
    } catch {
      showToast("ذخیره پایانه ناموفق بود", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeTerminal(t: PaymentTerminal) {
    if (!window.confirm(`«${t.name}» حذف شود؟`)) return;
    setBusy(true);
    try {
      const data = await mutatePaymentTerminal({ action: "remove", id: t.id });
      applyTerminals(data.terminals);
      showToast("پایانه حذف شد", "success");
    } catch {
      showToast("حذف ناموفق بود", "error");
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(t: PaymentTerminal) {
    setBusy(true);
    try {
      const data = await mutatePaymentTerminal({
        action: "set_default",
        id: t.id,
      });
      applyTerminals(data.terminals);
      showToast("پایانه پیش‌فرض تنظیم شد", "success");
    } catch {
      showToast("تنظیم پیش‌فرض ناموفق بود", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(t: PaymentTerminal) {
    setBusy(true);
    try {
      const data = await mutatePaymentTerminal({
        action: "toggle",
        id: t.id,
        isActive: !t.isActive,
      });
      applyTerminals(data.terminals);
    } catch {
      showToast("تغییر وضعیت ناموفق بود", "error");
    } finally {
      setBusy(false);
    }
  }

  async function runTest(id: string) {
    setTestingId(id);
    try {
      const result = await testTerminalConnection(id);
      if (result.ok) showToast(result.message || "اتصال برقرار است", "success");
      else showToast(result.message || "اتصال ناموفق", "error");
    } catch {
      showToast("تست اتصال ناموفق بود", "error");
    } finally {
      setTestingId(null);
    }
  }

  async function runTestPayment() {
    if (!testPayId) return;
    const t = terminals.find((x) => x.id === testPayId);
    if (!t) return;
    if (!isProviderConfigured(t.provider)) {
      showToast("این ارائه‌دهنده پیکربندی نشده است", "error");
      setConfirmTestPay(false);
      return;
    }
    setBusy(true);
    try {
      const { createAndSale, newPaymentId } = await import("@/lib/payment");
      const { payment, result } = await createAndSale({
        invoiceId: "TEST",
        amount: 1000,
        terminalId: t.id,
        paymentId: newPaymentId(),
        metadata: { testPayment: true },
      });
      if (payment.status === "SUCCESS" || result.status === "SUCCESS") {
        showToast(
          `پرداخت آزمایشی موفق — پیگیری ${result.referenceNumber || "—"}`,
          "success"
        );
      } else {
        showToast(result.message || `وضعیت: ${payment.status}`, "error");
      }
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "پرداخت آزمایشی ناموفق",
        "error"
      );
    } finally {
      setBusy(false);
      setConfirmTestPay(false);
      setTestPayId(null);
    }
  }

  if (!active) return null;

  const configuredCount = terminals.filter((t) =>
    isProviderConfigured(t.provider)
  ).length;

  return (
    <div className="hardware-page payment-terminals-page">
      <header className="hardware-header">
        <div>
          <h3 className="hardware-title">پایانه‌های پرداخت</h3>
          <p className="hardware-subtitle">
            کارتخوان از طریق عامل محلی به صندوق وصل می‌شود — جدا از پرینتر
          </p>
        </div>
        <div className="hardware-header-actions">
          <button
            type="button"
            className="cp-btn cp-btn--primary"
            onClick={() => openAdd("simulator")}
          >
            + پایانه جدید
          </button>
        </div>
      </header>

      <section className="payment-agent-banner" aria-label="وضعیت عامل پرداخت">
        <div>
          <h4>عامل محلی پرداخت</h4>
          <p>
            {agentOk === null
              ? "در حال بررسی…"
              : agentOk
                ? "عامل آماده است — تست اتصال و پرداخت آزمایشی در دسترس است."
                : "عامل در دسترس نیست. برای کارتخوان واقعی، API محلی صندوق را اجرا کنید. شبیه‌ساز همچنان کار می‌کند."}
          </p>
        </div>
        <span
          className={`payment-agent-status${
            agentOk === true
              ? " is-ok"
              : agentOk === false
                ? " is-down"
                : ""
          }`}
        >
          {agentOk === null ? "…" : agentOk ? "آماده" : "قطع"}
        </span>
      </section>

      <section className="printer-discover" aria-label="کشف پایانه پرداخت">
        <div className="printer-discover-head">
          <div>
            <h4>کشف کارتخوان / POS</h4>
            <p>
              شبکه: پورت‌های رایج ۸۰۸۰، ۸۴۴۳، ۹۰۰۰، ۵۰۰۰، ۹۱۰۰ · بلوتوث و USB
              روی میزبان صندوق اسکن می‌شوند
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
            <button
              type="button"
              className={`cp-btn cp-btn--ghost${discoverKind === "serial" && scanning ? " is-loading" : ""}`}
              disabled={scanning || busy}
              onClick={() => runDiscover("serial")}
            >
              سریال
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
            {discovered.map((d) => (
              <li key={d.id} className="printer-discover-row">
                <div>
                  <strong>{d.name || d.label || "پایانه"}</strong>
                  <small>
                    {connectionTypeLabel(d.connectionType)} ·{" "}
                    {discoveredEndpointLabel(d)}
                    {d.note ? ` · ${d.note}` : ""}
                  </small>
                  <em>{d.status || "discovered"}</em>
                </div>
                <div className="printer-discover-row-actions">
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost hardware-row-btn"
                    disabled={busy || scanning || testingId === d.id}
                    onClick={() => runDiscoveredTest(d)}
                  >
                    {testingId === d.id ? "…" : "تست"}
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--primary hardware-row-btn"
                    disabled={busy || scanning}
                    onClick={() => openFromDiscovery(d)}
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
        <div className="hardware-quick-grid payment-provider-grid">
          {PAYMENT_PROVIDER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="hardware-quick-card"
              onClick={() => openAdd(opt.id)}
            >
              <strong>{opt.name}</strong>
              <em>
                {opt.configured
                  ? opt.description || "آماده برای تست"
                  : "پیکربندی نشده — فقط ثبت تنظیمات"}
              </em>
              <span>
                {opt.configured ? "قابل استفاده" : "نیاز به مستندات"}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="hardware-toolbar">
        <input
          type="search"
          className="hardware-search"
          placeholder="جستجو نام، PSP یا آدرس…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="hardware-filters" aria-hidden="true">
          <span className="hardware-filter is-active">
            همه ({toPersianDigits(terminals.length)})
          </span>
          <span className="hardware-filter">
            پیکربندی‌شده ({toPersianDigits(configuredCount)})
          </span>
        </div>
      </div>

      {error && terminals.length === 0 ? (
        <p className="hardware-error">{error}</p>
      ) : null}
      {error && terminals.length > 0 ? (
        <p className="hardware-error">
          آخرین بارگذاری کامل نشد — لیست فعلی ممکن است قدیمی باشد.
        </p>
      ) : null}

      {loading ? (
        <LoadingShimmer variant="list" />
      ) : filtered.length === 0 ? (
        <div className="hardware-empty">
          <p className="hardware-empty-title">هنوز پایانه‌ای ثبت نشده</p>
          <p className="hardware-empty-hint">
            برای تست بدون سخت‌افزار، «شبیه‌ساز» را اضافه کنید. برای کارتخوان واقعی
            بعداً ارائه‌دهنده را با مستندات رسمی وصل کنید.
          </p>
          <button
            type="button"
            className="cp-btn cp-btn--primary"
            onClick={() => openAdd("simulator")}
          >
            افزودن شبیه‌ساز
          </button>
        </div>
      ) : (
        <ul className="hardware-list">
          {filtered.map((t) => {
            const configured = isProviderConfigured(t.provider);
            return (
              <li
                key={t.id}
                className={`hardware-row${t.isActive ? "" : " is-disabled"}`}
              >
                <div className="hardware-row-main">
                  <strong>{t.name}</strong>
                  <small>
                    {providerLabel(t.provider)}
                    {!configured ? " · پیکربندی نشده" : ""}
                    {t.model ? ` · ${t.model}` : ""}
                  </small>
                  <em>
                    {connectionTypeLabel(t.connectionType)}
                    {endpointLabel(t) ? ` · ${endpointLabel(t)}` : ""}
                    {t.stationId ? ` · ایستگاه ${t.stationId}` : ""}
                  </em>
                </div>
                <div className="hardware-row-meta">
                  <span
                    className={`hardware-pill${t.isActive ? "" : " is-muted"}`}
                  >
                    {t.isActive ? "فعال" : "خاموش"}
                  </span>
                  {t.isDefault ? (
                    <span className="hardware-pill">پیش‌فرض</span>
                  ) : null}
                  <span
                    className={`hardware-pill${configured ? "" : " is-muted"}`}
                  >
                    {configured ? "آماده" : "بدون پروتکل"}
                  </span>
                </div>
                <div className="hardware-row-actions">
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost hardware-row-btn"
                    disabled={busy || testingId === t.id}
                    onClick={() => runTest(t.id)}
                  >
                    {testingId === t.id ? "…" : "تست"}
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost hardware-row-btn"
                    disabled={busy || !configured}
                    title={
                      configured
                        ? "تراکنش آزمایشی ۱٬۰۰۰ تومان"
                        : "ارائه‌دهنده پیکربندی نشده"
                    }
                    onClick={() => {
                      setTestPayId(t.id);
                      setConfirmTestPay(true);
                    }}
                  >
                    پرداخت آزمایشی
                  </button>
                  {!t.isDefault ? (
                    <button
                      type="button"
                      className="cp-btn cp-btn--ghost hardware-row-btn"
                      disabled={busy}
                      onClick={() => setDefault(t)}
                    >
                      پیش‌فرض
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost hardware-row-btn"
                    disabled={busy}
                    onClick={() => toggleActive(t)}
                  >
                    {t.isActive ? "خاموش" : "روشن"}
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost hardware-row-btn"
                    disabled={busy}
                    onClick={() => openEdit(t)}
                  >
                    ویرایش
                  </button>
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost hardware-row-btn is-danger"
                    disabled={busy}
                    onClick={() => removeTerminal(t)}
                  >
                    حذف
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {mounted && dialogOpen
        ? createPortal(
            <div
              className="table-glass-overlay"
              onClick={(e) => {
                if (e.target === e.currentTarget && !busy) setDialogOpen(false);
              }}
            >
              <div
                className="table-glass-dialog menu-glass-dialog hardware-glass-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="payment-terminal-dialog-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4
                      id="payment-terminal-dialog-title"
                      className="table-glass-title"
                    >
                      {draft.id ? "ویرایش پایانه" : "پایانه جدید"}
                    </h4>
                    <p className="table-glass-sub">
                      ارائه‌دهنده و نحوه اتصال را مشخص کنید
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

                <div className="hardware-form">
                  <label className="hardware-field">
                    <span>نام</span>
                    <input
                      className="cp-input"
                      value={draft.name}
                      disabled={busy}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, name: e.target.value }))
                      }
                    />
                  </label>

                  <div className="hardware-field-row">
                    <label className="hardware-field">
                      <span>ارائه‌دهنده</span>
                      <CpSelect
                        value={draft.provider}
                        disabled={busy}
                        onChange={(v) =>
                          setDraft((d) => ({ ...d, provider: v }))
                        }
                        options={PAYMENT_PROVIDER_OPTIONS.map(
                          (p) =>
                            [
                              p.id,
                              p.configured
                                ? p.name
                                : `${p.name} (پیکربندی نشده)`,
                            ] as const
                        )}
                      />
                    </label>
                    <label className="hardware-field">
                      <span>نوع اتصال</span>
                      <CpSelect
                        value={draft.connectionType}
                        disabled={busy}
                        onChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            connectionType: v as TerminalConnectionType,
                          }))
                        }
                        options={CONNECTION_TYPE_OPTIONS.map(
                          (c) => [c.id, c.title] as const
                        )}
                      />
                    </label>
                  </div>

                  {draft.connectionType === "network" ? (
                    <div className="hardware-field-row">
                      <label className="hardware-field">
                        <span>آدرس IP</span>
                        <input
                          className="cp-input"
                          value={draft.host}
                          disabled={busy}
                          dir="ltr"
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, host: e.target.value }))
                          }
                        />
                      </label>
                      <label className="hardware-field">
                        <span>پورت</span>
                        <input
                          className="cp-input"
                          value={draft.port}
                          disabled={busy}
                          dir="ltr"
                          placeholder="پورت پروتکل پرداخت"
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, port: e.target.value }))
                          }
                        />
                      </label>
                    </div>
                  ) : null}

                  {draft.connectionType === "network" ? (
                    <label className="hardware-field">
                      <span>پروتکل</span>
                      <CpSelect
                        value={draft.protocol}
                        disabled={busy}
                        onChange={(v) =>
                          setDraft((d) => ({ ...d, protocol: v }))
                        }
                        options={
                          [
                            ["tcp", "TCP"],
                            ["http", "HTTP"],
                            ["https", "HTTPS"],
                            ["websocket", "WebSocket"],
                            ["vendor", "Vendor"],
                          ] as const
                        }
                      />
                    </label>
                  ) : null}

                  {draft.connectionType === "serial" ||
                  draft.connectionType === "usb" ? (
                    <div className="hardware-field-row">
                      <label className="hardware-field">
                        <span>پورت سریال / USB</span>
                        <input
                          className="cp-input"
                          value={draft.serialPort}
                          disabled={busy}
                          dir="ltr"
                          placeholder="COM3 یا /dev/tty.usb…"
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              serialPort: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="hardware-field">
                        <span>Baud</span>
                        <input
                          className="cp-input"
                          value={draft.baudRate}
                          disabled={busy}
                          dir="ltr"
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              baudRate: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                  ) : null}

                  {draft.connectionType === "bluetooth" ? (
                    <label className="hardware-field">
                      <span>شناسه بلوتوث</span>
                      <input
                        className="cp-input"
                        value={draft.bluetoothIdentifier}
                        disabled={busy}
                        dir="ltr"
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            bluetoothIdentifier: e.target.value,
                          }))
                        }
                      />
                    </label>
                  ) : null}

                  <div className="hardware-field-row">
                    <label className="hardware-field">
                      <span>مدل (اختیاری)</span>
                      <input
                        className="cp-input"
                        value={draft.model}
                        disabled={busy}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, model: e.target.value }))
                        }
                      />
                    </label>
                    <label className="hardware-field">
                      <span>ایستگاه / صندوق</span>
                      <input
                        className="cp-input"
                        value={draft.stationId}
                        disabled={busy}
                        dir="ltr"
                        placeholder="اختیاری"
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            stationId: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <label className="hardware-toggle">
                    <span>فعال</span>
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      disabled={busy}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          isActive: e.target.checked,
                        }))
                      }
                    />
                  </label>
                  <label className="hardware-toggle">
                    <span>پیش‌فرض این صندوق</span>
                    <input
                      type="checkbox"
                      checked={draft.isDefault}
                      disabled={busy}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          isDefault: e.target.checked,
                        }))
                      }
                    />
                  </label>
                </div>

                <footer className="menu-glass-actions">
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    disabled={busy}
                    onClick={() => setDialogOpen(false)}
                  >
                    انصراف
                  </button>
                  <button
                    type="button"
                    className={`cp-btn cp-btn--primary${busy ? " is-loading" : ""}`}
                    disabled={busy}
                    onClick={saveDraft}
                  >
                    ذخیره
                  </button>
                </footer>
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && confirmTestPay
        ? createPortal(
            <div
              className="table-glass-overlay"
              role="dialog"
              aria-modal="true"
              onClick={(e) => {
                if (e.target === e.currentTarget && !busy) {
                  setConfirmTestPay(false);
                  setTestPayId(null);
                }
              }}
            >
              <div
                className="table-glass-dialog menu-glass-dialog hardware-glass-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="table-glass-head">
                  <div>
                    <h4 className="table-glass-title">پرداخت آزمایشی</h4>
                    <p className="table-glass-sub">
                      مبلغ {formatPriceAsNumber(1000)} تومان — تراکنش واقعی یا
                      شبیه‌سازی‌شده
                    </p>
                  </div>
                </header>
                <footer className="menu-glass-actions">
                  <button
                    type="button"
                    className="cp-btn cp-btn--ghost"
                    disabled={busy}
                    onClick={() => {
                      setConfirmTestPay(false);
                      setTestPayId(null);
                    }}
                  >
                    انصراف
                  </button>
                  <button
                    type="button"
                    className={`cp-btn cp-btn--primary${busy ? " is-loading" : ""}`}
                    disabled={busy}
                    onClick={runTestPayment}
                  >
                    ادامه
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
