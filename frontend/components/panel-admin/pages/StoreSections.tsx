"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- full page navigation to panel-admin SPA */

import { useState, type ReactNode } from "react";
import { BrandMark } from "@/components/panel-admin/BrandMark";
import {
  IconCheck,
  IconMobile,
  IconQr,
  TAB_ICONS,
} from "@/components/admin/CashierIcons";
import { DesktopMockup, HeroMockups, PhoneMockup } from "@/components/panel-admin/store/ProductMockup";
import { FeatureCheckList, TrustStats } from "@/components/panel-admin/store/ProductPreviews";

/* ── Data ── */

const CAPABILITY_TAGS = [
  "منوی دیجیتال QR",
  "سفارش آنلاین",
  "صندوق و فاکتور",
  "باشگاه مشتریان",
  "گزارش فروش",
  "کد تخفیف",
  "رزرو میز",
  "مدیریت محصولات",
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
    a: "پلن‌های ماهانه، ۶ ماهه و سالانه با امکانات متفاوت وجود دارد. جزئیات در بخش قیمت‌گذاری نمایش داده می‌شود.",
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
    { id: "digital-menu", label: "منوی دیجیتال" },
    { id: "dashboard", label: "پنل مدیریت" },
    { id: "plans", label: "قیمت‌ها" },
    { id: "faq", label: "سوالات متداول" },
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
          <p className="mzt-body">ابزارهایی که کارهای پراکنده و دستی را ساده می‌کنند — در یک پلتفرم.</p>
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
            <FeatureCheckList items={["دسته‌بندی سریع", "تصاویر محصولات", "توضیحات و قیمت", "سبد خرید", "سفارش آنلاین"]} />
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
    <section className="mzt-section mzt-band-light-continued mzt-testimonials">
      <div className="mzt-container">
        <div className="mzt-section-head mzt-reveal">
          <SectionBadge>نظرات کاربران</SectionBadge>
          <h2 className="mzt-h2">مورد اعتماد کافه‌داران</h2>
        </div>
        <div className="mzt-surface mzt-surface--elevated mzt-testimonial-empty mzt-reveal">
          <p className="mzt-body">
            به‌زودی نظرات واقعی کافه‌داران و رستوران‌دارانی که از میزییتو استفاده می‌کنند اینجا قرار می‌گیرد.
          </p>
          <span className="mzt-caption">نظرات واقعی — بدون نقل‌قول ساختگی</span>
        </div>
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
            <a href="/panel-admin/login/" className="mzt-btn mzt-btn-secondary mzt-btn-lg">
              ورود
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
            <a href="#digital-menu">منوی دیجیتال</a>
            <a href="#dashboard">پنل مدیریت</a>
          </div>
          <div className="mzt-footer-col">
            <strong className="mzt-label">شرکت</strong>
            <a href="#plans">قیمت‌ها</a>
            <a href="#faq">سوالات متداول</a>
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
