"use client";

import { BrandMark } from "@/components/panel-admin/BrandMark";

import { useEffect, useMemo, useState } from "react";
import { saFetch } from "@/lib/super-admin/api";
import { formatDate, formatMoney } from "@/lib/super-admin/format";
import type { Cafe, Plan, Subscription } from "@/lib/super-admin/types";
import { toast } from "../ui/Toast";
import { Badge, ErrorBox, PageHeader, SkeletonTable } from "../ui/primitives";

type RequestRow = {
  id: string;
  type: string;
  status: string;
  planName?: string;
  billingCycle?: string;
  price?: number;
  createdAt: string;
  note?: string;
};

const CYCLE_LABEL: Record<string, string> = {
  monthly: "ماهانه",
  "6months": "۶ ماهه",
  yearly: "سالانه",
};

export function CafePortalPage({
  onNavigate,
  onLogout,
  preselectPlan,
  preselectCycle,
}: {
  onNavigate: (href: string) => void;
  onLogout: () => void;
  preselectPlan?: string;
  preselectCycle?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [history, setHistory] = useState<Subscription[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState(preselectPlan || "");
  const [cycle, setCycle] = useState(preselectCycle || "monthly");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await saFetch<{
        cafe: Cafe | null;
        plan: Plan | null;
        subscription: Subscription | null;
        history: Subscription[];
        requests: RequestRow[];
        plans: Plan[];
      }>("sa-cafe-portal");
      setCafe(data.cafe);
      setPlan(data.plan);
      setSub(data.subscription);
      setHistory(data.history || []);
      setRequests(data.requests || []);
      setPlans(data.plans || []);
      if (!planId && data.plans?.[0]) setPlanId(data.plans[0].id);
    } catch {
      setError("بارگذاری حساب ممکن نشد. دوباره وارد شوید.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(() => plans.find((p) => p.id === planId), [plans, planId]);
  const price = selected?.prices?.[cycle as "monthly" | "6months" | "yearly"] ?? 0;

  async function sendRequest() {
    if (!planId) {
      toast("یک پلن انتخاب کنید", "error");
      return;
    }
    setSending(true);
    try {
      await saFetch("sa-recharge-requests", {
        method: "POST",
        body: JSON.stringify({
          planId,
          billingCycle: cycle,
          type: sub ? "recharge" : "purchase",
          note,
        }),
      });
      toast("درخواست ثبت شد. به‌زودی با شما تماس می‌گیریم.", "success");
      setNote("");
      load();
    } catch {
      toast("ثبت درخواست ناموفق بود", "error");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <SkeletonTable rows={6} />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="sa-portal">
      <header className="sa-store-nav">
        <div className="sa-store-brand">
          <BrandMark />
          <small>حساب اشتراک</small>
        </div>
        <div className="sa-store-nav-actions">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => onNavigate("/panel-admin/")}>
            فروشگاه
          </button>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onLogout}>
            خروج
          </button>
        </div>
      </header>

      <PageHeader
        title={cafe?.name || "حساب من"}
        description="پلن فعلی، تاریخچه و درخواست خرید / تمدید"
      />

      <div className="sa-grid-2">
        <div className="sa-panel">
          <div className="sa-panel-head">
            <h2>پلن فعلی</h2>
          </div>
          <div className="sa-panel-body">
            <div className="sa-detail-grid">
              <div className="sa-detail-item">
                <label>وضعیت کافه</label>
                <strong>{cafe ? <Badge status={cafe.status} /> : "—"}</strong>
              </div>
              <div className="sa-detail-item">
                <label>پلن</label>
                <strong>{plan?.name || "هنوز پلنی فعال نیست"}</strong>
              </div>
              <div className="sa-detail-item">
                <label>وضعیت اشتراک</label>
                <strong>{sub ? <Badge status={sub.status} /> : "—"}</strong>
              </div>
              <div className="sa-detail-item">
                <label>دوره</label>
                <strong>{sub ? CYCLE_LABEL[sub.billingCycle] || sub.billingCycle : "—"}</strong>
              </div>
              <div className="sa-detail-item">
                <label>شروع</label>
                <strong>{formatDate(sub?.startDate)}</strong>
              </div>
              <div className="sa-detail-item">
                <label>پایان</label>
                <strong>{formatDate(sub?.endDate)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="sa-panel">
          <div className="sa-panel-head">
            <h2>درخواست خرید / تمدید</h2>
          </div>
          <div className="sa-panel-body">
            <p style={{ color: "var(--sa-text-muted)", fontSize: "0.9rem", marginTop: 0 }}>
              پرداخت آنلاین نداریم. درخواست بفرستید؛ ما تماس می‌گیریم یا تیکت می‌زنیم و حساب را شارژ می‌کنیم.
            </p>
            <div className="sa-field">
              <label className="sa-label">پلن</label>
              <select className="sa-select" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sa-field">
              <label className="sa-label">دوره</label>
              <select className="sa-select" value={cycle} onChange={(e) => setCycle(e.target.value)}>
                <option value="monthly">ماهانه</option>
                <option value="6months">۶ ماهه</option>
                <option value="yearly">سالانه</option>
              </select>
            </div>
            <div className="sa-field">
              <label className="sa-label">مبلغ تقریبی</label>
              <strong>{formatMoney(price)}</strong>
            </div>
            <div className="sa-field">
              <label className="sa-label">توضیح (اختیاری)</label>
              <textarea
                className="sa-textarea"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="مثلاً: تمدید برای ماه بعد، یا ارتقا به پلن حرفه‌ای"
              />
            </div>
            <button type="button" className="sa-btn sa-btn-primary" disabled={sending} onClick={sendRequest}>
              {sending ? "در حال ارسال…" : "ارسال درخواست"}
            </button>
          </div>
        </div>
      </div>

      <div className="sa-panel" style={{ marginTop: 16 }}>
        <div className="sa-panel-head">
          <h2>درخواست‌های اخیر</h2>
        </div>
        {!requests.length ? (
          <div className="sa-empty" style={{ padding: 28 }}>
            هنوز درخواستی ثبت نکرده‌اید.
          </div>
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>پلن</th>
                  <th>دوره</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td data-label="پلن">{r.planName}</td>
                    <td data-label="دوره">{CYCLE_LABEL[r.billingCycle || ""] || r.billingCycle}</td>
                    <td data-label="مبلغ">{formatMoney(r.price || 0)}</td>
                    <td data-label="وضعیت">
                      <Badge status={r.status} />
                    </td>
                    <td data-label="تاریخ">{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="sa-panel" style={{ marginTop: 16 }}>
        <div className="sa-panel-head">
          <h2>تاریخچه اشتراک</h2>
        </div>
        {!history.length ? (
          <div className="sa-empty" style={{ padding: 28 }}>
            تاریخچه‌ای ثبت نشده است.
          </div>
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>شناسه</th>
                  <th>وضعیت</th>
                  <th>دوره</th>
                  <th>شروع</th>
                  <th>پایان</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td data-label="شناسه">{h.id.slice(0, 14)}…</td>
                    <td data-label="وضعیت">
                      <Badge status={h.status} />
                    </td>
                    <td data-label="دوره">{CYCLE_LABEL[h.billingCycle] || h.billingCycle}</td>
                    <td data-label="شروع">{formatDate(h.startDate)}</td>
                    <td data-label="پایان">{formatDate(h.endDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
