"use client";

import { useEffect, useState } from "react";
import { saFetch } from "@/lib/super-admin/api";
import { formatDate } from "@/lib/super-admin/format";
import type { Cafe, Plan, Subscription } from "@/lib/super-admin/types";
import { toast } from "../ui/Toast";
import { Badge, ErrorBox, PageHeader, SkeletonTable } from "../ui/primitives";

const CYCLE_LABEL: Record<string, string> = {
  monthly: "ماهانه",
  "6months": "۶ ماهه",
  yearly: "سالانه",
};

const TAB_LABEL: Record<string, string> = {
  overview: "خلاصه",
  usage: "مصرف",
  subscription: "اشتراک",
  actions: "اقدامات",
};

function usageLabel(key: string): string {
  const map: Record<string, string> = {
    maxUsers: "حداکثر کاربر",
    maxBranches: "حداکثر شعبه",
    maxMenuItems: "حداکثر آیتم منو",
    maxCategories: "حداکثر دسته",
    maxOrdersPerMonth: "سفارش ماهانه",
    maxCustomers: "حداکثر مشتری",
    storageMb: "فضای ذخیره (مگابایت)",
    users: "کاربران",
    branches: "شعبه‌ها",
    menuItems: "آیتم‌های منو",
    orders: "سفارش‌ها",
    customers: "مشتریان",
  };
  return map[key] || key;
}

export function CafeDetailPage({
  id,
  onNavigate,
}: {
  id: string;
  onNavigate: (href: string) => void;
}) {
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [res, planRes] = await Promise.all([
        saFetch<{ cafe: Cafe; subscription: Subscription | null }>("sa-cafe", { id }),
        saFetch<{ items: Plan[] }>("sa-plans"),
      ]);
      setCafe(res.cafe);
      setSub(res.subscription);
      setPlans(planRes.items || []);
    } catch {
      setError("کافه یافت نشد یا دسترسی ندارید.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function action(name: string, body: Record<string, unknown> = {}) {
    try {
      const res = await saFetch<{ cafe?: Cafe; impersonationToken?: string; banner?: string }>(
        "sa-cafe",
        { id, method: "POST", body: JSON.stringify({ action: name, ...body }) }
      );
      if (name === "impersonate") {
        setImpersonating(true);
        if (res.impersonationToken) {
          sessionStorage.setItem("miiziito-sa-impersonation", res.impersonationToken);
          sessionStorage.setItem("miiziito-sa-impersonation-cafe", id);
        }
        toast(res.banner || "ورود به‌جای کاربر شروع شد", "success");
        return;
      }
      if (res.cafe) setCafe(res.cafe);
      toast("به‌روزرسانی شد", "success");
      load();
    } catch {
      toast("اقدام ناموفق بود", "error");
    }
  }

  async function assignTrial() {
    if (!cafe || !plans[0]) {
      toast("ابتدا یک پلن بسازید", "error");
      return;
    }
    try {
      await saFetch("sa-subscriptions", {
        method: "POST",
        body: JSON.stringify({
          tenantId: cafe.id,
          planId: plans[0].id,
          status: "trial",
          billingCycle: "monthly",
          price: plans[0].prices?.monthly || 0,
        }),
      });
      toast("اشتراک آزمایشی ساخته شد", "success");
      load();
    } catch {
      toast("ایجاد اشتراک ممکن نشد", "error");
    }
  }

  if (loading) return <SkeletonTable rows={8} />;
  if (error || !cafe) return <ErrorBox message={error || "یافت نشد"} onRetry={load} />;

  const usage = cafe.usage || {};
  const plan = plans.find((p) => p.id === cafe.planId);

  return (
    <>
      {impersonating ? (
        <div
          style={{
            background: "var(--sa-warn-soft)",
            color: "var(--sa-warn)",
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>در حال مشاهده این حساب به‌عنوان سوپرادمین هستید.</span>
          <button
            type="button"
            className="sa-btn sa-btn-ghost sa-btn-sm"
            onClick={() => {
              setImpersonating(false);
              sessionStorage.removeItem("miiziito-sa-impersonation");
              sessionStorage.removeItem("miiziito-sa-impersonation-cafe");
              toast("خروج از حالت ورود به‌جای کاربر", "success");
            }}
          >
            خروج از این حالت
          </button>
        </div>
      ) : null}

      <PageHeader
        title={cafe.name}
        description={`${cafe.ownerName || "بدون مالک"} · ${cafe.email || "بدون ایمیل"}`}
        actions={
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => onNavigate("/panel-admin/cafes/")}>
            ← بازگشت
          </button>
        }
      />

      <div className="sa-tabs">
        {["overview", "usage", "subscription", "actions"].map((t) => (
          <button
            key={t}
            type="button"
            className={`sa-tab ${tab === t ? "is-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t] || t}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="sa-panel">
          <div className="sa-panel-body">
            <div className="sa-detail-grid">
              <div className="sa-detail-item">
                <label>وضعیت</label>
                <strong>
                  <Badge status={cafe.status} />
                </strong>
              </div>
              <div className="sa-detail-item">
                <label>پلن</label>
                <strong>{plan?.name || "—"}</strong>
              </div>
              <div className="sa-detail-item">
                <label>تلفن</label>
                <strong>{cafe.phone || "—"}</strong>
              </div>
              <div className="sa-detail-item">
                <label>ایجاد</label>
                <strong>{formatDate(cafe.createdAt)}</strong>
              </div>
              <div className="sa-detail-item">
                <label>آخرین فعالیت</label>
                <strong>{formatDate(cafe.lastActivityAt)}</strong>
              </div>
              <div className="sa-detail-item">
                <label>شناسه کافه</label>
                <strong style={{ fontSize: "0.8rem" }}>{cafe.id}</strong>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "usage" ? (
        <div className="sa-panel">
          <div className="sa-panel-body">
            <div className="sa-detail-grid">
              {Object.entries(usage).map(([k, v]) => (
                <div key={k} className="sa-detail-item">
                  <label>{usageLabel(k)}</label>
                  <strong>{v}</strong>
                </div>
              ))}
              {!Object.keys(usage).length ? <p style={{ color: "var(--sa-text-muted)" }}>هنوز داده مصرفی نیست.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "subscription" ? (
        <div className="sa-panel">
          <div className="sa-panel-body">
            {!sub ? (
              <div>
                <p style={{ color: "var(--sa-text-muted)" }}>اشتراکی متصل نیست.</p>
                <button type="button" className="sa-btn sa-btn-primary" onClick={assignTrial}>
                  شروع آزمایشی
                </button>
              </div>
            ) : (
              <div className="sa-detail-grid">
                <div className="sa-detail-item">
                  <label>وضعیت</label>
                  <strong>
                    <Badge status={sub.status} />
                  </strong>
                </div>
                <div className="sa-detail-item">
                  <label>دوره صورتحساب</label>
                  <strong>{CYCLE_LABEL[sub.billingCycle] || sub.billingCycle}</strong>
                </div>
                <div className="sa-detail-item">
                  <label>شروع</label>
                  <strong>{formatDate(sub.startDate)}</strong>
                </div>
                <div className="sa-detail-item">
                  <label>پایان</label>
                  <strong>{formatDate(sub.endDate)}</strong>
                </div>
                <div className="sa-detail-item">
                  <label>پایان آزمایشی</label>
                  <strong>{formatDate(sub.trialEndDate)}</strong>
                </div>
                <div className="sa-detail-item">
                  <label>تمدید خودکار</label>
                  <strong>{sub.autoRenew ? "بله" : "خیر"}</strong>
                </div>
                <div className="sa-detail-item">
                  <label>وضعیت پرداخت</label>
                  <strong>
                    <Badge status={sub.paymentStatus} />
                  </strong>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "actions" ? (
        <div className="sa-panel">
          <div className="sa-panel-body">
            <div className="sa-actions-row">
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => action("suspend", { reason: "تعلیق توسط ادمین" })}>
                تعلیق
              </button>
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => action("reactivate")}>
                فعال‌سازی مجدد
              </button>
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => action("impersonate")}>
                ورود به‌جای کافه
              </button>
              <button
                type="button"
                className="sa-btn sa-btn-danger"
                onClick={() => {
                  if (confirm("این کافه برای همیشه حذف شود؟")) action("delete");
                }}
              >
                حذف
              </button>
            </div>
            <p style={{ marginTop: 16, fontSize: "0.85rem", color: "var(--sa-text-faint)" }}>
              ورود به‌جای کاربر در گزارش فعالیت ثبت می‌شود و با بنر مشخص نمایش داده می‌شود.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
