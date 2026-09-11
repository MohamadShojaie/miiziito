"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  apiJson,
  getCashierRole,
  getCashierToken,
  getEmployeeSection,
  getEmployeeSectionAccess,
  isAlertMuted,
  isDevMode,
  isManagerSession,
  setAlertMuted,
  setCashierToken,
} from "@/lib/api";
import { DEFAULT_CAFE_NAME_FA } from "@/lib/brand";
import { setMenuTenantSlug } from "@/lib/tenant";
import type { Order, TablesPayload } from "@/lib/types";
import {
  isCashierEmployee,
  isTaskOnlyEmployee,
} from "@/lib/staff-ops";
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
import { CostingTab } from "@/components/admin/CostingTab";
import { StaffOpsTab } from "@/components/admin/StaffOpsTab";
import { StaffHome } from "@/components/admin/StaffHome";
import { HardwareTab } from "@/components/admin/HardwareTab";
import { PaymentTerminalsTab } from "@/components/admin/PaymentTerminalsTab";
import { ReservationsTab } from "@/components/admin/ReservationsTab";
import { ComposeModal } from "@/components/admin/ComposeModal";
import {
  TAB_ICONS,
  IconClose,
  IconLock,
  IconLogout,
  IconPlus,
  IconSidebar,
  IconSoundOff,
  IconSoundOn,
} from "@/components/admin/CashierIcons";
import { PlanAccessProvider } from "@/components/admin/PlanAccess";
import {
  UpgradePlanModal,
  UpgradePlanPanel,
} from "@/components/admin/UpgradePlanModal";
import {
  TAB_FEATURE,
  UNLOCKED_ACCESS,
  hasPlanFeature,
  normalizePlanAccess,
  type PlanAccess,
  type PlanFeature,
} from "@/lib/plan-access";

type Tab =
  | "orders"
  | "invoices"
  | "reservations"
  | "tables"
  | "menu"
  | "stats"
  | "customers"
  | "coupons"
  | "costing"
  | "staff"
  | "tasks"
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
  { id: "costing", label: "هزینه‌یابی" },
  { id: "staff", label: "پرسنل" },
  { id: "tasks", label: "وظایف من" },
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
  costing: "هزینه‌یابی",
  staff: "پرسنل",
  tasks: "وظایف من",
  hardware: "سخت‌افزار",
  payments: "پایانه‌های پرداخت",
  settings: "تنظیمات",
};

const CASHIER_EMPLOYEE_TABS: Tab[] = [
  "orders",
  "invoices",
  "reservations",
  "tables",
  "menu",
  "payments",
  "tasks",
];

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
  const [planAccess, setPlanAccess] = useState<PlanAccess>(UNLOCKED_ACCESS);
  const [upgradeFeature, setUpgradeFeature] = useState<PlanFeature | null>(null);

  const sessionRole = getCashierRole(tenantSlug);
  const sessionSection = getEmployeeSection(tenantSlug);
  const sessionAccess = getEmployeeSectionAccess(tenantSlug) || sessionSection;
  const taskOnly = isTaskOnlyEmployee(sessionRole, sessionAccess);
  const cashierEmp = isCashierEmployee(sessionRole, sessionAccess);
  const manager = isManagerSession(tenantSlug);

  const requestUpgrade = useCallback((feature: PlanFeature) => {
    setUpgradeFeature(feature);
  }, []);

  function applyAccess(raw: unknown) {
    setPlanAccess(normalizePlanAccess(raw));
  }

  function selectTab(next: Tab) {
    const feature = TAB_FEATURE[next];
    if (feature && !hasPlanFeature(planAccess, feature)) {
      requestUpgrade(feature);
      return;
    }
    setTab(next);
  }

  const lockedTabFeature = TAB_FEATURE[tab];
  const tabLocked = !!(
    lockedTabFeature && !hasPlanFeature(planAccess, lockedTabFeature)
  );

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
    apiJson<{
      settings?: { restaurantNameEn?: string };
      access?: unknown;
    }>("/api/settings")
      .then((data) => {
        if (data.access) applyAccess(data.access);
        setToken(stored);
      })
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
      access?: unknown;
    }>("/api/settings")
      .then((data) => {
        if (data.access) applyAccess(data.access);
        const name =
          data.settings?.restaurantNameFa?.trim() ||
          data.settings?.restaurantNameEn?.trim();
        if (name) setBrandName(name);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (cashierEmp && !CASHIER_EMPLOYEE_TABS.includes(tab)) {
      setTab("orders");
      return;
    }
    if (!manager && tab === "staff") {
      setTab(cashierEmp ? "tasks" : "orders");
    }
  }, [token, tab, cashierEmp, manager]);

  const live = useOrdersLive(!!token && !taskOnly);

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

  if (taskOnly) {
    return (
      <div className="cashier-panel-overlay is-open staff-home-overlay">
        <div className="cashier-panel cp-app staff-home-shell" role="dialog">
          <StaffHome active tenantSlug={tenantSlug} onLogout={logout} />
        </div>
      </div>
    );
  }

  const visibleTabs = TABS.filter((t) => {
    if (t.id === "staff") return manager;
    if (t.id === "tasks") return cashierEmp;
    if (cashierEmp) return CASHIER_EMPLOYEE_TABS.includes(t.id);
    return true;
  });

  return (
    <PlanAccessProvider access={planAccess} onUpgrade={requestUpgrade}>
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
            {visibleTabs.map((t) => {
              const Icon = TAB_ICONS[t.id];
              const active = tab === t.id;
              const feature = TAB_FEATURE[t.id];
              const locked = !!(feature && !hasPlanFeature(planAccess, feature));
              const pendingCount =
                t.id === "reservations" && !locked
                  ? live.reservations.filter((r) => r.status === "pending")
                      .length
                  : 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`cp-nav-item cashier-tab${active ? " is-active" : ""}${locked ? " is-locked" : ""}`}
                  role="tab"
                  aria-selected={active}
                  aria-disabled={locked}
                  title={locked ? `${t.label} — قفل` : t.label}
                  onClick={() => selectTab(t.id)}
                >
                  <span className="cp-nav-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className="cp-nav-label">{t.label}</span>
                  {locked ? (
                    <span className="cp-nav-lock" aria-hidden="true">
                      <IconLock size={14} />
                    </span>
                  ) : pendingCount > 0 ? (
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
                    if (!hasPlanFeature(planAccess, "crm")) {
                      requestUpgrade("crm");
                      return;
                    }
                    setFocusCustomerId(customerId);
                    setTab("customers");
                  }}
                  onPatched={applyPatch}
                  onCompose={(order) => {
                    setEditOrder(order || null);
                    setComposeOpen(true);
                  }}
                  onGoInvoices={() => selectTab("invoices")}
                />
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "invoices" ? " is-active" : ""}`}
              id="cashier-tab-invoices"
              hidden={tab !== "invoices"}
            >
              {tab === "invoices" ? (
                tabLocked && lockedTabFeature === "invoices" ? (
                  <UpgradePlanPanel
                    feature="invoices"
                    planName={planAccess.planName}
                    onUpgrade={() => requestUpgrade("invoices")}
                  />
                ) : (
                  <InvoicesTab
                    invoices={live.invoices}
                    loading={live.loading}
                    focusInvoiceId={focusInvoiceId}
                    onFocusInvoiceConsumed={() => setFocusInvoiceId(null)}
                    onPatched={applyPatch}
                  />
                )
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "reservations" ? " is-active" : ""}`}
              id="cashier-tab-reservations"
              hidden={tab !== "reservations"}
            >
              {tab === "reservations" ? (
                tabLocked && lockedTabFeature === "reservations" ? (
                  <UpgradePlanPanel
                    feature="reservations"
                    planName={planAccess.planName}
                    onUpgrade={() => requestUpgrade("reservations")}
                  />
                ) : (
                  <ReservationsTab
                    reservations={live.reservations}
                    loading={live.loading}
                    onPatched={applyPatch}
                  />
                )
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
                  onGoInvoices={() => selectTab("invoices")}
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
                tabLocked && lockedTabFeature === "advancedAnalytics" ? (
                  <UpgradePlanPanel
                    feature="advancedAnalytics"
                    planName={planAccess.planName}
                    onUpgrade={() => requestUpgrade("advancedAnalytics")}
                  />
                ) : (
                  <StatsTab
                    active={tab === "stats"}
                    invoices={live.invoices}
                    onPatched={applyPatch}
                  />
                )
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "customers" ? " is-active" : ""}`}
              id="cashier-tab-customers"
              hidden={tab !== "customers"}
            >
              {tab === "customers" ? (
                tabLocked && lockedTabFeature === "crm" ? (
                  <UpgradePlanPanel
                    feature="crm"
                    planName={planAccess.planName}
                    onUpgrade={() => requestUpgrade("crm")}
                  />
                ) : (
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
                        selectTab("invoices");
                        return;
                      }
                      if (visit.orderId) {
                        setFocusOrderId(visit.orderId);
                        setTab("orders");
                      } else if (visit.invoiceId) {
                        setFocusInvoiceId(visit.invoiceId);
                        selectTab("invoices");
                      }
                    }}
                  />
                )
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "coupons" ? " is-active" : ""}`}
              id="cashier-tab-coupons"
              hidden={tab !== "coupons"}
            >
              {tab === "coupons" ? (
                tabLocked && lockedTabFeature === "coupons" ? (
                  <UpgradePlanPanel
                    feature="coupons"
                    planName={planAccess.planName}
                    onUpgrade={() => requestUpgrade("coupons")}
                  />
                ) : (
                  <CouponsTab active={tab === "coupons"} />
                )
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "costing" ? " is-active" : ""}`}
              id="cashier-tab-costing"
              hidden={tab !== "costing"}
            >
              {tab === "costing" ? (
                tabLocked && lockedTabFeature === "menuCosting" ? (
                  <UpgradePlanPanel
                    feature="menuCosting"
                    planName={planAccess.planName}
                    onUpgrade={() => requestUpgrade("menuCosting")}
                  />
                ) : (
                  <CostingTab active={tab === "costing"} />
                )
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "staff" ? " is-active" : ""}`}
              id="cashier-tab-staff"
              hidden={tab !== "staff"}
            >
              {tab === "staff" && manager ? (
                tabLocked && lockedTabFeature === "staffOps" ? (
                  <UpgradePlanPanel
                    feature="staffOps"
                    planName={planAccess.planName}
                    onUpgrade={() => requestUpgrade("staffOps")}
                  />
                ) : (
                  <StaffOpsTab active={tab === "staff"} />
                )
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "tasks" ? " is-active" : ""}`}
              id="cashier-tab-tasks"
              hidden={tab !== "tasks"}
            >
              {tab === "tasks" && cashierEmp ? (
                <StaffHome active={tab === "tasks"} tenantSlug={tenantSlug} />
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "hardware" ? " is-active" : ""}`}
              id="cashier-tab-hardware"
              hidden={tab !== "hardware"}
            >
              {tab === "hardware" ? (
                tabLocked && lockedTabFeature === "hardware" ? (
                  <UpgradePlanPanel
                    feature="hardware"
                    planName={planAccess.planName}
                    onUpgrade={() => requestUpgrade("hardware")}
                  />
                ) : (
                  <HardwareTab active={tab === "hardware"} />
                )
              ) : null}
            </div>
            <div
              className={`cashier-tab-panel${tab === "payments" ? " is-active" : ""}`}
              id="cashier-tab-payments"
              hidden={tab !== "payments"}
            >
              {tab === "payments" ? (
                tabLocked && lockedTabFeature === "paymentTerminal" ? (
                  <UpgradePlanPanel
                    feature="paymentTerminal"
                    planName={planAccess.planName}
                    onUpgrade={() => requestUpgrade("paymentTerminal")}
                  />
                ) : (
                  <PaymentTerminalsTab active={tab === "payments"} />
                )
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
      <UpgradePlanModal
        open={!!upgradeFeature}
        feature={upgradeFeature}
        planName={planAccess.planName}
        onClose={() => setUpgradeFeature(null)}
      />
    </div>
    </PlanAccessProvider>
  );
}
