"use client";

import { BrandMark } from "@/components/panel-admin/BrandMark";

import { useEffect, useState } from "react";
import { saFetch } from "@/lib/super-admin/api";
import { formatMoney, savingsPercent } from "@/lib/super-admin/format";
import type { Plan } from "@/lib/super-admin/types";

const CYCLE_LABEL: Record<string, string> = {
  monthly: "ماهانه",
  "6months": "۶ ماهه",
  yearly: "سالانه",
};

export function StorePage({
  onNavigate,
  isLoggedIn,
  kind,
}: {
  onNavigate: (href: string) => void;
  isLoggedIn: boolean;
  kind: "admin" | "cafe" | null;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<"monthly" | "6months" | "yearly">("monthly");

  useEffect(() => {
    saFetch<{ plans: Plan[]; supportNote?: string }>("sa-public-plans", { skipAuth: true })
      .then((r) => {
        setPlans(r.plans || []);
        setNote(r.supportNote || "");
      })
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  function cta(planId: string) {
    if (kind === "admin") {
      onNavigate("/panel-admin/manage/");
      return;
    }
    if (kind === "cafe") {
      onNavigate(`/panel-admin/account/?plan=${encodeURIComponent(planId)}&cycle=${cycle}`);
      return;
    }
    onNavigate(`/panel-admin/login/?next=account&plan=${encodeURIComponent(planId)}&cycle=${cycle}`);
  }

  const mid = Math.floor((plans.length - 1) / 2);

  return (
    <div className="sa-store">
      <header className="sa-store-nav">
        <div className="sa-store-brand">
          <BrandMark />
          <small>اشتراک نرم‌افزار کافه و رستوران</small>
        </div>
        <div className="sa-store-nav-actions">
          {isLoggedIn ? (
            <button
              type="button"
              className="sa-btn sa-btn-primary"
              onClick={() =>
                onNavigate(kind === "admin" ? "/panel-admin/manage/" : "/panel-admin/account/")
              }
            >
              {kind === "admin" ? "پنل مدیریت" : "حساب من"}
            </button>
          ) : (
            <>
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => onNavigate("/panel-admin/login/")}>
                ورود
              </button>
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => onNavigate("/panel-admin/register/")}>
                ثبت‌نام کافه
              </button>
            </>
          )}
        </div>
      </header>

      <section className="sa-store-hero">
        <h1>پلن مناسب کافه یا رستوران خود را انتخاب کنید</h1>
        <p>
          منوی دیجیتال، صندوق، سفارش و باشگاه مشتریان — بدون پرداخت آنلاین.
          درخواست بفرستید؛ ما تماس می‌گیریم و اشتراک را فعال می‌کنیم.
        </p>
        <div className="sa-cycle-toggle" role="tablist" aria-label="دوره اشتراک">
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
      </section>

      <section className="sa-store-plans">
        {loading ? (
          <>
            <div className="sa-skeleton" style={{ height: 360, borderRadius: 22 }} />
            <div className="sa-skeleton" style={{ height: 360, borderRadius: 22 }} />
            <div className="sa-skeleton" style={{ height: 360, borderRadius: 22 }} />
          </>
        ) : !plans.length ? (
          <div className="sa-empty" style={{ gridColumn: "1 / -1" }}>
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
              <article key={p.id} className={`sa-plan-card ${featured ? "is-featured" : ""}`}>
                <h2>{p.name}</h2>
                <p className="sa-plan-desc">{p.description}</p>
                <div className="sa-plan-price">
                  <strong>{formatMoney(price)}</strong>
                  <span>/ {CYCLE_LABEL[cycle]}</span>
                </div>
                {save ? <div className="sa-plan-save">صرفه‌جویی {save.toLocaleString("fa-IR")}٪</div> : null}
                <ul className="sa-plan-feats">
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
                <button
                  type="button"
                  className="sa-btn sa-btn-primary"
                  style={{ width: "100%", marginTop: "auto" }}
                  onClick={() => cta(p.id)}
                >
                  درخواست خرید / تمدید
                </button>
              </article>
            );
          })
        )}
      </section>

      {note ? <p className="sa-store-note">{note}</p> : null}
    </div>
  );
}

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
