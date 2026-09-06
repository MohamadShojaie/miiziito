"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- plan purchase uses real hrefs for reliability */

import { useCallback, useEffect, useRef, useState } from "react";
import { saFetch } from "@/lib/super-admin/api";
import { formatMoney, savingsPercent } from "@/lib/super-admin/format";
import type { Plan } from "@/lib/super-admin/types";
import { useReveal } from "@/components/panel-admin/store/useReveal";
import {
  CapabilityStripSection,
  DashboardSection,
  DigitalMenuSection,
  FAQSection,
  FinalCTASection,
  HeroSection,
  HowItWorksSection,
  LandingFooter,
  LandingNav,
  PricingComparisonBlock,
  TestimonialsSection,
  UnifiedPlatformSection,
  WhySection,
} from "./StoreSections";

const CYCLE_LABEL: Record<string, string> = {
  monthly: "ماهانه",
  "6months": "۶ ماهه",
  yearly: "سالانه",
};

function featureLabel(key: string): string {
  const map: Record<string, string> = {
    maxUsers: "حداکثر کاربر",
    maxBranches: "حداکثر شعبه",
    maxMenuItems: "حداکثر آیتم منو",
    maxCategories: "حداکثر دسته",
    maxOrdersPerMonth: "سفارش ماهانه",
    maxCustomers: "حداکثر مشتری",
    storageMb: "فضای ذخیره (مگابایت)",
    digitalMenu: "منوی دیجیتال",
    qrMenu: "منوی QR",
    orderManagement: "مدیریت سفارش",
    cashier: "صندوق‌دار",
    crm: "باشگاه مشتریان",
    paymentTerminal: "کارتخوان",
    advancedAnalytics: "تحلیل پیشرفته",
    multipleUsers: "چندکاربره",
    multipleBranches: "چندشعبه",
    customBranding: "برندینگ اختصاصی",
    customDomain: "دامنه اختصاصی",
    prioritySupport: "پشتیبانی ویژه",
  };
  return map[key] || key;
}

export function StorePage({
  isLoggedIn,
  kind,
}: {
  isLoggedIn: boolean;
  kind: "admin" | "cafe" | null;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<"monthly" | "6months" | "yearly">("monthly");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const plansRef = useRef<HTMLElement>(null);

  useReveal([loading, plans.length]);

  const scrollTo = useCallback((id: string) => {
    const el = (id === "plans" ? plansRef.current : null) ?? document.getElementById(id);
    if (!el) return;

    const offset = 72;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });

    if (typeof window.history?.replaceState === "function") {
      const base = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, "", `${base}#${id}`);
    }
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const delay = hash === "plans" && loading ? 350 : 80;
    const t = window.setTimeout(() => scrollTo(hash), delay);
    return () => window.clearTimeout(t);
  }, [scrollTo, loading]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    saFetch<{ plans: Plan[]; supportNote?: string }>("sa-public-plans", { skipAuth: true })
      .then((r) => {
        setPlans(r.plans || []);
        setNote(r.supportNote || "");
      })
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  function planHref(planId: string): string {
    if (!planId) return "#plans";
    if (kind === "admin") return "/panel-admin/manage/";
    if (kind === "cafe") {
      return `/panel-admin/account/?plan=${encodeURIComponent(planId)}&cycle=${encodeURIComponent(cycle)}`;
    }
    return `/panel-admin/login/?next=account&plan=${encodeURIComponent(planId)}&cycle=${encodeURIComponent(cycle)}`;
  }

  const mid = Math.floor((plans.length - 1) / 2);

  return (
    <div className="mzt-landing">
      <LandingNav
        scrolled={scrolled}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((v) => !v)}
        isLoggedIn={isLoggedIn}
        kind={kind}
      />

      <main>
        <HeroSection />
        <CapabilityStripSection />
        <WhySection />
        <UnifiedPlatformSection />
        <DigitalMenuSection />
        <DashboardSection />
        <HowItWorksSection />

        <section className="mzt-section mzt-band-light mzt-pricing" ref={plansRef} id="plans" aria-labelledby="plans-title">
          <div className="mzt-container">
            <div className="mzt-section-head mzt-reveal">
              <span className="mzt-badge">قیمت‌گذاری</span>
              <h2 className="mzt-h2" id="plans-title">پلن مناسب کسب‌وکار خودت را انتخاب کن</h2>
              <p className="mzt-body">ساده، شفاف و بدون پیچیدگی.</p>
              <div className="mzt-cycle" role="tablist" aria-label="دوره اشتراک">
                {(["monthly", "6months", "yearly"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={cycle === c}
                    className={cycle === c ? "is-active" : ""}
                    onClick={() => setCycle(c)}
                  >
                    {CYCLE_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mzt-plans mzt-reveal">
              {loading ? (
                <>
                  <div className="mzt-skeleton" />
                  <div className="mzt-skeleton" />
                  <div className="mzt-skeleton" />
                </>
              ) : !plans.length ? (
                <div className="mzt-empty">
                  <h3>هنوز پلنی منتشر نشده</h3>
                  <p>به‌زودی پلن‌های اشتراک اینجا نمایش داده می‌شوند.</p>
                </div>
              ) : (
                plans.map((p, i) => {
                  const price = p.prices?.[cycle] ?? 0;
                  const monthly = p.prices?.monthly ?? 0;
                  const months = cycle === "yearly" ? 12 : cycle === "6months" ? 6 : 1;
                  const save = months > 1 ? savingsPercent(monthly, price, months) : null;
                  const featured = plans.length >= 2 && i === mid;
                  return (
                    <article key={p.id} className={`mzt-surface mzt-surface--elevated mzt-plan ${featured ? "is-featured" : ""}`}>
                      {featured ? <span className="mzt-plan-badge">پیشنهاد ما</span> : null}
                      <h3>{p.name}</h3>
                      <p className="mzt-plan-desc">{p.description}</p>
                      <div className="mzt-plan-price">
                        <strong>{formatMoney(price)}</strong>
                        <span>/ {CYCLE_LABEL[cycle]}</span>
                      </div>
                      {save ? <div className="mzt-plan-save">صرفه‌جویی {save.toLocaleString("fa-IR")}٪</div> : null}
                      <ul className="mzt-plan-feats">
                        {Object.entries(p.entitlements || {})
                          .filter(([, v]) => v === true || (typeof v === "number" && v > 0))
                          .slice(0, 7)
                          .map(([k, v]) => (
                            <li key={k}>
                              {featureLabel(k)}
                              {typeof v === "number" ? ` — ${v.toLocaleString("fa-IR")}` : ""}
                            </li>
                          ))}
                      </ul>
                      <a
                        href={planHref(p.id)}
                        className="mzt-btn mzt-btn-primary mzt-btn-block mzt-plan-cta"
                      >
                        {isLoggedIn ? "انتخاب این پلن" : "خرید این پلن"}
                      </a>
                    </article>
                  );
                })
              )}
            </div>
            {note ? <p className="mzt-note mzt-reveal">{note}</p> : null}

            <div className="mzt-band-divider" aria-hidden="true" />
            <PricingComparisonBlock />
          </div>
        </section>

        <TestimonialsSection />
        <FAQSection />
        <FinalCTASection />
      </main>

      <LandingFooter />
    </div>
  );
}
