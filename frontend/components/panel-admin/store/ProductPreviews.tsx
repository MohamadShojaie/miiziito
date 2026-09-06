"use client";

import {
  TAB_ICONS,
  IconCheck,
  IconPlus,
  IconSidebar,
} from "@/components/admin/CashierIcons";

const MENU_CATS = [
  { label: "قهوه", icon: "/assets/category/coffee.svg", active: true },
  { label: "سرد", icon: "/assets/category/cold-drink.svg", active: false },
  { label: "غذا", icon: "/assets/category/burger.svg", active: false },
  { label: "دسر", icon: "/assets/category/cake.svg", active: false },
] as const;

const MENU_ITEMS = [
  { name: "اسپرسو", price: "۸۵", img: "/assets/items/coffee-cup-line.png", new: false },
  { name: "لاته", price: "۱۲۵", img: "/assets/items/iced-coffee-line.png", new: true },
  { name: "ساندویچ", price: "۱۹۵", img: "/assets/items/sandwich-line.png", new: false },
  { name: "چیزکیک", price: "۱۴۵", img: "/assets/items/cake-line.png", new: false },
] as const;

const ADMIN_TABS = [
  { id: "orders" as const, label: "سفارش‌ها", active: true },
  { id: "invoices" as const, label: "فاکتورها", active: false },
  { id: "reservations" as const, label: "رزروها", active: false },
  { id: "tables" as const, label: "میزها", active: false },
  { id: "menu" as const, label: "منو", active: false },
  { id: "stats" as const, label: "آمار فروش", active: false },
  { id: "customers" as const, label: "باشگاه مشتریان", active: false },
  { id: "coupons" as const, label: "کوپن‌ها", active: false },
  { id: "hardware" as const, label: "سخت‌افزار", active: false },
  { id: "payments" as const, label: "پایانه‌ها", active: false },
  { id: "settings" as const, label: "تنظیمات", active: false },
] as const;

const ADMIN_ORDERS = [
  { id: "۱۰۴۲", meta: "میز ۳ · ۲ آیتم", status: "preparing", label: "آماده‌سازی", time: "۱۴:۳۲" },
  { id: "۱۰۴۱", meta: "بیرون‌بر · ۱ آیتم", status: "waiting", label: "جدید", time: "۱۴:۲۸" },
  { id: "۱۰۴۰", meta: "میز ۷ · ۳ آیتم", status: "ready", label: "آماده", time: "۱۴:۱۵" },
] as const;

/** Matches real customer menu: category rail + card rows + line-art item images. */
export function ProductMenuPreview({
  compact = false,
  showcase = false,
}: {
  compact?: boolean;
  showcase?: boolean;
}) {
  const items = compact ? MENU_ITEMS.slice(0, 2) : showcase ? MENU_ITEMS.slice(0, 3) : MENU_ITEMS;
  const cats = compact ? MENU_CATS.slice(0, 3) : MENU_CATS;
  const hideDesc = compact || showcase;
  const hideNewStrip = compact;

  return (
    <div
      className={`mzt-preview mzt-preview--menu${compact ? " mzt-preview--compact" : ""}${showcase ? " mzt-preview--showcase" : ""}`}
    >
      <header className="mzt-preview-menu-header">
        <div className="mzt-preview-menu-logo" aria-hidden="true" />
        <div>
          <strong>منوی دیجیتال</strong>
          {!compact ? <span>نمونه رابط مشتری</span> : null}
        </div>
      </header>

      <nav className="mzt-preview-tabs" aria-label="دسته‌بندی">
        {cats.map((c) => (
          <button key={c.label} type="button" className={c.active ? "is-active" : ""} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.icon} alt="" />
            <span>{c.label}</span>
          </button>
        ))}
      </nav>

      {!hideNewStrip ? (
        <div className="mzt-preview-new-strip" aria-hidden="true">
          <article className="mzt-preview-new-card">
            <div className="mzt-preview-new-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/items/iced-coffee-line.png" alt="" />
            </div>
            <span>لاته</span>
            <em>جدید</em>
          </article>
        </div>
      ) : null}

      <ul className="mzt-preview-menu-list">
        {items.map((item) => (
          <li key={item.name}>
            <div className="mzt-preview-item-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.img} alt="" />
            </div>
            <div className="mzt-preview-item-body">
              <div className="mzt-preview-item-head">
                <span>
                  {item.name}
                  {item.new ? <em className="is-new">جدید</em> : null}
                </span>
                <strong>{item.price}</strong>
              </div>
              {!hideDesc ? <p>توضیح کوتاه محصول — همان ساختار منوی واقعی</p> : null}
            </div>
            <button type="button" className="mzt-preview-add" aria-hidden="true">
              +
            </button>
          </li>
        ))}
      </ul>

      <div className="mzt-preview-cart-fab" aria-hidden="true">
        <span>سبد · ۲</span>
      </div>
    </div>
  );
}

/** Matches real cashier panel: cp-topbar + sidebar tabs + orders list. */
export function ProductAdminPreview({
  compact = false,
  showcase = false,
}: {
  compact?: boolean;
  showcase?: boolean;
}) {
  const trimmed = compact || showcase;
  const tabs = trimmed ? ADMIN_TABS.slice(0, 5) : ADMIN_TABS;
  const orders = trimmed ? ADMIN_ORDERS.slice(0, 2) : ADMIN_ORDERS;

  return (
    <div
      className={`mzt-preview mzt-preview--admin${compact ? " mzt-preview--compact" : ""}${showcase ? " mzt-preview--showcase" : ""}`}
    >
      <header className="mzt-preview-admin-topbar">
        <div className="mzt-preview-admin-top-start">
          <span className="mzt-preview-icon-btn" aria-hidden="true">
            <IconSidebar size={16} />
          </span>
          <div>
            <strong>پنل سفارش‌ها</strong>
            <span className="mzt-preview-sync">● متصل</span>
          </div>
        </div>
        <button type="button" className="mzt-preview-new-order" aria-hidden="true">
          <IconPlus size={14} />
          سفارش جدید
        </button>
      </header>

      <div className="mzt-preview-admin-shell">
        <nav className="mzt-preview-admin-nav" aria-label="بخش‌های پنل">
          {tabs.map((t) => {
            const Icon = TAB_ICONS[t.id];
            return (
              <span key={t.id} className={t.active ? "is-active" : ""}>
                <Icon size={compact ? 13 : 15} />
                {t.label}
              </span>
            );
          })}
        </nav>

        <main className="mzt-preview-admin-main">
          {!trimmed ? (
            <div className="mzt-preview-admin-filters" aria-hidden="true">
              {["همه", "جدید", "آماده‌سازی", "آماده"].map((f, i) => (
                <span key={f} className={i === 1 ? "is-active" : ""}>
                  {f}
                </span>
              ))}
            </div>
          ) : null}
          <ul className="mzt-preview-order-list">
            {orders.map((o) => (
              <li key={o.id}>
                <div className="mzt-preview-order-top">
                  <strong>#{o.id}</strong>
                  <em data-status={o.status}>{o.label}</em>
                  <span>{o.time}</span>
                </div>
                <p>{o.meta}</p>
                {!trimmed ? (
                  <div className="mzt-preview-order-actions">
                    <span>شروع آماده‌سازی</span>
                    <span>فاکتور</span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </main>
      </div>
    </div>
  );
}

export function TrustStats() {
  const stats = [
    { value: "۱۱", label: "بخش پنل صندوق" },
    { value: "۳", label: "چیدمان منو" },
    { value: "۱۰۰٪", label: "وب — بدون نصب" },
    { value: "زنده", label: "به‌روزرسانی سفارش" },
  ];
  return (
    <div className="mzt-stats">
      {stats.map((s) => (
        <div key={s.label} className="mzt-stat">
          <strong>{s.value}</strong>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export function FeatureCheckList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mzt-check-list">
      {items.map((item) => (
        <li key={item}>
          <IconCheck size={16} />
          {item}
        </li>
      ))}
    </ul>
  );
}
