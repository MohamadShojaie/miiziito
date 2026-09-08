"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- full page navigation to panel-admin SPA */

import { useState, type FormEvent, type ReactNode } from "react";
import { BrandMark } from "@/components/panel-admin/BrandMark";
import {
  IconCheck,
  IconMobile,
  IconQr,
  TAB_ICONS,
} from "@/components/admin/CashierIcons";
import { DesktopMockup, HeroMockups, PhoneMockup } from "@/components/panel-admin/store/ProductMockup";
import { FeatureCheckList, TrustStats } from "@/components/panel-admin/store/ProductPreviews";
import { saFetch } from "@/lib/super-admin/api";
import { SITE_CONFIG } from "@/lib/config";

/* ── Data ── */

const CAPABILITY_TAGS = [
  "منوی دیجیتال QR",
  "سفارش سر میز",
  "صدازدن گارسون",
  "صندوق و فاکتور",
  "باشگاه مشتریان",
  "گزارش فروش",
  "کد تخفیف",
  "رزرو میز",
  "تاپینگ و گزینه‌ها",
  "بدون نصب اپ",
] as const;

const HERO_PILLS = ["منوی QR", "سفارش زنده", "گزارش فروش"] as const;

const WHY_FEATURES = [
  { icon: TAB_ICONS.orders, title: "مسیر یکپارچه", desc: "منو، سفارش، صندوق و گزارش را بدون جابه‌جایی بین ابزارهای مختلف، در یک پنل مدیریت کنید." },
  { icon: IconQr, title: "منوی دیجیتال", desc: "مشتری با QR منو را باز می‌کند — بدون نصب اپلیکیشن." },
  { icon: TAB_ICONS.invoices, title: "صندوق و فاکتور", desc: "فروش و فاکتورها را دقیق ثبت و پیگیری کنید." },
  { icon: TAB_ICONS.customers, title: "باشگاه مشتریان", desc: "مشتریان را بشناسید و وفاداری را رشد دهید." },
  { icon: TAB_ICONS.stats, title: "گزارش‌های واقعی", desc: "تصمیم بهتر با داده‌های فروش و عملکرد روزانه." },
  { icon: IconMobile, title: "همه‌جا در دسترس", desc: "روی موبایل، تبلت و کامپیوتر — فقط مرورگر کافی است." },
] as const;

/** Donomenu-style short explainers — only capabilities that exist in product */
const INNOVATE_FEATURES = [
  {
    icon: IconQr,
    title: "منوی QR بدون نصب اپ",
    desc: "مشتری با اسکن کد، منوی شما را در مرورگر می‌بیند و سفارش می‌دهد — بدون دانلود.",
  },
  {
    icon: TAB_ICONS.orders,
    title: "سبد، تعداد و جمع مبلغ",
    desc: "انتخاب تعداد آیتم، مشاهده جمع سفارش و ثبت سفارش سر میز از همان منو.",
  },
  {
    icon: TAB_ICONS.hardware,
    title: "صدازدن گارسون (پیجر آنلاین)",
    desc: "مشتری از منو گارسون را صدا می‌زند و هشدار به پنل می‌رسد — بدون پیجر فیزیکی.",
  },
  {
    icon: TAB_ICONS.menu,
    title: "گزینه‌ها و تاپینگ آیتم",
    desc: "برای هر غذا چند گزینه تعریف کنید؛ مشتری سایز، طعم یا تاپینگ را هنگام سفارش انتخاب می‌کند.",
  },
  {
    icon: TAB_ICONS.coupons,
    title: "برچسب آیتم‌ها",
    desc: "آیتم‌های جدید را با برچسب مشخص کنید تا در منو سریع‌تر دیده شوند.",
  },
  {
    icon: TAB_ICONS.reservations,
    title: "رزرو میز از منو",
    desc: "مشتری می‌تواند درخواست رزرو میز را مستقیم از منوی دیجیتال ثبت کند.",
  },
] as const;

const ADDON_ITEMS = [
  {
    title: "دامنه اختصاصی",
    desc: "آدرس اختصاصی برای منوی کافه و برند شما.",
  },
  {
    title: "طراحی قالب اختصاصی",
    desc: "ظاهر منو مطابق هویت بصری کافه شما.",
  },
  {
    title: "راه‌اندازی اولیه",
    desc: "ورود منو و تنظیمات اولیه با همراهی تیم پشتیبانی.",
  },
  {
    title: "برندینگ پیشرفته",
    desc: "لوگو، رنگ‌ها و چیدمان منو مطابق سلیقه شما.",
  },
] as const;

const UNIFIED_BULLETS = [
  "اتصال منو، سفارش و صندوق به یکدیگر",
  "یک پنل برای تمام عملیات روزمره کافه",
  "همگام‌سازی خودکار وضعیت سفارش‌ها",
] as const;

const SCALE_BULLETS = [
  "مناسب کافه، رستوران و فست‌فود",
  "پشتیبانی از چند کاربر (بسته به پلن)",
  "راه‌اندازی سریع پس از خرید پلن",
] as const;

const DASHBOARD_FEATURES = [
  "فروش امروز",
  "سفارش‌های فعال",
  "مدیریت محصولات",
  "گزارش‌ها",
  "فاکتورها",
  "مشتریان",
] as const;

const STEPS = [
  { n: "1", title: "پلن مناسب را انتخاب کن", desc: "پلن اشتراک متناسب با کافه خود را ببینید و خریداری کنید." },
  { n: "2", title: "حساب کافه را بساز", desc: "پس از خرید، اطلاعات کافه، منو و برند خود را وارد کنید." },
  { n: "3", title: "فروش و مدیریت را شروع کن", desc: "QR را چاپ کنید و سفارش‌ها را از همان روز اول مدیریت کنید." },
] as const;

const COMPARISON = [
  { old: "منوی چاپی", next: "منوی دیجیتال QR" },
  { old: "ثبت دستی سفارش", next: "سفارش دیجیتال" },
  { old: "گزارش‌گیری دستی", next: "گزارش لحظه‌ای" },
  { old: "دفتر مشتریان", next: "باشگاه مشتریان (CRM)" },
  { old: "ابزارهای متعدد", next: "یک پلتفرم یکپارچه" },
] as const;

const FAQ_ITEMS = [
  {
    q: "آیا مشتری نیاز به نصب اپلیکیشن دارد؟",
    a: "خیر. مشتری با اسکن QR Code منوی شما را در مرورگر موبایل باز می‌کند — بدون دانلود یا نصب.",
  },
  {
    q: "راه‌اندازی منوی دیجیتال چقدر زمان می‌برد؟",
    a: "پس از خرید پلن و ثبت‌نام، می‌توانید محصولات و دسته‌بندی‌ها را وارد کنید و QR منو را در همان روز استفاده کنید.",
  },
  {
    q: "آیا روی موبایل و تبلت هم کار می‌کند؟",
    a: "بله. هم منوی مشتری و هم پنل مدیریت روی موبایل، تبلت و کامپیوتر در مرورگر کار می‌کنند.",
  },
  {
    q: "آیا می‌توانم منوی خودم را شخصی‌سازی کنم؟",
    a: "بله. نام کافه، لوگو، رنگ برند و چیدمان منو قابل تنظیم است.",
  },
  {
    q: "آیا امکان مدیریت سفارش‌ها وجود دارد؟",
    a: "بله. سفارش‌های آنلاین و دستی در پنل مدیریت با وضعیت‌های مختلف (جدید، آماده‌سازی، آماده) قابل پیگیری هستند.",
  },
  {
    q: "آیا اطلاعات مشتریان ذخیره می‌شود؟",
    a: "بله. باشگاه مشتریان تاریخچه سفارش، پروفایل و امتیاز وفاداری را نگه می‌دارد (بسته به پلن اشتراک).",
  },
  {
    q: "پلن‌های اشتراک چگونه هستند؟",
    a: "پلن‌های ۶ ماهه و سالانه با امکانات متفاوت وجود دارد. جزئیات در بخش قیمت‌گذاری نمایش داده می‌شود.",
  },
  {
    q: "چطور با پشتیبانی تماس بگیرم؟",
    a: "از بخش «تماس با ما» پیام بگذارید یا با شماره و تلگرام پشتیبانی ارتباط بگیرید. تیم میزییتو در اولین فرصت پاسخ می‌دهد.",
  },
] as const;

function IconBox({ children }: { children: ReactNode }) {
  return <div className="mzt-icon-box">{children}</div>;
}

function SectionBadge({ children }: { children: ReactNode }) {
  return <span className="mzt-badge">{children}</span>;
}

/* ── Sections ── */

export function LandingNav({
  scrolled,
  menuOpen,
  onMenuToggle,
  isLoggedIn,
  kind,
}: {
  scrolled: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  isLoggedIn: boolean;
  kind: "admin" | "cafe" | null;
}) {
  const links = [
    { id: "why", label: "چرا میزییتو" },
    { id: "innovate", label: "امکانات منو" },
    { id: "digital-menu", label: "منوی دیجیتال" },
    { id: "dashboard", label: "پنل مدیریت" },
    { id: "plans", label: "قیمت‌ها" },
    { id: "faq", label: "سوالات متداول" },
    { id: "contact", label: "تماس با ما" },
  ];

  return (
    <header className={`mzt-nav ${scrolled ? "is-scrolled" : ""}`}>
      <div className="mzt-container mzt-nav-inner">
        <div className="mzt-nav-brand">
          <BrandMark />
        </div>

        <nav className="mzt-nav-links" aria-label="ناوبری اصلی">
          {links.map((l) => (
            <a key={l.id} href={`#${l.id}`}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="mzt-nav-actions">
          {isLoggedIn ? (
            <a
              href={kind === "admin" ? "/panel-admin/manage/" : "/panel-admin/account/"}
              className="mzt-btn mzt-btn-primary mzt-btn-sm"
            >
              {kind === "admin" ? "پنل مدیریت" : "حساب من"}
            </a>
          ) : (
            <>
              <a href="/panel-admin/login/" className="mzt-btn mzt-btn-secondary mzt-btn-sm">
                ورود
              </a>
              <a href="#plans" className="mzt-btn mzt-btn-primary mzt-btn-sm">
                خرید پلن
              </a>
            </>
          )}
          <button
            type="button"
            className="mzt-nav-burger"
            aria-label={menuOpen ? "بستن منو" : "باز کردن منو"}
            aria-expanded={menuOpen}
            onClick={onMenuToggle}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="mzt-nav-mobile">
          {links.map((l) => (
            <a key={l.id} href={`#${l.id}`} onClick={onMenuToggle}>
              {l.label}
            </a>
          ))}
          {!isLoggedIn ? (
            <>
              <a href="/panel-admin/login/" onClick={onMenuToggle}>
                ورود
              </a>
              <a href="#plans" className="mzt-btn mzt-btn-primary mzt-btn-block" onClick={onMenuToggle}>
                خرید پلن
              </a>
            </>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

export function HeroSection() {
  return (
    <section className="mzt-section mzt-band-dark mzt-hero">
      <div className="mzt-container">
        <div className="mzt-hero-grid mzt-reveal">
          <div className="mzt-hero-copy">
            <SectionBadge>پلتفرم مدیریت کافه و رستوران</SectionBadge>
            <h1 className="mzt-display">
              کافه و رستورانت رو
              <br />
              <strong>هوشمندتر مدیریت کن</strong>
            </h1>
            <p className="mzt-lead">
              میزییتو منوی دیجیتال، سفارش‌گیری، صندوق، مشتریان و گزارش فروش را در یک پنل یکپارچه گرد هم می‌آورد.
            </p>
            <div className="mzt-hero-actions">
              <a href="#plans" className="mzt-btn mzt-btn-primary mzt-btn-lg">
                مشاهده پلن‌ها
              </a>
              <a href="#why" className="mzt-btn mzt-btn-secondary mzt-btn-lg">
                چرا میزییتو؟
              </a>
            </div>
            <p className="mzt-caption mzt-hero-trust">
              بدون نیاز به نصب · راه‌اندازی سریع · مناسب کافه و رستوران
            </p>
            <TrustStats />
          </div>

          <div className="mzt-hero-visual">
            <div className="mzt-hero-visual-wrap">
              <HeroMockups />
              {HERO_PILLS.map((pill, i) => (
                <span key={pill} className={`mzt-hero-pill mzt-hero-pill--${i + 1}`}>
                  {pill}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CapabilityStripSection() {
  return (
    <section className="mzt-capability-strip mzt-band-light" aria-label="امکانات کلیدی">
      <div className="mzt-capability-track mzt-reveal">
        {[...CAPABILITY_TAGS, ...CAPABILITY_TAGS].map((tag, i) => (
          <span key={`${tag}-${i}`} className="mzt-capability-tag">
            {tag}
          </span>
        ))}
      </div>
    </section>
  );
}

export function WhySection() {
  return (
    <section className="mzt-section mzt-band-light mzt-why" id="why">
      <div className="mzt-container">
        <div className="mzt-section-head mzt-reveal">
          <SectionBadge>چرا میزییتو</SectionBadge>
          <h2 className="mzt-h2">همه‌چیز برای مدیریت بهتر کافه</h2>
          <p className="mzt-body">
            بدون نیاز به برنامه‌نویسی، هاست جدا یا اپ نصب‌کردنی — ثبت‌نام کنید، منو بسازید و QR بگیرید.
            هزینه اشتراک، امکانات و به‌روزرسانی‌ها را پوشش می‌دهد.
          </p>
        </div>
        <div className="mzt-why-grid mzt-reveal">
          {WHY_FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <article key={f.title} className="mzt-surface mzt-surface--elevated mzt-why-card">
                <IconBox>
                  <Icon size={20} />
                </IconBox>
                <h3 className="mzt-h3">{f.title}</h3>
                <p className="mzt-body-sm">{f.desc}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function InnovateFeaturesSection() {
  return (
    <section className="mzt-section mzt-band-light-continued mzt-innovate" id="innovate">
      <div className="mzt-container">
        <div className="mzt-section-head mzt-reveal">
          <SectionBadge>راه‌حل‌های کاربردی</SectionBadge>
          <h2 className="mzt-h2">منوی دیجیتال، فراتر از یک لیست قیمت</h2>
          <p className="mzt-body">
            امکاناتی که مشتری پشت میز واقعاً استفاده می‌کند — و مدیر کافه در پنل می‌بیند.
          </p>
        </div>
        <div className="mzt-innovate-grid mzt-reveal">
          {INNOVATE_FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <article key={f.title} className="mzt-surface mzt-surface--elevated mzt-innovate-card">
                <IconBox>
                  <Icon size={20} />
                </IconBox>
                <h3 className="mzt-h3">{f.title}</h3>
                <p className="mzt-body-sm">{f.desc}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function UnifiedPlatformSection() {
  return (
    <section className="mzt-section mzt-band-light-continued mzt-showcase" id="platform">
      <div className="mzt-container">
        <div className="mzt-split mzt-reveal">
          <div className="mzt-split-copy">
            <SectionBadge>یکپارچگی کامل</SectionBadge>
            <h2 className="mzt-h2">همه‌چیز، یک‌جا و هماهنگ</h2>
            <p className="mzt-body">
              از منوی دیجیتال تا صندوق و گزارش؛ همه بخش‌ها به‌هم متصل‌اند و اطلاعات کافه فقط یک‌بار وارد می‌شود.
            </p>
            <FeatureCheckList items={UNIFIED_BULLETS} />
          </div>
          <div className="mzt-split-visual">
            <DesktopMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

export function DigitalMenuSection() {
  return (
    <section className="mzt-section mzt-band-dark-alt mzt-showcase" id="digital-menu">
      <div className="mzt-container">
        <div className="mzt-split mzt-split--reverse mzt-reveal">
          <div className="mzt-split-copy">
            <SectionBadge>برای مشتری</SectionBadge>
            <h2 className="mzt-h2">منوی دیجیتال، فراتر از یک QR Code</h2>
            <p className="mzt-body">
              مشتری بدون نصب اپلیکیشن، منوی شما را باز می‌کند، محصولات را می‌بیند و سفارش خود را ثبت می‌کند.
            </p>
            <FeatureCheckList items={["دسته‌بندی سریع", "تصاویر محصولات", "توضیحات و قیمت", "سبد خرید و جمع مبلغ", "سفارش سر میز", "صدازدن گارسون", "رزرو میز"]} />
          </div>
          <div className="mzt-split-visual">
            <PhoneMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

export function DashboardSection() {
  return (
    <section className="mzt-section mzt-band-dark-alt mzt-showcase mzt-showcase--continued" id="dashboard">
      <div className="mzt-container">
        <div className="mzt-split mzt-reveal">
          <div className="mzt-split-copy">
            <SectionBadge>برای مدیر کافه</SectionBadge>
            <h2 className="mzt-h2">تمام کسب‌وکار شما، یکجا</h2>
            <p className="mzt-body">
              داشبورد جامع برای مدیریت سفارش‌ها، فروش، محصولات، مشتریان و گزارش‌های روزانه.
            </p>
            <FeatureCheckList items={[...DASHBOARD_FEATURES, ...SCALE_BULLETS]} />
          </div>
          <div className="mzt-split-visual">
            <DesktopMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

export function HowItWorksSection() {
  return (
    <section className="mzt-section mzt-band-light mzt-steps" id="how-it-works">
      <div className="mzt-container">
        <div className="mzt-section-head mzt-reveal">
          <SectionBadge>چطور کار می‌کند</SectionBadge>
          <h2 className="mzt-h2">در سه گام ساده شروع کنید</h2>
          <p className="mzt-body">طراحی‌شده تا راه‌اندازی کافه آنلاین را ساده و سریع کند.</p>
        </div>
        <ol className="mzt-steps-grid mzt-steps-grid--numbered mzt-reveal">
          {STEPS.map((s) => (
            <li key={s.n} className="mzt-surface mzt-surface--elevated mzt-step-card">
              <span className="mzt-step-circle">{s.n}</span>
              <h3 className="mzt-h3">{s.title}</h3>
              <p className="mzt-body-sm">{s.desc}</p>
            </li>
          ))}
        </ol>
        <div className="mzt-section-cta mzt-reveal">
          <a href="#plans" className="mzt-btn mzt-btn-primary mzt-btn-lg">
            مشاهده پلن‌ها
          </a>
        </div>
      </div>
    </section>
  );
}

/** Comparison table — rendered inside pricing band */
export function PricingComparisonBlock() {
  return (
    <div className="mzt-pricing-compare mzt-reveal">
      <div className="mzt-section-head">
        <SectionBadge>مقایسه</SectionBadge>
        <h2 className="mzt-h2">چرا یک پلتفرم یکپارچه؟</h2>
      </div>
      <div className="mzt-surface mzt-surface--elevated mzt-compare-table">
        <div className="mzt-compare-header">
          <span>روش سنتی</span>
          <span>میزییتو</span>
        </div>
        {COMPARISON.map((row) => (
          <div key={row.old} className="mzt-compare-row">
            <span className="mzt-compare-old">{row.old}</span>
            <span className="mzt-compare-arrow" aria-hidden="true">←</span>
            <span className="mzt-compare-new">
              <IconCheck size={16} />
              {row.next}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TestimonialsSection() {
  return (
    <section className="mzt-section mzt-band-light-continued mzt-social-proof" id="customers" aria-labelledby="customers-title">
      <div className="mzt-container">
        <div className="mzt-section-head mzt-reveal">
          <SectionBadge>نتیجه اعتماد شما</SectionBadge>
          <h2 className="mzt-h2" id="customers-title">کافه‌ها و رستوران‌های فعال روی میزییتو</h2>
          <p className="mzt-body">پلتفرمی برای مدیریت روزانه — از منوی دیجیتال تا صندوق و مشتریان.</p>
        </div>

        <div className="mzt-proof-stats mzt-reveal">
          <article className="mzt-surface mzt-surface--elevated mzt-proof-stat">
            <strong>منوی QR</strong>
            <span>بدون نصب اپ برای مشتری</span>
          </article>
          <article className="mzt-surface mzt-surface--elevated mzt-proof-stat">
            <strong>پنل یکپارچه</strong>
            <span>سفارش، فاکتور و گزارش در یک جا</span>
          </article>
          <article className="mzt-surface mzt-surface--elevated mzt-proof-stat">
            <strong>راه‌اندازی سریع</strong>
            <span>ثبت‌نام، ساخت منو، دریافت QR</span>
          </article>
        </div>

        <div className="mzt-customers-block mzt-reveal">
          <h3 className="mzt-h3 mzt-customers-title">مشتریان ما</h3>
          <div className="mzt-logo-row" aria-label="جای لوگوهای کافه‌ها">
            {["کافه شما", "رستوران شما", "فست‌فود شما", "بیکری شما"].map((label) => (
              <div key={label} className="mzt-logo-slot">
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="mzt-caption mzt-customers-caption">جای شما خالی است — منتظر شما هستیم</p>
        </div>
      </div>
    </section>
  );
}

export function ModularAddonsSection() {
  return (
    <section className="mzt-addons mzt-reveal" id="addons" aria-labelledby="addons-title">
      <div className="mzt-section-head">
        <SectionBadge>پکیج منعطف</SectionBadge>
        <h2 className="mzt-h2" id="addons-title">امکانات تکمیلی، متناسب با بودجه شما</h2>
        <p className="mzt-body">
          پلن پایه را انتخاب کنید؛ در صورت نیاز، خدمات زیر را جداگانه به مجموعه خود اضافه کنید.
        </p>
      </div>
      <div className="mzt-addons-grid">
        {ADDON_ITEMS.map((item) => (
          <article key={item.title} className="mzt-surface mzt-surface--elevated mzt-addon-card">
            <h3 className="mzt-h3">{item.title}</h3>
            <p className="mzt-body-sm">{item.desc}</p>
          </article>
        ))}
      </div>
      <div className="mzt-addons-cta">
        <a href="#plans" className="mzt-btn mzt-btn-secondary">
          ابتدا پلن را انتخاب کنید
        </a>
        <p className="mzt-caption">برای افزودن خدمات تکمیلی، پس از خرید از بخش حساب کاربری با پشتیبانی هماهنگ کنید.</p>
      </div>
    </section>
  );
}

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="mzt-section mzt-band-light-continued mzt-faq" id="faq">
      <div className="mzt-container">
        <div className="mzt-faq-layout mzt-reveal">
          <div className="mzt-section-head mzt-section-head--left">
            <SectionBadge>سوالات متداول</SectionBadge>
            <h2 className="mzt-h2">پاسخ پرسش‌های رایج شما</h2>
            <p className="mzt-body">هر آنچه قبل از شروع باید بدانید.</p>
          </div>
          <div className="mzt-faq-list">
            {FAQ_ITEMS.map((item, i) => (
              <div key={item.q} className={`mzt-surface mzt-surface--elevated mzt-faq-item ${open === i ? "is-open" : ""}`}>
                <button type="button" className="mzt-faq-q" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                  {item.q}
                  <span className="mzt-faq-toggle" aria-hidden="true">{open === i ? "−" : "+"}</span>
                </button>
                {open === i ? <p className="mzt-faq-a mzt-body-sm">{item.a}</p> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function telegramHandle(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\//, "").replace(/\/$/, "");
    return path ? `@${path}` : "تلگرام";
  } catch {
    return "تلگرام";
  }
}

const CONTACT_ERRORS: Record<string, string> = {
  missing_name: "نام را وارد کنید",
  missing_message: "پیام را کمی کامل‌تر بنویسید",
  missing_contact: "شماره تماس یا ایمیل را وارد کنید",
  invalid_email: "ایمیل معتبر نیست",
  too_many: "تعداد پیام‌ها زیاد شده؛ کمی بعد دوباره تلاش کنید",
};

export function ContactSection({ supportPhone }: { supportPhone?: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cafeName, setCafeName] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const phoneHref = (supportPhone || "").replace(/\s/g, "");
  const telegram = SITE_CONFIG.telegram;
  const mail = SITE_CONFIG.email;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2) {
      setError(CONTACT_ERRORS.missing_name);
      return;
    }
    if (message.trim().length < 10) {
      setError(CONTACT_ERRORS.missing_message);
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setError(CONTACT_ERRORS.missing_contact);
      return;
    }
    setSending(true);
    try {
      await saFetch("sa-public-contact", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          cafeName: cafeName.trim(),
          message: message.trim(),
          website,
        }),
      });
      setSent(true);
    } catch (err) {
      const code = (err as Error & { code?: string }).code || "";
      setError(CONTACT_ERRORS[code] || "ارسال ناموفق بود؛ دوباره تلاش کنید");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mzt-section mzt-band-dark-alt mzt-contact" id="contact" aria-labelledby="contact-title">
      <div className="mzt-container">
        <div className="mzt-contact-shell mzt-reveal">
          <div className="mzt-contact-layout">
            <div className="mzt-contact-copy">
              <SectionBadge>تماس با ما</SectionBadge>
              <h2 className="mzt-h2" id="contact-title">
                هنوز سوال داری؟
                <br />
                <strong>همین الان پیام بگذار</strong>
              </h2>
              <p className="mzt-body">
                مشاوره انتخاب پلن، راه‌اندازی منوی دیجیتال یا پشتیبانی — تیم میزییتو در اولین فرصت جواب می‌دهد.
              </p>
              <ul className="mzt-contact-trust" aria-label="مزایای تماس">
                <li>پاسخ سریع</li>
                <li>مشاوره رایگان</li>
                <li>بدون تعهد خرید</li>
              </ul>
              <div className="mzt-contact-channels">
                {supportPhone ? (
                  <a className="mzt-contact-channel" href={`tel:${phoneHref}`}>
                    <span className="mzt-contact-channel-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M6.5 4.5h3l1.2 3-1.8 1.8a12.5 12.5 0 0 0 5.8 5.8l1.8-1.8 3 1.2v3c0 .8-.7 1.5-1.5 1.5C10.6 19 5 13.4 5 6c0-.8.7-1.5 1.5-1.5Z"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span>
                      <strong>تماس تلفنی</strong>
                      <em dir="ltr">{supportPhone}</em>
                    </span>
                  </a>
                ) : null}
                {telegram ? (
                  <a className="mzt-contact-channel" href={telegram} target="_blank" rel="noreferrer">
                    <span className="mzt-contact-channel-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M20.5 4.5 3.8 11.2c-.8.3-.8 1.5.1 1.8l4.2 1.4 1.6 5.1c.2.8 1.3 1 1.8.3l2.3-2.8 4.3 3.2c.7.5 1.7.1 1.9-.7l2.7-13c.2-.9-.7-1.6-1.5-1.2Z"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span>
                      <strong>تلگرام</strong>
                      <em dir="ltr">{telegramHandle(telegram)}</em>
                    </span>
                  </a>
                ) : null}
                {mail ? (
                  <a className="mzt-contact-channel" href={`mailto:${mail}`}>
                    <span className="mzt-contact-channel-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M4 7.2 12 13l8-5.8" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span>
                      <strong>ایمیل</strong>
                      <em dir="ltr">{mail}</em>
                    </span>
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mzt-contact-card">
              {sent ? (
                <div className="mzt-contact-success">
                  <span className="mzt-contact-success-mark" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3.2 8.4 6.1 11.2 12.8 4.6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <h3 className="mzt-h3">پیامتون ثبت شد</h3>
                  <p className="mzt-body-sm">به‌زودی با شما تماس می‌گیریم.</p>
                </div>
              ) : (
                <form className="mzt-contact-form" onSubmit={submit}>
                  <div className="mzt-contact-form-head">
                    <p className="mzt-contact-form-label">فرم پیام</p>
                    <p className="mzt-contact-form-hint">کمتر از یک دقیقه وقت می‌گیرد</p>
                  </div>
                  <div className="mzt-field-row">
                    <label className="mzt-field">
                      <span>نام</span>
                      <input className="mzt-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                    </label>
                    <label className="mzt-field">
                      <span>نام کافه (اختیاری)</span>
                      <input className="mzt-input" value={cafeName} onChange={(e) => setCafeName(e.target.value)} />
                    </label>
                  </div>
                  <div className="mzt-field-row">
                    <label className="mzt-field">
                      <span>شماره تماس</span>
                      <input
                        className="mzt-input"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        inputMode="tel"
                        autoComplete="tel"
                        dir="ltr"
                      />
                    </label>
                    <label className="mzt-field">
                      <span>ایمیل</span>
                      <input
                        className="mzt-input"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        autoComplete="email"
                        dir="ltr"
                      />
                    </label>
                  </div>
                  <label className="mzt-field mzt-hp" aria-hidden="true">
                    <span>وب‌سایت</span>
                    <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </label>
                  <label className="mzt-field">
                    <span>پیام شما</span>
                    <textarea
                      className="mzt-textarea"
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="مثلاً: می‌خواهم منوی دیجیتال راه‌اندازی کنم…"
                    />
                  </label>
                  {error ? <p className="mzt-contact-error">{error}</p> : null}
                  <button type="submit" className="mzt-btn mzt-btn-primary mzt-btn-block" disabled={sending}>
                    {sending ? "در حال ارسال…" : "ارسال پیام و درخواست تماس"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FinalCTASection() {
  return (
    <section className="mzt-section mzt-band-dark mzt-final-cta">
      <div className="mzt-container">
        <div className="mzt-final-cta-inner mzt-reveal">
          <h2 className="mzt-h2">آماده‌اید کافه‌تان را مدرن‌تر کنید؟</h2>
          <p className="mzt-body">پلن مناسب را انتخاب کنید و از منوی دیجیتال تا مدیریت روزانه، همه‌چیز را یکجا داشته باشید.</p>
          <div className="mzt-cta-actions">
            <a href="#plans" className="mzt-btn mzt-btn-primary mzt-btn-lg">
              مشاهده پلن‌ها
            </a>
            <a href="#contact" className="mzt-btn mzt-btn-secondary mzt-btn-lg">
              تماس با ما
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="mzt-footer mzt-band-dark">
      <div className="mzt-container">
        <div className="mzt-footer-grid">
          <div className="mzt-footer-brand">
            <BrandMark />
            <p className="mzt-body-sm">پلتفرم یکپارچه منوی دیجیتال و مدیریت کافه و رستوران</p>
          </div>
          <div className="mzt-footer-col">
            <strong className="mzt-label">محصول</strong>
            <a href="#why">چرا میزییتو</a>
            <a href="#innovate">امکانات منو</a>
            <a href="#digital-menu">منوی دیجیتال</a>
            <a href="#dashboard">پنل مدیریت</a>
          </div>
          <div className="mzt-footer-col">
            <strong className="mzt-label">شرکت</strong>
            <a href="#plans">قیمت‌ها</a>
            <a href="#faq">سوالات متداول</a>
            <a href="#contact">تماس با ما</a>
          </div>
          <div className="mzt-footer-col">
            <strong className="mzt-label">حساب کاربری</strong>
            <a href="/panel-admin/login/">ورود</a>
            <a href="#plans">خرید پلن</a>
          </div>
        </div>
        <div className="mzt-footer-bottom">
          <small className="mzt-caption">© {new Date().getFullYear()} میزییتو — تمامی حقوق محفوظ است.</small>
        </div>
      </div>
    </footer>
  );
}
