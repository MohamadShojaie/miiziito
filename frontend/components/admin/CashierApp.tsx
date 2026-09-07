"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  apiJson,
  getCashierToken,
  isAlertMuted,
  isDevMode,
  setAlertMuted,
  setCashierToken,
} from "@/lib/api";
import { DEFAULT_CAFE_NAME_FA } from "@/lib/brand";
import { setMenuTenantSlug } from "@/lib/tenant";
import type { Order, TablesPayload } from "@/lib/types";
import { useOrdersLive } from "@/hooks/useOrdersLive";
import { useToast } from "@/components/ToastProvider";
import { CashierLoginModal } from "@/components/admin/CashierLoginModal";
import { OrdersTab } from "@/components/admin/OrdersTab";
import { InvoicesTab } from "@/components/admin/InvoicesTab";
import { TablesTab } from "@/components/admin/TablesTab";
import { MenuAdminTab } from "@/components/admin/MenuAdminTab";
import { StatsTab } from "@/components/admin/StatsTab";
import { SettingsTab } from "@/components/admin/SettingsTab";
import { CrmTab } from "@/components/admin/CrmTab";
import { CouponsTab } from "@/components/admin/CouponsTab";
import { HardwareTab } from "@/components/admin/HardwareTab";
import { PaymentTerminalsTab } from "@/components/admin/PaymentTerminalsTab";
import { ReservationsTab } from "@/components/admin/ReservationsTab";
import { ComposeModal } from "@/components/admin/ComposeModal";
import {
  TAB_ICONS,
  IconClose,
  IconLogout,
  IconPlus,
  IconSidebar,
  IconSoundOff,
  IconSoundOn,
} from "@/components/admin/CashierIcons";

type Tab =
  | "orders"
  | "invoices"
  | "reservations"
  | "tables"
  | "menu"
  | "stats"
  | "customers"
  | "coupons"
  | "hardware"
  | "payments"
  | "settings";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "orders", label: "سفارش‌ها" },
  { id: "invoices", label: "فاکتورها" },
  { id: "reservations", label: "رزروها" },
  { id: "tables", label: "میزها" },
  { id: "menu", label: "منو" },
  { id: "stats", label: "آمار فروش" },
  { id: "customers", label: "باشگاه مشتریان" },
  { id: "coupons", label: "کوپن‌ها" },
  { id: "hardware", label: "سخت‌افزار" },
  { id: "payments", label: "پایانه‌های پرداخت" },
  { id: "settings", label: "تنظیمات" },
];

const TAB_TITLES: Record<Tab, string> = {
  orders: "سفارش‌ها",
  invoices: "فاکتورها",
  reservations: "رزروها",
  tables: "میزها",
  menu: "منو",
  stats: "آمار فروش",
  customers: "باشگاه مشتریان",
  coupons: "کوپن‌ها",
  hardware: "سخت‌افزار",
  payments: "پایانه‌های پرداخت",
  settings: "تنظیمات",
};

export function CashierApp({ tenantSlug = "" }: { tenantSlug?: string }) {
  const [brandName, setBrandName] = useState(DEFAULT_CAFE_NAME_FA);
  const { showToast } = useToast();
  const [token, setToken] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState<Tab>("orders");
  const [muted, setMuted] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);
  const [focusInvoiceId, setFocusInvoiceId] = useState<string | null>(null);
  const [focusCustomerId, setFocusCustomerId] = useState<string | null>(null);

  useEffect(() => {
    if (tenantSlug) setMenuTenantSlug(tenantSlug);
  }, [tenantSlug]);

  useEffect(() => {
    setMuted(isAlertMuted());
    const stored = getCashierToken(tenantSlug);
    if (!stored) {
      setToken("");
      setAuthReady(true);
      return;
    }
    apiJson<{ settings?: { restaurantNameEn?: string } }>("/api/settings")
      .then(() => setToken(stored))
      .catch(() => {
        setCashierToken("", tenantSlug);
        setToken("");
      })
      .finally(() => setAuthReady(true));
  }, [tenantSlug]);

  useEffect(() => {
    if (!token) return;
    apiJson<{
      settings?: { restaurantNameFa?: string; restaurantNameEn?: string };
    }>("/api/settings")
      .then((data) => {
        const name =
          data.settings?.restaurantNameFa?.trim() ||
          data.settings?.restaurantNameEn?.trim();
        if (name) setBrandName(name);
      })
      .catch(() => {});
  }, [token]);

  const live = useOrdersLive(!!token);

  const applyPatch = useCallback(
    (data: TablesPayload | { orders?: Order[] }) => {
      live.applyPayload(data as TablesPayload);
    },
    [live]
  );

  function logout() {
    apiJson("/api/logout", {
      method: "POST",
      body: JSON.stringify({ token }),
    }).catch(() => {});
    setCashierToken("", tenantSlug);
    setToken("");
  }

  if (!authReady) {
    return null;
  }

  if (!token) {
    return (
      <CashierLoginModal
        tenantSlug={tenantSlug}
        title="ورود به پنل مدیریت"
        submitLabel="ورود"
        closeHref={tenantSlug ? `/${tenantSlug}/` : "/"}
        onSuccess={() => setToken(getCashierToken(tenantSlug))}
      />
    );
  }

  return (
    <div
      className={`cashier-panel-overlay is-open${isDevMode(tenantSlug) ? " is-dev" : ""}`}
    >
      <div
        className={`cashier-panel cp-app${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}
        role="dialog"
      >
        <header className="cp-topbar cashier-panel-header">
          <div className="cp-topbar-start">
            <button
              type="button"
              className="cp-icon-btn cp-sidebar-toggle"
              aria-label={sidebarCollapsed ? "باز کردن منو" : "بستن منو"}
              aria-expanded={!sidebarCollapsed}
              onClick={() => setSidebarCollapsed((v) => !v)}
            >
              <IconSidebar size={18} />
            </button>
            <div className="cashier-panel-heading">
              <div className="cashier-panel-title-row">
                <h2 className="cashier-panel-title cp-topbar-title">
                  پنل {TAB_TITLES[tab]}
                </h2>
                <span
                  className={`sync-status is-${live.sync}`}
                  title={live.syncLabel}
                >
                  <span className="sync-status-dot" aria-hidden="true" />
                  <span className="sync-status-text">{live.syncLabel}</span>
                </span>
              </div>
              {isDevMode(tenantSlug) && !tenantSlug ? (
                <span className="dev-mode-banner">
                  حالت آزمایشی — این داده‌ها به کافه نمی‌رسد
                </span>
              ) : null}
            </div>
          </div>
          <div className="cashier-panel-actions cp-topbar-actions">
            <button
              type="button"
              className="cp-btn cp-btn--primary cp-topbar-new"
              onClick={() => {
                setEditOrder(null);
                setComposeOpen(true);
              }}
            >
              <IconPlus size={16} />
              <span>سفارش جدید</span>
            </button>
            <button
              type="button"
              className={`cp-icon-btn cashier-tool-btn alert-mute-btn${muted ? " is-muted" : ""}`}
              aria-pressed={muted}
              aria-label={muted ? "روشن کردن صدا" : "خاموش کردن صدا"}
              title={muted ? "صدا خاموش" : "صدا روشن"}
              onClick={() => {
                const next = !muted;
                setMuted(next);
                setAlertMuted(next);
                showToast(next ? "صدا خاموش شد" : "صدا روشن شد");
              }}
            >
              {muted ? <IconSoundOff size={18} /> : <IconSoundOn size={18} />}
            </button>
            <button
              type="button"
              className="cp-icon-btn cashier-tool-btn cashier-logout-btn"
              aria-label="خروج"
              title="خروج"
              onClick={logout}
            >
              <IconLogout size={18} />
            </button>
            <Link
              href="/"
              className="cp-icon-btn cashier-tool-btn cashier-close-btn"
              aria-label="بستن پنل"
              title="بستن"
            >
              <IconClose size={18} />
            </Link>
          </div>
        </header>

        <div className="cp-shell">
          <nav
            className="cp-sidebar cashier-tabs"
            role="tablist"
            aria-label="بخش‌های پنل"
          >
            <div className="cashier-tabs-brand" aria-hidden="true">
              <span className="cashier-tabs-brand-mark">
                {brandName.charAt(0).toUpperCase()}
              </span>
              <span className="cashier-tabs-brand-text">{brandName}</span>
            </div>
            {TABS.map((t) => {
              const Icon = TAB_ICONS[t.id];
              const active = tab === t.id;
              const pendingCount =
                t.id === "reservations"
                  ? live.reservations.filter((r) => r.status === "pending")
                      .length
                  : 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`cp-nav-item cashier-tab${active ? " is-active" : ""}`}
                  role="tab"
                  aria-selected={active}
                  title={t.label}
                  onClick={() => setTab(t.id)}
                >
                  <span className="cp-nav-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className="cp-nav-label">{t.label}</span>
                  {pendingCount > 0 ? (
                    <span className="cp-nav-badge" aria-label="درخواست جدید">
                      {pendingCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <main className="cp-main">
            <div
              className={`cashier-tab-panel${tab === "orders" ? " is-active" : ""}`}
              id="cashier-tab-orders"
              hidden={tab !== "orders"}
            >
              {tab === "orders" ? (
                <OrdersTab
                  orders={live.orders}
                  invoices={live.invoices}
                  tables={live.tables}
                  regions={live.regions}
                  loading={live.loading}
                  focusOrderId={focusOrderId}
                  onFocusOrderConsumed={() => setFocusOrderId(null)}
                  onOpenCustomer={(customerId) => {
                    setFocusCustomerId(customerId);
                    setTab("customers");
                  }}
                  onPatched={applyPatch}
                  onCompose={(order) => {
                    setEditOrder(order || null);
                    setComposeOpen(true);
                  }}
                  onGoInvoices={() => setTab("invoices")}
                />
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "invoices" ? " is-active" : ""}`}
              id="cashier-tab-invoices"
              hidden={tab !== "invoices"}
            >
              {tab === "invoices" ? (
                <InvoicesTab
                  invoices={live.invoices}
                  loading={live.loading}
                  focusInvoiceId={focusInvoiceId}
                  onFocusInvoiceConsumed={() => setFocusInvoiceId(null)}
                  onPatched={applyPatch}
                />
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "reservations" ? " is-active" : ""}`}
              id="cashier-tab-reservations"
              hidden={tab !== "reservations"}
            >
              {tab === "reservations" ? (
                <ReservationsTab
                  reservations={live.reservations}
                  loading={live.loading}
                  onPatched={applyPatch}
                />
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "tables" ? " is-active" : ""}`}
              id="cashier-tab-tables"
              hidden={tab !== "tables"}
            >
              {tab === "tables" ? (
                <TablesTab
                  tables={live.tables}
                  regions={live.regions}
                  orders={live.orders}
                  invoices={live.invoices}
                  loading={live.loading}
                  onUpdated={(data) => {
                    if (data.tables) live.setTables(data.tables);
                    if (data.regions) live.setRegions(data.regions);
                  }}
                  onPatched={applyPatch}
                  onCompose={(order) => {
                    setEditOrder(order || null);
                    setComposeOpen(true);
                  }}
                  onGoInvoices={() => setTab("invoices")}
                />
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "menu" ? " is-active" : ""}`}
              id="cashier-tab-menu"
              hidden={tab !== "menu"}
            >
              {tab === "menu" ? <MenuAdminTab /> : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "stats" ? " is-active" : ""}`}
              id="cashier-tab-stats"
              hidden={tab !== "stats"}
            >
              {tab === "stats" ? (
                <StatsTab
                  active={tab === "stats"}
                  invoices={live.invoices}
                  onPatched={applyPatch}
                />
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "customers" ? " is-active" : ""}`}
              id="cashier-tab-customers"
              hidden={tab !== "customers"}
            >
              {tab === "customers" ? (
                <CrmTab
                  active={tab === "customers"}
                  invoices={live.invoices}
                  orders={live.orders}
                  focusCustomerId={focusCustomerId}
                  onFocusCustomerConsumed={() => setFocusCustomerId(null)}
                  onOpenVisit={(visit) => {
                    if (visit.kind === "order" && visit.orderId) {
                      setFocusOrderId(visit.orderId);
                      setTab("orders");
                      return;
                    }
                    if (visit.kind === "invoice" && visit.invoiceId) {
                      setFocusInvoiceId(visit.invoiceId);
                      setTab("invoices");
                      return;
                    }
                    if (visit.orderId) {
                      setFocusOrderId(visit.orderId);
                      setTab("orders");
                    } else if (visit.invoiceId) {
                      setFocusInvoiceId(visit.invoiceId);
                      setTab("invoices");
                    }
                  }}
                />
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "coupons" ? " is-active" : ""}`}
              id="cashier-tab-coupons"
              hidden={tab !== "coupons"}
            >
              {tab === "coupons" ? (
                <CouponsTab active={tab === "coupons"} />
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "hardware" ? " is-active" : ""}`}
              id="cashier-tab-hardware"
              hidden={tab !== "hardware"}
            >
              {tab === "hardware" ? (
                <HardwareTab active={tab === "hardware"} />
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "payments" ? " is-active" : ""}`}
              id="cashier-tab-payments"
              hidden={tab !== "payments"}
            >
              {tab === "payments" ? (
                <PaymentTerminalsTab active={tab === "payments"} />
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "settings" ? " is-active" : ""}`}
              id="cashier-tab-settings"
              hidden={tab !== "settings"}
            >
              {tab === "settings" ? (
                <SettingsTab
                  active={tab === "settings"}
                  orders={live.orders}
                  invoices={live.invoices}
                />
              ) : null}
            </div>
          </main>
        </div>
      </div>

      <ComposeModal
        open={composeOpen}
        order={editOrder}
        tables={live.tables}
        regions={live.regions}
        invoices={live.invoices}
        onClose={() => {
          setComposeOpen(false);
          setEditOrder(null);
        }}
        onDone={(data) => applyPatch(data as TablesPayload)}
      />
    </div>
  );
}
