"use client";

import {
  TAB_ICONS,
} from "@/components/admin/CashierIcons";

const PANEL_FEATURES = [
  {
    id: "orders",
    title: "سفارش‌ها",
    desc: "دریافت لحظه‌ای سفارش از منوی QR، تغییر وضعیت (جدید → آماده‌سازی → آماده)، ثبت سفارش دستی، هشدار صوتی و اتصال زنده.",
    bullets: ["فیلتر وضعیت", "سفارش جدید", "اتصال زنده", "هشدار صدا"],
  },
  {
    id: "invoices",
    title: "فاکتورها",
    desc: "صدور فاکتور از سفارش، تسویه میز، تقسیم فاکتور، چاپ رسید و پیگیری پرداخت.",
    bullets: ["تسویه میز", "تقسیم فاکتور", "چاپ", "پیگیری پرداخت"],
  },
  {
    id: "reservations",
    title: "رزروها",
    desc: "مدیریت رزرو آنلاین و تلفنی، تأیید/رد درخواست و نمایش رزروهای امروز.",
    bullets: ["تأیید رزرو", "برنامه روز", "اعلان درخواست جدید"],
  },
  {
    id: "tables",
    title: "میزها",
    desc: "نقشه سالن با مناطق (سالن، تراس، VIP)، وضعیت هر میز و اتصال سفارش به میز.",
    bullets: ["مناطق سالن", "وضعیت میز", "اتصال به سفارش"],
  },
  {
    id: "menu",
    title: "منو",
    desc: "ویرایش آیتم‌ها، قیمت، دسته‌بندی، موجودی، تاپینگ، تصویر و مخفی/نمایش آیتم — همان منوی QR.",
    bullets: ["قیمت و موجودی", "تاپینگ", "دسته‌بندی", "همگام با QR"],
  },
  {
    id: "stats",
    title: "آمار فروش",
    desc: "فروش روزانه و بازه‌ای، پرفروش‌ترین آیتم‌ها و نمای کلی برای تصمیم‌گیری مدیر.",
    bullets: ["فروش روزانه", "پرفروش‌ها", "گزارش بازه‌ای"],
  },
  {
    id: "customers",
    title: "باشگاه مشتریان",
    desc: "پروفایل مشتری، تاریخچه سفارش، امتیاز وفاداری و جستجوی سریع هنگام ثبت فاکتور.",
    bullets: ["پروفایل مشتری", "تاریخچه", "امتیاز وفاداری"],
  },
  {
    id: "coupons",
    title: "کوپن‌ها",
    desc: "تعریف کد تخفیف درصدی یا مبلغی، محدودیت استفاده و تاریخ انقضا.",
    bullets: ["کد تخفیف", "درصد/مبلغ", "محدودیت استفاده"],
  },
  {
    id: "hardware",
    title: "سخت‌افزار",
    desc: "اتصال پرینتر آشپزخانه و صندوق، تنظیم چاپ خودکار و تست چاپ.",
    bullets: ["پرینتر آشپزخانه", "چاپ خودکار", "تست چاپ"],
  },
  {
    id: "payments",
    title: "پایانه‌های پرداخت",
    desc: "مدیریت کارتخوان و روش‌های پرداخت متصل به فرایند تسویه.",
    bullets: ["کارتخوان", "روش پرداخت", "تسویه"],
  },
  {
    id: "settings",
    title: "تنظیمات",
    desc: "نام کافه، لوگو، رنگ برند، پس‌زمینه منو، ساختار چیدمان منو و اطلاعات تماس.",
    bullets: ["برندینگ", "رنگ و لوگو", "چیدمان منو", "اطلاعات تماس"],
  },
] as const;

export function StoreAdminFeatures() {
  return (
    <section className="mzt-panel-features" aria-labelledby="panel-features-title">
      <div className="mzt-section-head">
        <span className="mzt-eyebrow">پنل صندوق</span>
        <h2 id="panel-features-title">۱۱ بخش برای مدیریت کامل کافه</h2>
        <p>
          همان پنلی که صندوقدار و مدیر روزانه استفاده می‌کنند — از ثبت سفارش تا آمار،
          منو، مشتریان و چاپ.
        </p>
      </div>

      <div className="mzt-panel-grid">
        {PANEL_FEATURES.map((f) => {
          const Icon = TAB_ICONS[f.id];
          return (
            <article key={f.id} className="mzt-panel-card">
              <div className="mzt-panel-card-icon">
                <Icon size={20} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
              <ul>
                {f.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
