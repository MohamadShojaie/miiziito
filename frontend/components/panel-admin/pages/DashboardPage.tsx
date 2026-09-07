"use client";

import { useEffect, useState } from "react";
import { saFetch } from "@/lib/super-admin/api";
import { formatMoney, formatNumber } from "@/lib/super-admin/format";
import type { DashboardData, Plan } from "@/lib/super-admin/types";
import {
  Badge,
  ErrorBox,
  KpiCard,
  PageHeader,
  SkeletonKpis,
} from "../ui/primitives";

export function DashboardPage({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [dash, planRes] = await Promise.all([
        saFetch<DashboardData>("sa-dashboard"),
        saFetch<{ items: Plan[] }>("sa-plans").catch(() => ({ items: [] as Plan[] })),
      ]);
      setData(dash);
      setPlans(planRes.items || []);
    } catch (e) {
      setError((e as Error).message === "auth_required" ? "نشست منقضی شده است." : "بارگذاری داشبورد ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const planName = (id: string) => plans.find((p) => p.id === id)?.name || id;

  if (loading) {
    return (
      <>
        <PageHeader title="داشبورد" description="وضعیت کسب‌وکار پلتفرم در یک نگاه" />
        <SkeletonKpis count={9} />
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader title="داشبورد" />
        <ErrorBox message={error || "داده‌ای نیست"} onRetry={load} />
      </>
    );
  }

  const k = data.kpis;

  return (
    <>
      <PageHeader
        title="داشبورد"
        description="سلامت و رشد اشتراک‌های پلتفرم"
        actions={
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => onNavigate("/panel-admin/cafes/")}>
            مدیریت کافه‌ها
          </button>
        }
      />
      <div className="sa-kpi-grid">
        <KpiCard label="کل کافه‌ها" value={k.totalCafes?.value ?? 0} change={k.totalCafes?.change} formatValue={formatNumber} />
        <KpiCard label="کافه‌های فعال" value={k.activeCafes?.value ?? 0} change={k.activeCafes?.change} />
        <KpiCard label="آزمایشی" value={k.trialCafes?.value ?? 0} change={k.trialCafes?.change} />
        <KpiCard label="معلق" value={k.suspendedCafes?.value ?? 0} change={k.suspendedCafes?.change} />
        <KpiCard label="اشتراک منقضی" value={k.expiredSubscriptions?.value ?? 0} change={k.expiredSubscriptions?.change} />
        <KpiCard label="درآمد ماهانه تکراری" value={k.mrr?.value ?? 0} change={k.mrr?.change} formatValue={(n) => formatMoney(n)} />
        <KpiCard label="درآمد سالانه تکراری" value={k.arr?.value ?? 0} change={k.arr?.change} formatValue={(n) => formatMoney(n)} />
        <KpiCard label="مشتری جدید" value={k.newCustomers?.value ?? 0} change={k.newCustomers?.change} />
        <KpiCard label="نرخ ریزش" value={k.churnRate?.value ?? 0} change={k.churnRate?.change} formatValue={(n) => `${n.toLocaleString("fa-IR")}٪`} />
      </div>

      <div className="sa-grid-2">
        <div className="sa-panel">
          <div className="sa-panel-head">
            <h2>به‌زودی منقضی می‌شود</h2>
            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => onNavigate("/panel-admin/subscriptions/")}>
              مشاهده همه
            </button>
          </div>
          <div className="sa-table-wrap">
            {(data.expiringSoon || []).length === 0 ? (
              <div className="sa-empty" style={{ padding: 36 }}>
                <h3>موردی نیست</h3>
                <p>طی ۱۴ روز آینده اشتراکی منقضی نمی‌شود.</p>
              </div>
            ) : (
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>اشتراک</th>
                    <th>پلن</th>
                    <th>پایان</th>
                    <th>وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {data.expiringSoon.map((s) => (
                    <tr key={s.id}>
                      <td data-label="اشتراک">{s.id}</td>
                      <td data-label="پلن">{planName(s.planId)}</td>
                      <td data-label="پایان">{(s.endDate || "").slice(0, 10)}</td>
                      <td data-label="وضعیت">
                        <Badge status={s.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="sa-panel">
          <div className="sa-panel-head">
            <h2>پلن‌های محبوب</h2>
          </div>
          <div className="sa-panel-body">
            {(data.popularPlans || []).length === 0 ? (
              <p style={{ color: "var(--sa-text-muted)", margin: 0, fontSize: "0.9rem", lineHeight: 1.7 }}>
                هنوز اشتراک فعالی نیست. با فعال‌سازی درخواست‌ها، محبوبیت پلن‌ها اینجا دیده می‌شود.
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {data.popularPlans.map((p) => (
                  <li
                    key={p.planId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "12px 0",
                      borderBottom: "1px solid var(--sa-border)",
                    }}
                  >
                    <span>{planName(p.planId)}</span>
                    <strong>{p.count.toLocaleString("fa-IR")}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="sa-panel">
        <div className="sa-panel-head">
          <h2>پرداخت‌های اخیر</h2>
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => onNavigate("/panel-admin/payments/")}>
            همه پرداخت‌ها
          </button>
        </div>
        <div className="sa-table-wrap">
          {(data.recentPayments || []).length === 0 ? (
            <div className="sa-empty" style={{ padding: 36 }}>
              <h3>پرداختی ثبت نشده</h3>
              <p>پرداخت‌های دستی یا تأییدشده اینجا نمایش داده می‌شوند.</p>
            </div>
          ) : (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>کافه</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td data-label="کافه">{p.cafeName || p.id}</td>
                    <td data-label="مبلغ">{formatMoney(p.amount, p.currency)}</td>
                    <td data-label="وضعیت">
                      <Badge status={p.status} />
                    </td>
                    <td data-label="تاریخ">{(p.createdAt || "").slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
