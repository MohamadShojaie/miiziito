"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- plan purchase uses real hrefs for reliability */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  InnovateFeaturesSection,
  LandingFooter,
  LandingNav,
  ModularAddonsSection,
  PricingComparisonBlock,
  TestimonialsSection,
  UnifiedPlatformSection,
  WhySection,
  ContactSection,
} from "./StoreSections";

const CYCLE_LABEL: Record<string, string> = {
  "6months": "۶ ماهه",
  yearly: "سالانه",
};

/** Fallback benefit lines from plan entitlements when marketing copy is empty */
const FEATURE_BENEFIT: Record<string, string> = {
  invoices: "فاکتور (نقد، کارت، تقسیم، نسیه)",
  reservations: "رزرو میز",
  coupons: "کوپن تخفیف",
  advancedAnalytics: "آمار فروش",
  paymentTerminal: "پایانه پرداخت / کارتخوان",
  crm: "باشگاه مشتریان",
  hardware: "سخت‌افزار و پرینتر",
  kitchenPrint: "چاپ تیکت آشپزخانه / بار",
  tableOps: "وضعیت میز و سفارش از نقشه میزها",
};

const BOOLEAN_PRIORITY = [
  "invoices",
  "reservations",
  "coupons",
  "advancedAnalytics",
  "paymentTerminal",
  "crm",
  "hardware",
  "kitchenPrint",
  "tableOps",
] as const;

function planBenefitLines(plan: Plan): string[] {
  const custom = (plan.marketingFeatures || [])
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 20);
  if (custom.length) return custom;

  const ent = plan.entitlements || {};
  const lines: string[] = [];

  for (const key of BOOLEAN_PRIORITY) {
    if (ent[key] === true) {
      lines.push(FEATURE_BENEFIT[key] || key);
    }
  }

  for (const [key, value] of Object.entries(ent)) {
    if (lines.length >= 10) break;
    if (BOOLEAN_PRIORITY.includes(key as (typeof BOOLEAN_PRIORITY)[number])) continue;
    if (value === true) {
      lines.push(FEATURE_BENEFIT[key] || key);
    }
  }

  return lines.slice(0, 10);
}

function yearlySavePercent(plan: Plan): number | null {
  const six = Number(plan.prices?.["6months"] || 0);
  const yearly = Number(plan.prices?.yearly || 0);
  if (!six || !yearly) return null;
  return savingsPercent(six / 6, yearly, 12);
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
  const [supportPhone, setSupportPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<"6months" | "yearly">("6months");
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
    saFetch<{ plans: Plan[]; supportNote?: string; supportPhone?: string }>("sa-public-plans", { skipAuth: true })
      .then((r) => {
        setPlans(r.plans || []);
        setNote(r.supportNote || "");
        setSupportPhone(r.supportPhone || "");
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
  const yearlySave = useMemo(() => {
    let best: number | null = null;
    for (const p of plans) {
      const pct = yearlySavePercent(p);
      if (pct && (best === null || pct > best)) best = pct;
    }
    return best;
  }, [plans]);

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
        <InnovateFeaturesSection />
        <UnifiedPlatformSection />
        <DigitalMenuSection />
        <DashboardSection />
        <HowItWorksSection />

        <section className="mzt-section mzt-band-light mzt-pricing" ref={plansRef} id="plans" aria-labelledby="plans-title">
          <div className="mzt-container">
            <div className="mzt-section-head mzt-reveal">
              <span className="mzt-badge">قیمت‌گذاری</span>
              <h2 className="mzt-h2" id="plans-title">پلن مناسب کسب‌وکار خودت را انتخاب کن</h2>
              <p className="mzt-body">ساده، شفاف و بدون پیچیدگی — ویژگی هر پلن را قبل از خرید ببینید.</p>
              <div className="mzt-cycle" role="tablist" aria-label="دوره اشتراک">
                {(["6months", "yearly"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={cycle === c}
                    className={cycle === c ? "is-active" : ""}
                    onClick={() => setCycle(c)}
                  >
                    {CYCLE_LABEL[c]}
                    {c === "yearly" && yearlySave ? (
                      <span className="mzt-cycle-save">
                        صرفه‌جویی {yearlySave.toLocaleString("fa-IR")}٪
                      </span>
                    ) : null}
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
                  const sixMonth = p.prices?.["6months"] ?? 0;
                  const months = cycle === "yearly" ? 12 : 6;
                  const monthlyEq = sixMonth > 0 ? sixMonth / 6 : 0;
                  const save = cycle === "yearly" ? savingsPercent(monthlyEq, price, months) : null;
                  const featured = plans.length >= 2 && i === mid;
                  const benefits = planBenefitLines(p);
                  return (
                    <article key={p.id} className={`mzt-surface mzt-surface--elevated mzt-plan ${featured ? "is-featured" : ""}`}>
                      {featured ? <span className="mzt-plan-badge">پیشنهاد ما</span> : null}
                      <header className="mzt-plan-head">
                        <h3>{p.name}</h3>
                        <p className="mzt-plan-desc">
                          {p.description || `ویژگی‌های ${p.name} برای مدیریت کافه و منوی دیجیتال`}
                        </p>
                      </header>
                      <div className="mzt-plan-pricebox">
                        <div className="mzt-plan-price">
                          <strong>{formatMoney(price)}</strong>
                          <span>/ {CYCLE_LABEL[cycle]}</span>
                        </div>
                        {save ? (
                          <div className="mzt-plan-save">
                            صرفه‌جویی {save.toLocaleString("fa-IR")}٪ با اشتراک سالانه
                          </div>
                        ) : null}
                      </div>
                      <div className="mzt-plan-feats-wrap">
                        <p className="mzt-plan-feats-label">چی برات فعاله</p>
                        <ul className="mzt-plan-feats">
                          {(benefits.length ? benefits : ["منوی دیجیتال و پنل مدیریت تحت وب"]).map((line) => (
                            <li key={line}>
                              <span className="mzt-plan-feat-mark" aria-hidden="true">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                  <path
                                    d="M3.2 8.4 6.1 11.2 12.8 4.6"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <a
                        href={planHref(p.id)}
                        className={`mzt-btn mzt-btn-block mzt-plan-cta ${featured ? "mzt-btn-primary" : "mzt-btn-secondary"}`}
                      >
                        {isLoggedIn ? "انتخاب این پلن" : featured ? "با این پلن شروع کن" : "امروز شروع کن"}
                      </a>
                    </article>
                  );
                })
              )}
            </div>
            {note ? <p className="mzt-note mzt-reveal">{note}</p> : null}

            <ModularAddonsSection />

            <div className="mzt-band-divider" aria-hidden="true" />
            <PricingComparisonBlock />
          </div>
        </section>

        <TestimonialsSection />
        <FAQSection />
        <ContactSection supportPhone={supportPhone} />
        <FinalCTASection />
      </main>

      <LandingFooter />
    </div>
  );
}
