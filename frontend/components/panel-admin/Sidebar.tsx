"use client";

import { BrandMark } from "@/components/panel-admin/BrandMark";

type NavItem = { href: string; label: string; section?: string };

const NAV: NavItem[] = [
  { href: "/panel-admin/manage/", label: "داشبورد", section: "مدیریت" },
  { href: "/panel-admin/requests/", label: "درخواست‌های خرید/تمدید" },
  { href: "/panel-admin/cafes/", label: "همه کافه‌ها", section: "مشتریان" },
  { href: "/panel-admin/cafes/?status=active", label: "فعال" },
  { href: "/panel-admin/cafes/?status=trial", label: "آزمایشی" },
  { href: "/panel-admin/cafes/?status=suspended", label: "معلق" },
  { href: "/panel-admin/subscriptions/", label: "اشتراک‌ها", section: "اشتراک" },
  { href: "/panel-admin/payments/", label: "پرداخت‌ها" },
  { href: "/panel-admin/plans/", label: "پلن‌ها", section: "قیمت‌گذاری" },
  { href: "/panel-admin/coupons/", label: "کد تخفیف" },
  { href: "/panel-admin/support/", label: "پشتیبانی", section: "عملیات" },
  { href: "/panel-admin/notifications/", label: "اعلان‌ها" },
  { href: "/panel-admin/analytics/revenue/", label: "درآمد", section: "تحلیل" },
  { href: "/panel-admin/analytics/customers/", label: "مشتریان" },
  { href: "/panel-admin/analytics/subscriptions/", label: "اشتراک‌ها (تحلیل)" },
  { href: "/panel-admin/system/health/", label: "سلامت سیستم", section: "سیستم" },
  { href: "/panel-admin/system/settings/", label: "تنظیمات" },
  { href: "/panel-admin/audit-logs/", label: "گزارش فعالیت‌ها" },
  { href: "/panel-admin/admin-users/", label: "ادمین‌ها" },
  { href: "/panel-admin/roles/", label: "نقش‌ها" },
  { href: "/", label: "فروشگاه عمومی", section: "عمومی" },
];

function pathActive(current: string, href: string): boolean {
  const [currPathRaw, currSearch = ""] = current.split("?");
  const [hrefPathRaw, hrefSearch = ""] = href.split("?");
  const norm = (p: string) => {
    let x = p || "/";
    if (!x.endsWith("/")) x += "/";
    return x;
  };
  const currPath = norm(currPathRaw);
  const hrefPath = norm(hrefPathRaw);

  if (hrefPath === "/panel-admin/manage/" || hrefPath === "/panel-admin/dashboard/") {
    return currPath.startsWith("/panel-admin/manage") || currPath.startsWith("/panel-admin/dashboard");
  }
  if (hrefPath === "/") {
    return currPath === "/";
  }

  const currParams = new URLSearchParams(currSearch);
  const hrefParams = new URLSearchParams(hrefSearch);
  const hrefStatus = hrefParams.get("status");
  const currStatus = currParams.get("status") || "";

  if (hrefStatus !== null) {
    return currPath === hrefPath && currStatus === hrefStatus;
  }

  if (currPath === hrefPath || currPath.startsWith(hrefPath)) {
    // Parent list link should not stay active when a status filter is selected
    if (hrefPath === "/panel-admin/cafes/" && currStatus) return false;
    return true;
  }
  return false;
}

function roleLabelFa(role?: string): string {
  if (!role) return "—";
  const map: Record<string, string> = {
    Owner: "مالک",
    "Super Admin": "سوپرادمین",
    Support: "پشتیبانی",
    Finance: "مالی",
    Manager: "مدیر",
    "Platform Owner": "مالک پلتفرم",
  };
  return map[role] || role;
}

export function Sidebar({
  path,
  onNavigate,
  adminName,
  adminRole,
  onLogout,
  open,
  onClose,
}: {
  path: string;
  onNavigate: (href: string) => void;
  adminName?: string;
  adminRole?: string;
  onLogout: () => void;
  open: boolean;
  onClose: () => void;
}) {
  let lastSection = "";
  return (
    <aside className={`sa-sidebar ${open ? "is-open" : ""}`}>
      <div className="sa-brand">
        <div className="sa-brand-mark">
          <BrandMark />
        </div>
        <div className="sa-brand-sub">پنل مدیریت</div>
      </div>
      <nav className="sa-nav">
        {NAV.map((item) => {
          const showSection = item.section && item.section !== lastSection;
          if (item.section) lastSection = item.section;
          const active = pathActive(path, item.href);
          return (
            <div key={item.href + item.label}>
              {showSection ? <div className="sa-nav-section">{item.section}</div> : null}
              <button
                type="button"
                className={`sa-nav-link ${active ? "is-active" : ""}`}
                onClick={() => {
                  onNavigate(item.href);
                  onClose();
                }}
              >
                {item.label}
              </button>
            </div>
          );
        })}
      </nav>
      <div className="sa-sidebar-foot">
        <div className="sa-admin-chip">
          <strong>{adminName || "ادمین"}</strong>
          <span>{roleLabelFa(adminRole)}</span>
        </div>
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={onLogout}>
          خروج
        </button>
      </div>
    </aside>
  );
}
