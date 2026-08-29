"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  clearSaSession,
  getSaAdminRaw,
  getSaToken,
  saFetch,
  setSaAdminRaw,
} from "@/lib/super-admin/api";
import type { AdminUser } from "@/lib/super-admin/types";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import { ToastHost } from "./ui/Toast";
import { LoginPage } from "./pages/LoginPage";
import { StorePage } from "./pages/StorePage";
import { CafePortalPage } from "./pages/CafePortalPage";
import { RechargeRequestsPage } from "./pages/RechargeRequestsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CafesPage } from "./pages/CafesPage";
import { CafeDetailPage } from "./pages/CafeDetailPage";
import { PlansPage, PlanDetailPage } from "./pages/PlansPage";
import {
  AdminUsersPage,
  AnalyticsPage,
  AuditLogsPage,
  CouponsPage,
  NotificationsPage,
  PaymentDetailPage,
  PaymentsPage,
  RolesPage,
  SubscriptionDetailPage,
  SubscriptionsPage,
  SupportDetailPage,
  SupportPage,
  SystemHealthPage,
  SystemSettingsPage,
} from "./pages/OpsPages";

type SessionKind = "admin" | "cafe" | null;
type CafeOwner = { id: string; email: string; name?: string; phone?: string; tenantId?: string };

function RedirectTo({ href, navigate }: { href: string; navigate: (h: string) => void }) {
  useEffect(() => {
    navigate(href);
  }, [href, navigate]);
  return (
    <div className="sa-login">
      <div style={{ color: "var(--sa-text-muted)" }}>در حال انتقال…</div>
    </div>
  );
}

function LoginGate({
  kind,
  mode,
  navigate,
  onAdmin,
  onCafe,
}: {
  kind: SessionKind;
  mode: "login" | "register";
  navigate: (h: string) => void;
  onAdmin: (a: AdminUser) => void;
  onCafe: (o: CafeOwner) => void;
}) {
  useEffect(() => {
    if (kind === "admin") navigate("/panel-admin/manage/");
    if (kind === "cafe") navigate("/panel-admin/account/");
  }, [kind, navigate]);
  if (kind === "admin" || kind === "cafe") {
    return (
      <div className="sa-login">
        <div style={{ color: "var(--sa-text-muted)" }}>در حال انتقال…</div>
      </div>
    );
  }
  return (
    <LoginPage
      initialMode={mode}
      onNavigate={navigate}
      onAdmin={onAdmin}
      onCafe={onCafe}
    />
  );
}

function normalizePath(pathname: string): string {
  let p = pathname || "/";
  if (!p.endsWith("/")) p += "/";
  return p;
}

function parseRoute(pathname: string, search: string) {
  const path = normalizePath(pathname);
  const params = new URLSearchParams(search);
  const status = params.get("status") || "";
  const plan = params.get("plan") || "";
  const cycle = params.get("cycle") || "";

  if (path === "/panel-admin/") return { name: "store" as const };
  if (path === "/panel-admin/login/") return { name: "login" as const };
  if (path === "/panel-admin/register/") return { name: "register" as const };
  if (path === "/panel-admin/account/") return { name: "account" as const, plan, cycle };
  if (path === "/panel-admin/manage/" || path === "/panel-admin/dashboard/")
    return { name: "dashboard" as const };
  if (path === "/panel-admin/requests/") return { name: "requests" as const };

  if (path === "/panel-admin/cafes/") return { name: "cafes" as const, status };
  const cafeMatch = path.match(/^\/panel-admin\/cafes\/([^/]+)\/$/);
  if (cafeMatch) return { name: "cafe" as const, id: decodeURIComponent(cafeMatch[1]) };

  const planMatch = path.match(/^\/panel-admin\/plans\/([^/]+)\/$/);
  if (path === "/panel-admin/plans/") return { name: "plans" as const };
  if (planMatch) return { name: "plan" as const, id: decodeURIComponent(planMatch[1]) };

  const subMatch = path.match(/^\/panel-admin\/subscriptions\/([^/]+)\/$/);
  if (path === "/panel-admin/subscriptions/") return { name: "subscriptions" as const, status };
  if (subMatch) return { name: "subscription" as const, id: decodeURIComponent(subMatch[1]) };

  const payMatch = path.match(/^\/panel-admin\/payments\/([^/]+)\/$/);
  if (path === "/panel-admin/payments/") return { name: "payments" as const, status };
  if (payMatch) return { name: "payment" as const, id: decodeURIComponent(payMatch[1]) };

  if (path === "/panel-admin/coupons/") return { name: "coupons" as const };
  if (path === "/panel-admin/analytics/") return { name: "analytics" as const, kind: "overview" };
  if (path === "/panel-admin/analytics/revenue/") return { name: "analytics" as const, kind: "revenue" };
  if (path === "/panel-admin/analytics/customers/") return { name: "analytics" as const, kind: "customers" };
  if (path === "/panel-admin/analytics/subscriptions/")
    return { name: "analytics" as const, kind: "subscriptions" };

  if (path === "/panel-admin/notifications/") return { name: "notifications" as const };
  if (path === "/panel-admin/support/") return { name: "support" as const };
  const tktMatch = path.match(/^\/panel-admin\/support\/([^/]+)\/$/);
  if (tktMatch) return { name: "support-item" as const, id: decodeURIComponent(tktMatch[1]) };

  if (path === "/panel-admin/system/" || path === "/panel-admin/system/health/")
    return { name: "health" as const };
  if (path === "/panel-admin/system/settings/") return { name: "settings" as const };
  if (path === "/panel-admin/audit-logs/") return { name: "audit" as const };
  if (path === "/panel-admin/admin-users/") return { name: "admin-users" as const };
  if (path === "/panel-admin/roles/") return { name: "roles" as const };

  return { name: "store" as const };
}

function readCachedSession(): { kind: SessionKind; admin: AdminUser | null; owner: CafeOwner | null } {
  try {
    const raw = getSaAdminRaw();
    if (!raw) return { kind: null, admin: null, owner: null };
    const parsed = JSON.parse(raw);
    if (parsed.kind === "cafe" && parsed.owner) {
      return { kind: "cafe", admin: null, owner: parsed.owner };
    }
    if (parsed.kind === "admin" && parsed.admin) {
      return { kind: "admin", admin: parsed.admin, owner: null };
    }
    // legacy: plain admin object
    if (parsed.email && parsed.roleId) {
      return { kind: "admin", admin: parsed as AdminUser, owner: null };
    }
  } catch {
    /* ignore */
  }
  return { kind: null, admin: null, owner: null };
}

export function PanelAdminApp() {
  const [path, setPath] = useState("/panel-admin/");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<SessionKind>(null);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [owner, setOwner] = useState<CafeOwner | null>(null);
  const [booting, setBooting] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("sa-panel-active");
    return () => document.body.classList.remove("sa-panel-active");
  }, []);

  const syncLocation = useCallback(() => {
    if (typeof window === "undefined") return;
    setPath(normalizePath(window.location.pathname));
    setSearch(window.location.search || "");
  }, []);

  const navigate = useCallback((href: string) => {
    const url = new URL(href, window.location.origin);
    window.history.pushState({}, "", url.pathname + url.search);
    setPath(normalizePath(url.pathname));
    setSearch(url.search || "");
  }, []);

  useEffect(() => {
    syncLocation();
    const onPop = () => syncLocation();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [syncLocation]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && kind === "admin") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kind]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const token = getSaToken();
      if (!token) {
        const cached = readCachedSession();
        if (!cancelled) {
          setKind(null);
          setAdmin(null);
          setOwner(null);
          void cached;
          setBooting(false);
        }
        return;
      }
      try {
        const me = await saFetch<{ kind: SessionKind; admin?: AdminUser; owner?: CafeOwner }>("sa-me");
        if (cancelled) return;
        if (me.kind === "admin" && me.admin) {
          setKind("admin");
          setAdmin(me.admin);
          setOwner(null);
          setSaAdminRaw(JSON.stringify({ kind: "admin", admin: me.admin }));
        } else if (me.kind === "cafe" && me.owner) {
          setKind("cafe");
          setOwner(me.owner);
          setAdmin(null);
          setSaAdminRaw(JSON.stringify({ kind: "cafe", owner: me.owner }));
        } else {
          clearSaSession();
          setKind(null);
          setAdmin(null);
          setOwner(null);
        }
      } catch {
        clearSaSession();
        if (!cancelled) {
          setKind(null);
          setAdmin(null);
          setOwner(null);
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    try {
      await saFetch("sa-logout", { method: "POST", body: "{}" });
    } catch {
      /* ignore */
    }
    clearSaSession();
    setKind(null);
    setAdmin(null);
    setOwner(null);
    navigate("/panel-admin/");
  }

  const route = useMemo(() => parseRoute(path, search), [path, search]);

  if (booting) {
    return (
      <div className="sa-root sa-rtl">
        <div className="sa-login">
          <div style={{ color: "var(--sa-text-muted)" }}>در حال بارگذاری…</div>
        </div>
      </div>
    );
  }

  // Public store — always available
  if (route.name === "store") {
    return (
      <div className="sa-root sa-rtl">
        <ToastHost>
          <StorePage
            onNavigate={navigate}
            isLoggedIn={kind !== null}
            kind={kind}
          />
        </ToastHost>
      </div>
    );
  }

  if (route.name === "login" || route.name === "register") {
    return (
      <div className="sa-root sa-rtl">
        <ToastHost>
          <LoginGate
            kind={kind}
            mode={route.name === "register" ? "register" : "login"}
            navigate={navigate}
            onAdmin={(a) => {
              setKind("admin");
              setAdmin(a);
              setOwner(null);
              navigate("/panel-admin/manage/");
            }}
            onCafe={(o) => {
              setKind("cafe");
              setOwner(o);
              setAdmin(null);
              const params = new URLSearchParams(window.location.search);
              const plan = params.get("plan");
              const cycle = params.get("cycle");
              let href = "/panel-admin/account/";
              if (plan) {
                href += `?plan=${encodeURIComponent(plan)}`;
                if (cycle) href += `&cycle=${encodeURIComponent(cycle)}`;
              }
              navigate(href);
            }}
          />
        </ToastHost>
      </div>
    );
  }

  if (route.name === "account") {
    if (kind !== "cafe") {
      return (
        <div className="sa-root sa-rtl">
          <ToastHost>
            <RedirectTo href="/panel-admin/login/?next=account" navigate={navigate} />
          </ToastHost>
        </div>
      );
    }
    return (
      <div className="sa-root sa-rtl">
        <ToastHost>
          <CafePortalPage
            onNavigate={navigate}
            onLogout={logout}
            preselectPlan={route.plan}
            preselectCycle={route.cycle}
          />
        </ToastHost>
      </div>
    );
  }

  // Admin-only area
  if (kind !== "admin" || !admin) {
    return (
      <div className="sa-root sa-rtl">
        <ToastHost>
          <RedirectTo href="/panel-admin/login/" navigate={navigate} />
        </ToastHost>
      </div>
    );
  }

  let content: ReactNode = <DashboardPage onNavigate={navigate} />;
  switch (route.name) {
    case "dashboard":
      content = <DashboardPage onNavigate={navigate} />;
      break;
    case "requests":
      content = <RechargeRequestsPage />;
      break;
    case "cafes":
      content = <CafesPage onNavigate={navigate} initialStatus={route.status} />;
      break;
    case "cafe":
      content = <CafeDetailPage id={route.id} onNavigate={navigate} />;
      break;
    case "plans":
      content = <PlansPage onNavigate={navigate} />;
      break;
    case "plan":
      content = <PlanDetailPage id={route.id} onNavigate={navigate} />;
      break;
    case "subscriptions":
      content = <SubscriptionsPage onNavigate={navigate} initialStatus={route.status} />;
      break;
    case "subscription":
      content = <SubscriptionDetailPage id={route.id} onNavigate={navigate} />;
      break;
    case "payments":
      content = <PaymentsPage onNavigate={navigate} initialStatus={route.status} />;
      break;
    case "payment":
      content = <PaymentDetailPage id={route.id} onNavigate={navigate} />;
      break;
    case "coupons":
      content = <CouponsPage />;
      break;
    case "analytics":
      content = <AnalyticsPage kind={route.kind === "overview" ? "revenue" : route.kind} />;
      break;
    case "notifications":
      content = <NotificationsPage />;
      break;
    case "support":
      content = <SupportPage onNavigate={navigate} />;
      break;
    case "support-item":
      content = <SupportDetailPage id={route.id} onNavigate={navigate} />;
      break;
    case "health":
      content = <SystemHealthPage />;
      break;
    case "settings":
      content = <SystemSettingsPage />;
      break;
    case "audit":
      content = <AuditLogsPage />;
      break;
    case "admin-users":
      content = <AdminUsersPage />;
      break;
    case "roles":
      content = <RolesPage />;
      break;
    default:
      content = <DashboardPage onNavigate={navigate} />;
  }

  return (
    <div className="sa-root sa-rtl">
      <ToastHost>
        <div className={`sa-drawer-backdrop ${sidebarOpen ? "is-open" : ""}`} onClick={() => setSidebarOpen(false)} />
        <div className="sa-shell">
          <Sidebar
            path={path + (search || "")}
            onNavigate={navigate}
            adminName={admin.name || admin.email}
            adminRole={admin.roleName}
            onLogout={logout}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
          <div className="sa-main">
            <header className="sa-topbar">
              <button
                type="button"
                className="sa-mobile-toggle"
                aria-label="منو"
                onClick={() => setSidebarOpen(true)}
              >
                منو
              </button>
              <button type="button" className="sa-search-trigger" onClick={() => setPaletteOpen(true)}>
                جستجو…
                <kbd>⌘K</kbd>
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => navigate("/panel-admin/")}>
                  فروشگاه
                </button>
                <button
                  type="button"
                  className="sa-btn sa-btn-ghost sa-btn-sm"
                  onClick={() => navigate("/panel-admin/requests/")}
                >
                  درخواست‌ها
                </button>
              </div>
            </header>
            <main className="sa-content">{content}</main>
          </div>
        </div>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={navigate} />
      </ToastHost>
    </div>
  );
}
