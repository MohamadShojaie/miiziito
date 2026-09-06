"use client";

import { useEffect, useState } from "react";
import { saFetch } from "@/lib/super-admin/api";
import { formatDate, formatMoney } from "@/lib/super-admin/format";
import type {
  AdminUser,
  AuditLog,
  Cafe,
  Coupon,
  DashboardData,
  HealthService,
  PageResult,
  SaasPayment,
  Subscription,
  SupportTicket,
} from "@/lib/super-admin/types";
import { toast } from "../ui/Toast";
import {
  Badge,
  EmptyState,
  ErrorBox,
  KpiCard,
  Modal,
  PageHeader,
  SkeletonKpis,
  SkeletonTable,
} from "../ui/primitives";

const CYCLE_LABEL: Record<string, string> = {
  monthly: "ماهانه",
  "6months": "۶ ماهه",
  yearly: "سالانه",
};

const STATUS_OPT: Record<string, string> = {
  trial: "آزمایشی",
  active: "فعال",
  past_due: "معوق",
  grace_period: "مهلت",
  expired: "منقضی",
  cancelled: "لغو شده",
  suspended: "معلق",
  successful: "موفق",
  pending: "در انتظار",
  failed: "ناموفق",
  refunded: "استرداد",
  unknown: "نامشخص",
  open: "باز",
  in_progress: "در حال پیگیری",
  waiting_customer: "منتظر مشتری",
  needs_reply: "نیاز به پاسخ",
  resolved: "حل‌شده",
  closed: "بسته",
};

const NOTIF_TYPE: Record<string, string> = {
  system: "سیستمی",
  subscription: "اشتراک",
  payment: "پرداخت",
  maintenance: "نگهداری",
  promotion: "تبلیغاتی",
  announcement: "اطلاعیه",
};

const ROLE_NAME_FA: Record<string, string> = {
  Owner: "مالک",
  "Super Admin": "سوپرادمین",
  Support: "پشتیبانی",
  Finance: "مالی",
  Manager: "مدیر",
};

const ROLE_DESC_FA: Record<string, string> = {
  Owner: "دسترسی کامل به پلتفرم",
  "Super Admin": "دسترسی عملیاتی گسترده",
  Support: "پشتیبانی مشتریان",
  Finance: "صورتحساب و پرداخت‌ها",
  Manager: "عملیات بیشتر خواندنی",
};

const PERM_LABEL: Record<string, string> = {
  "*": "دسترسی کامل",
  "cafes.read": "مشاهده کافه‌ها",
  "cafes.write": "ویرایش کافه‌ها",
  "subscriptions.read": "مشاهده اشتراک‌ها",
  "subscriptions.write": "ویرایش اشتراک‌ها",
  "payments.read": "مشاهده پرداخت‌ها",
  "payments.refund": "استرداد پرداخت",
  "plans.read": "مشاهده پلن‌ها",
  "plans.write": "ویرایش پلن‌ها",
  "analytics.read": "مشاهده تحلیل",
  "support.read": "مشاهده پشتیبانی",
  "support.write": "پاسخ پشتیبانی",
  "system.read": "مشاهده سیستم",
  "audit.read": "مشاهده گزارش فعالیت",
  "notifications.write": "ارسال اعلان",
  "admin_users.read": "مشاهده ادمین‌ها",
  "admin_users.write": "ویرایش ادمین‌ها",
  "roles.write": "ویرایش نقش‌ها",
};

const PAYMENT_METHOD_FA: Record<string, string> = {
  manual: "دستی",
  card: "کارت",
  bank_transfer: "حواله بانکی",
  cash: "نقدی",
  wallet: "کیف پول",
};

const PROVIDER_FA: Record<string, string> = {
  manual: "دستی",
  zarinpal: "زرین‌پال",
  idpay: "آیدی‌پی",
  stripe: "Stripe",
};

const MSG_FROM_FA: Record<string, string> = {
  admin: "ادمین",
  cafe: "کافه",
  system: "سیستم",
};

const AUDIT_ACTION_FA: Record<string, string> = {
  cafe_create: "ایجاد کافه",
  cafe_update: "ویرایش کافه",
  cafe_suspend: "تعلیق کافه",
  cafe_reactivate: "فعال‌سازی کافه",
  cafe_delete: "حذف کافه",
  cafe_impersonate: "ورود به‌جای کافه",
  subscription_create: "ایجاد اشتراک",
  subscription_extend: "تمدید اشتراک",
  subscription_cancel: "لغو اشتراک",
  subscription_reactivate: "فعال‌سازی اشتراک",
  subscription_change_plan: "تغییر پلن",
  payment_create: "ثبت پرداخت",
  payment_refund: "استرداد پرداخت",
  plan_create: "ایجاد پلن",
  plan_update: "ویرایش پلن",
  plan_delete: "حذف پلن",
  settings_update: "تغییر تنظیمات",
  notification_send: "ارسال اعلان",
  coupon_create: "ایجاد کد تخفیف",
  support_create: "ایجاد تیکت",
  support_reply: "پاسخ تیکت",
  request_contact: "تماس برای درخواست",
  request_fulfill: "انجام درخواست",
  request_reject: "رد درخواست",
  admin_login: "ورود ادمین",
  admin_logout: "خروج ادمین",
};

const TARGET_TYPE_FA: Record<string, string> = {
  cafe: "کافه",
  subscription: "اشتراک",
  payment: "پرداخت",
  plan: "پلن",
  settings: "تنظیمات",
  notification: "اعلان",
  coupon: "کد تخفیف",
  ticket: "تیکت",
  request: "درخواست",
  admin: "ادمین",
};

function permLabel(key: string) {
  return PERM_LABEL[key] || key;
}

function roleNameFa(name: string) {
  return ROLE_NAME_FA[name] || name;
}

function auditActionFa(action: string) {
  return AUDIT_ACTION_FA[action] || action.replace(/_/g, " ");
}

function PermissionBadge({ perm }: { perm: string }) {
  return <span className="sa-badge info sa-perm">{permLabel(perm)}</span>;
}

function usePaged<T>(route: string, status = "", extraQuery: Record<string, string> = {}) {
  const [data, setData] = useState<PageResult<T> | null>(null);
  const [q, setQ] = useState("");
  const [st, setSt] = useState(status);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await saFetch<PageResult<T>>(route, {
        query: { q, status: st, page, pageSize: 20, ...extraQuery },
      });
      setData(res);
      setError("");
    } catch {
      setError("بارگذاری ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, st, page, route]);

  return { data, q, setQ, st, setSt, page, setPage, loading, error, load };
}

export function SubscriptionsPage({
  onNavigate,
  initialStatus = "",
}: {
  onNavigate: (href: string) => void;
  initialStatus?: string;
}) {
  const { data, q, setQ, st, setSt, page, setPage, loading, error, load } =
    usePaged<Subscription>("sa-subscriptions", initialStatus);

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    try {
      await saFetch("sa-subscription", { id, method: "POST", body: JSON.stringify({ action, ...extra }) });
      toast("به‌روزرسانی شد", "success");
      load();
    } catch {
      toast("ناموفق", "error");
    }
  }

  return (
    <>
      <PageHeader title="اشتراک‌ها" description="چرخه عمر اشتراک همه کافه‌ها" />
      <div className="sa-toolbar">
        <input className="sa-input" placeholder="جستجو…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <select className="sa-select" value={st} onChange={(e) => { setPage(1); setSt(e.target.value); }}>
          <option value="">همه</option>
          {["trial", "active", "past_due", "grace_period", "expired", "cancelled", "suspended"].map((s) => (
            <option key={s} value={s}>{STATUS_OPT[s] || s}</option>
          ))}
        </select>
      </div>
      <div className="sa-panel">
        {loading ? <SkeletonTable /> : error ? <ErrorBox message={error} onRetry={load} /> : !data?.items?.length ? (
          <EmptyState title="اشتراکی نیست" description="با اختصاص پلن به یک کافه، اشتراک ساخته می‌شود." />
        ) : (
          <>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>شناسه</th>
                    <th>کافه</th>
                    <th>دوره</th>
                    <th>قیمت</th>
                    <th>پایان</th>
                    <th>وضعیت</th>
                    <th>اقدامات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => (
                    <tr key={s.id}>
                      <td data-label="شناسه">
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => onNavigate(`/panel-admin/subscriptions/${s.id}/`)}>
                          {s.id.slice(0, 14)}…
                        </button>
                      </td>
                      <td data-label="کافه">{s.tenantId?.slice(0, 12)}…</td>
                      <td data-label="دوره">{CYCLE_LABEL[s.billingCycle] || s.billingCycle}</td>
                      <td data-label="قیمت">{formatMoney(s.price, s.currency)}</td>
                      <td data-label="پایان">{formatDate(s.endDate)}</td>
                      <td data-label="وضعیت"><Badge status={s.status} /></td>
                      <td data-label="اقدامات">
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => act(s.id, "extend", { days: 30, reason: "تمدید توسط پشتیبانی" })}>+۳۰ روز</button>
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => act(s.id, "cancel")}>لغو</button>
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => act(s.id, "reactivate")}>فعال‌سازی مجدد</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sa-pagination">
              <span>صفحه {data.page.toLocaleString("fa-IR")} / {data.totalPages.toLocaleString("fa-IR")}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button>
                <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>بعدی</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function SubscriptionDetailPage({ id, onNavigate }: { id: string; onNavigate: (href: string) => void }) {
  const [sub, setSub] = useState<Subscription | null>(null);
  useEffect(() => {
    saFetch<{ subscription: Subscription }>("sa-subscription", { id }).then((r) => setSub(r.subscription)).catch(() => setSub(null));
  }, [id]);
  return (
    <>
      <PageHeader title="اشتراک" description={id} actions={<button type="button" className="sa-btn sa-btn-ghost" onClick={() => onNavigate("/panel-admin/subscriptions/")}>← بازگشت</button>} />
      <div className="sa-panel"><div className="sa-panel-body">
        {sub ? (
          <div className="sa-detail-grid">
            <div className="sa-detail-item"><label>وضعیت</label><strong><Badge status={sub.status} /></strong></div>
            <div className="sa-detail-item"><label>پلن</label><strong>{sub.planId}</strong></div>
            <div className="sa-detail-item"><label>دوره</label><strong>{CYCLE_LABEL[sub.billingCycle] || sub.billingCycle}</strong></div>
            <div className="sa-detail-item"><label>قیمت</label><strong>{formatMoney(sub.price)}</strong></div>
            <div className="sa-detail-item"><label>شروع</label><strong>{formatDate(sub.startDate)}</strong></div>
            <div className="sa-detail-item"><label>پایان</label><strong>{formatDate(sub.endDate)}</strong></div>
            <div className="sa-detail-item"><label>تمدید خودکار</label><strong>{sub.autoRenew ? "بله" : "خیر"}</strong></div>
          </div>
        ) : <EmptyState title="یافت نشد" />}
      </div></div>
    </>
  );
}

export function PaymentsPage({ initialStatus = "", onNavigate }: { initialStatus?: string; onNavigate: (href: string) => void }) {
  const { data, q, setQ, st, setSt, page: _page, setPage, loading, error, load } = usePaged<SaasPayment>("sa-payments", initialStatus);
  void _page;

  async function refund(id: string) {
    try {
      await saFetch("sa-payment", { id, method: "POST", body: JSON.stringify({ action: "refund", reason: "استرداد توسط ادمین" }) });
      toast("استرداد شد", "success");
      load();
    } catch {
      toast("استرداد ناموفق بود", "error");
    }
  }

  return (
    <>
      <PageHeader title="پرداخت‌ها" description="تاریخچه صورتحساب اشتراک پلتفرم" />
      <div className="sa-toolbar">
        <input className="sa-input" placeholder="جستجو…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <select className="sa-select" value={st} onChange={(e) => { setPage(1); setSt(e.target.value); }}>
          <option value="">همه</option>
          {["successful", "pending", "failed", "refunded", "cancelled", "unknown"].map((s) => (
            <option key={s} value={s}>{STATUS_OPT[s] || s}</option>
          ))}
        </select>
      </div>
      <div className="sa-panel">
        {loading ? <SkeletonTable /> : error ? <ErrorBox message={error} onRetry={load} /> : !data?.items?.length ? (
          <EmptyState title="پرداختی نیست" />
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>شناسه</th><th>مبلغ</th><th>روش</th><th>مرجع</th><th>وضعیت</th><th>تاریخ</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td data-label="شناسه"><button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => onNavigate(`/panel-admin/payments/${p.id}/`)}>{p.id.slice(0, 12)}…</button></td>
                    <td data-label="مبلغ">{formatMoney(p.amount, p.currency)}</td>
                    <td data-label="روش">{PAYMENT_METHOD_FA[p.paymentMethod] || p.paymentMethod || "—"}</td>
                    <td data-label="مرجع">{p.referenceNumber || "—"}</td>
                    <td data-label="وضعیت"><Badge status={p.status} /></td>
                    <td data-label="تاریخ">{formatDate(p.createdAt)}</td>
                    <td data-label="اقدامات">
                      {p.status === "successful" ? (
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => refund(p.id)}>استرداد</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export function PaymentDetailPage({ id, onNavigate }: { id: string; onNavigate: (href: string) => void }) {
  const [p, setP] = useState<SaasPayment | null>(null);
  useEffect(() => {
    saFetch<{ payment: SaasPayment }>("sa-payment", { id }).then((r) => setP(r.payment)).catch(() => setP(null));
  }, [id]);
  return (
    <>
      <PageHeader title="پرداخت" description={id} actions={<button type="button" className="sa-btn sa-btn-ghost" onClick={() => onNavigate("/panel-admin/payments/")}>← بازگشت</button>} />
      <div className="sa-panel"><div className="sa-panel-body">
        {p ? (
          <div className="sa-detail-grid">
            <div className="sa-detail-item"><label>مبلغ</label><strong>{formatMoney(p.amount, p.currency)}</strong></div>
            <div className="sa-detail-item"><label>وضعیت</label><strong><Badge status={p.status} /></strong></div>
            <div className="sa-detail-item"><label>درگاه</label><strong>{PROVIDER_FA[p.provider] || p.provider || "—"}</strong></div>
            <div className="sa-detail-item"><label>روش</label><strong>{PAYMENT_METHOD_FA[p.paymentMethod] || p.paymentMethod || "—"}</strong></div>
            <div className="sa-detail-item"><label>مرجع</label><strong>{p.referenceNumber || "—"}</strong></div>
            <div className="sa-detail-item"><label>تاریخ</label><strong>{formatDate(p.createdAt)}</strong></div>
          </div>
        ) : <EmptyState title="یافت نشد" />}
      </div></div>
    </>
  );
}

export function AnalyticsPage({ kind = "revenue" }: { kind?: string }) {
  const [data, setData] = useState<{
    kpis: DashboardData["kpis"];
    revenueByMonth: { month: string; revenue: number }[];
    revenueByPlan: { planId: string; revenue: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    saFetch<typeof data & object>("sa-analytics", { query: { kind } })
      .then((r) => setData(r as NonNullable<typeof data>))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [kind]);

  const title =
    kind === "customers" ? "تحلیل مشتریان" : kind === "subscriptions" ? "تحلیل اشتراک‌ها" : "تحلیل درآمد";
  const description =
    kind === "customers"
      ? "رشد مشتری، جذب و نرخ ریزش"
      : kind === "subscriptions"
        ? "وضعیت و ترکیب اشتراک‌ها"
        : "درآمد ماهانه و سالانه، رشد و ترکیب پلن‌ها";

  if (loading) return <><PageHeader title={title} /><SkeletonKpis /></>;
  if (!data) return <><PageHeader title={title} /><ErrorBox message="بارگذاری تحلیل ناموفق بود" /></>;

  const max = Math.max(...(data.revenueByMonth || []).map((m) => m.revenue), 1);

  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="sa-kpi-grid">
        {kind === "revenue" || kind === "overview" ? (
          <>
            <KpiCard label="درآمد ماهانه تکراری" value={data.kpis.mrr?.value ?? 0} change={data.kpis.mrr?.change} formatValue={(n) => formatMoney(n)} />
            <KpiCard label="درآمد سالانه تکراری" value={data.kpis.arr?.value ?? 0} change={data.kpis.arr?.change} formatValue={(n) => formatMoney(n)} />
            <KpiCard label="درآمد ۳۰ روز" value={data.kpis.revenue30d?.value ?? 0} change={data.kpis.revenue30d?.change} formatValue={(n) => formatMoney(n)} />
          </>
        ) : null}
        {kind === "customers" ? (
          <>
            <KpiCard label="کل کافه‌ها" value={data.kpis.totalCafes?.value ?? 0} change={data.kpis.totalCafes?.change} />
            <KpiCard label="فعال" value={data.kpis.activeCafes?.value ?? 0} change={data.kpis.activeCafes?.change} />
            <KpiCard label="آزمایشی" value={data.kpis.trialCafes?.value ?? 0} change={data.kpis.trialCafes?.change} />
            <KpiCard label="مشتری جدید" value={data.kpis.newCustomers?.value ?? 0} change={data.kpis.newCustomers?.change} />
            <KpiCard label="نرخ ریزش" value={data.kpis.churnRate?.value ?? 0} formatValue={(n) => `${n.toLocaleString("fa-IR")}٪`} />
          </>
        ) : null}
        {kind === "subscriptions" ? (
          <>
            <KpiCard label="فعال" value={data.kpis.activeCafes?.value ?? 0} change={data.kpis.activeCafes?.change} />
            <KpiCard label="آزمایشی" value={data.kpis.trialCafes?.value ?? 0} change={data.kpis.trialCafes?.change} />
            <KpiCard label="منقضی" value={data.kpis.expiredSubscriptions?.value ?? 0} change={data.kpis.expiredSubscriptions?.change} />
            <KpiCard label="معلق" value={data.kpis.suspendedCafes?.value ?? 0} change={data.kpis.suspendedCafes?.change} />
            <KpiCard label="نرخ ریزش" value={data.kpis.churnRate?.value ?? 0} formatValue={(n) => `${n.toLocaleString("fa-IR")}٪`} />
          </>
        ) : null}
        {kind === "revenue" || kind === "overview" ? (
          <>
            <KpiCard label="نرخ ریزش" value={data.kpis.churnRate?.value ?? 0} formatValue={(n) => `${n.toLocaleString("fa-IR")}٪`} />
            <KpiCard label="مشتری جدید" value={data.kpis.newCustomers?.value ?? 0} change={data.kpis.newCustomers?.change} />
          </>
        ) : null}
      </div>
      {(kind === "revenue" || kind === "overview") ? (
        <>
      <div className="sa-panel" style={{ marginBottom: 16 }}>
        <div className="sa-panel-head"><h2>درآمد ماهانه</h2></div>
        <div className="sa-panel-body">
          {(data.revenueByMonth || []).length === 0 ? (
            <p style={{ color: "var(--sa-text-muted)", margin: 0 }}>هنوز پرداخت موفقی نیست.</p>
          ) : (
            <>
              <div className="sa-chart-bars">
                {data.revenueByMonth.map((m) => (
                  <div
                    key={m.month}
                    className="sa-chart-bar"
                    style={{ height: `${Math.max(4, (m.revenue / max) * 100)}%` }}
                    title={`${m.month}: ${formatMoney(m.revenue)}`}
                  />
                ))}
              </div>
              <div className="sa-chart-labels">
                {data.revenueByMonth.map((m) => (
                  <span key={m.month}>{m.month.slice(5)}</span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="sa-panel">
        <div className="sa-panel-head"><h2>درآمد بر اساس پلن</h2></div>
        <div className="sa-panel-body">
          {(data.revenueByPlan || []).length === 0 ? (
            <p style={{ color: "var(--sa-text-muted)", margin: 0 }}>هنوز درآمدی از پلن‌ها نیست.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {data.revenueByPlan.map((r) => (
                <li key={r.planId} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--sa-border)" }}>
                  <span>{r.planId}</span>
                  <strong>{formatMoney(r.revenue)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
        </>
      ) : (
        <div className="sa-panel">
          <div className="sa-panel-body">
            <p style={{ color: "var(--sa-text-muted)", margin: 0, lineHeight: 1.8 }}>
              {kind === "customers"
                ? "شاخص‌های بالا خلاصه وضعیت مشتریان پلتفرم است. جزئیات بیشتر از صفحه کافه‌ها و درخواست‌ها قابل پیگیری است."
                : "شاخص‌های بالا وضعیت اشتراک‌ها را نشان می‌دهد. برای تمدید یا تغییر پلن به صفحه اشتراک‌ها بروید."}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export function CouponsPage() {
  const [items, setItems] = useState<Coupon[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", discountType: "percentage", discountValue: 20 });

  async function load() {
    const res = await saFetch<{ items: Coupon[] }>("sa-coupons");
    setItems(res.items || []);
  }
  useEffect(() => { load().catch(() => {}); }, []);

  async function save() {
    try {
      await saFetch("sa-coupons", { method: "POST", body: JSON.stringify(form) });
      toast("کد تخفیف ذخیره شد", "success");
      setOpen(false);
      load();
    } catch {
      toast("ناموفق", "error");
    }
  }

  return (
    <>
      <PageHeader title="کدهای تخفیف" description="کدهای تبلیغاتی برای ارتقای پلن" actions={<button type="button" className="sa-btn sa-btn-primary" onClick={() => setOpen(true)}>ایجاد کد</button>} />
      <div className="sa-panel">
        {!items.length ? <EmptyState title="کد تخفیفی نیست" /> : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead><tr><th>کد</th><th>نوع</th><th>مقدار</th><th>مصرف</th><th>وضعیت</th></tr></thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td data-label="کد"><strong>{c.code}</strong></td>
                    <td data-label="نوع">{c.discountType === "percentage" ? "درصدی" : c.discountType === "fixed" ? "مبلغ ثابت" : c.discountType}</td>
                    <td data-label="مقدار">{c.discountType === "percentage" ? `${c.discountValue.toLocaleString("fa-IR")}٪` : formatMoney(c.discountValue)}</td>
                    <td data-label="مصرف">{c.usedCount.toLocaleString("fa-IR")}{c.usageLimit != null ? ` / ${c.usageLimit.toLocaleString("fa-IR")}` : ""}</td>
                    <td data-label="وضعیت"><Badge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={open} title="ایجاد کد تخفیف" onClose={() => setOpen(false)}>
        <div className="sa-field"><label className="sa-label">کد</label><input className="sa-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
        <div className="sa-field"><label className="sa-label">نوع</label>
          <select className="sa-select" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
            <option value="percentage">درصدی</option>
            <option value="fixed">مبلغ ثابت</option>
          </select>
        </div>
        <div className="sa-field"><label className="sa-label">مقدار</label><input className="sa-input" type="number" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })} /></div>
        <div className="sa-modal-actions">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setOpen(false)}>انصراف</button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={save}>ذخیره</button>
        </div>
      </Modal>
    </>
  );
}

export function NotificationsPage() {
  const [items, setItems] = useState<{ id: string; title: string; type: string; status: string; sentAt?: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", type: "announcement" });

  async function load() {
    const res = await saFetch<{ items: typeof items }>("sa-notifications");
    setItems(res.items || []);
  }
  useEffect(() => { load().catch(() => {}); }, []);

  async function send() {
    try {
      await saFetch("sa-notifications", { method: "POST", body: JSON.stringify({ ...form, target: { scope: "all" }, channels: ["in_app"] }) });
      toast("اعلان ارسال شد", "success");
      setOpen(false);
      load();
    } catch {
      toast("ناموفق", "error");
    }
  }

  return (
    <>
      <PageHeader title="اعلان‌ها" description="ارسال به یک، چند یا همه کافه‌ها" actions={<button type="button" className="sa-btn sa-btn-primary" onClick={() => setOpen(true)}>ارسال</button>} />
      <div className="sa-panel">
        {!items.length ? <EmptyState title="اعلانی نیست" /> : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead><tr><th>عنوان</th><th>نوع</th><th>وضعیت</th><th>ارسال</th></tr></thead>
              <tbody>
                {items.map((n) => (
                  <tr key={n.id}>
                    <td data-label="عنوان">{n.title}</td>
                    <td data-label="نوع">{NOTIF_TYPE[n.type] || n.type}</td>
                    <td data-label="وضعیت"><Badge status={n.status} /></td>
                    <td data-label="ارسال">{formatDate(n.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={open} title="ارسال اعلان" onClose={() => setOpen(false)}>
        <div className="sa-field"><label className="sa-label">عنوان</label><input className="sa-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="sa-field"><label className="sa-label">متن</label><textarea className="sa-textarea" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
        <div className="sa-field"><label className="sa-label">نوع</label>
          <select className="sa-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {["system", "subscription", "payment", "maintenance", "promotion", "announcement"].map((t) => (
              <option key={t} value={t}>{NOTIF_TYPE[t] || t}</option>
            ))}
          </select>
        </div>
        <div className="sa-modal-actions">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setOpen(false)}>انصراف</button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={send}>ارسال به همه کافه‌ها</button>
        </div>
      </Modal>
    </>
  );
}

export function SupportPage({ onNavigate }: { onNavigate: (href: string) => void }) {
  const { data, q, setQ, st, setSt, page: _page, setPage, loading, error, load } = usePaged<SupportTicket>(
    "sa-support",
    "",
    { sort: "attentionRank", order: "desc" },
  );
  void _page;
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [loadingCafes, setLoadingCafes] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingCafes(true);
    saFetch<PageResult<Cafe>>("sa-cafes", { query: { page: 1, limit: 200 } })
      .then((r) => setCafes(r.items || []))
      .catch(() => setCafes([]))
      .finally(() => setLoadingCafes(false));
  }, [open]);

  async function create() {
    if (!subject.trim()) {
      toast("موضوع تیکت را وارد کنید", "error");
      return;
    }
    try {
      const res = await saFetch<{ ticket: SupportTicket }>("sa-support", {
        method: "POST",
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          tenantId: tenantId || undefined,
        }),
      });
      toast("تیکت ساخته شد", "success");
      setOpen(false);
      setSubject("");
      setBody("");
      setTenantId("");
      onNavigate(`/panel-admin/support/${res.ticket.id}/`);
    } catch {
      toast("ناموفق", "error");
    }
  }

  const newCount = (data?.items || []).filter((t) => t.isNew).length;
  const replyCount = (data?.items || []).filter((t) => t.needsAdminReply).length;

  return (
    <>
      <PageHeader
        title="پشتیبانی"
        description={
          replyCount > 0
            ? `${replyCount.toLocaleString("fa-IR")} تیکت نیاز به پاسخ دارد${newCount > 0 ? ` (${newCount.toLocaleString("fa-IR")} جدید)` : ""}`
            : "تیکت‌های اپراتورهای کافه"
        }
        actions={<button type="button" className="sa-btn sa-btn-primary" onClick={() => setOpen(true)}>تیکت جدید</button>}
      />
      <div className="sa-toolbar">
        <input className="sa-input" placeholder="جستجو…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <select className="sa-select" value={st} onChange={(e) => { setPage(1); setSt(e.target.value); }}>
          <option value="">همه</option>
          <option value="needs_reply">نیاز به پاسخ</option>
          {["open", "in_progress", "waiting_customer", "resolved", "closed"].map((s) => (
            <option key={s} value={s}>{STATUS_OPT[s] || s}</option>
          ))}
        </select>
      </div>
      <div className="sa-panel">
        {loading ? <SkeletonTable /> : error ? <ErrorBox message={error} onRetry={load} /> : !data?.items?.length ? (
          <EmptyState title="تیکتی نیست" />
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table sa-table--tickets">
              <thead><tr><th>شناسه</th><th>کافه</th><th>موضوع</th><th>اولویت</th><th>وضعیت</th><th>ایجاد</th></tr></thead>
              <tbody>
                {data.items.map((t) => (
                  <tr
                    key={t.id}
                    className={[
                      t.isNew ? "sa-ticket-row--new" : "",
                      t.needsAdminReply && !t.isNew ? "sa-ticket-row--attention" : "",
                    ].filter(Boolean).join(" ")}
                    style={{ cursor: "pointer" }}
                    onClick={() => onNavigate(`/panel-admin/support/${t.id}/`)}
                  >
                    <td data-label="شناسه">
                      {t.isNew ? <span className="sa-ticket-dot" aria-hidden="true" /> : null}
                      {t.id.slice(0, 12)}…
                    </td>
                    <td data-label="کافه">{t.cafeName || t.tenantId?.slice(0, 12) || "—"}</td>
                    <td data-label="موضوع">
                      <span className={t.isNew ? "sa-ticket-subject-new" : undefined}>{t.subject}</span>
                      {t.isNew ? <span className="sa-ticket-new-pill">جدید</span> : null}
                      {t.needsAdminReply && !t.isNew ? <span className="sa-ticket-reply-pill">نیاز به پاسخ</span> : null}
                    </td>
                    <td data-label="اولویت"><Badge status={t.priority} /></td>
                    <td data-label="وضعیت"><Badge status={t.status} /></td>
                    <td data-label="ایجاد">{formatDate(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={open} title="تیکت جدید برای کاربر" onClose={() => setOpen(false)}>
        <div className="sa-field">
          <label className="sa-label">کافه / کاربر</label>
          <select className="sa-select" value={tenantId} onChange={(e) => setTenantId(e.target.value)} disabled={loadingCafes}>
            <option value="">— عمومی (بدون کاربر مشخص) —</option>
            {cafes.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.id}</option>
            ))}
          </select>
        </div>
        <div className="sa-field"><label className="sa-label">موضوع</label><input className="sa-input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div className="sa-field">
          <label className="sa-label">پیام برای کاربر</label>
          <textarea className="sa-textarea" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="متن پیام پشتیبانی…" />
        </div>
        <div className="sa-modal-actions">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setOpen(false)}>انصراف</button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={create}>ارسال تیکت</button>
        </div>
      </Modal>
    </>
  );
}

export function SupportDetailPage({ id, onNavigate }: { id: string; onNavigate: (href: string) => void }) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState("");
  async function load() {
    const res = await saFetch<{ ticket: SupportTicket }>("sa-support-item", { id });
    setTicket(res.ticket);
  }
  useEffect(() => { load().catch(() => setTicket(null)); }, [id]);

  async function sendReply() {
    await saFetch("sa-support-item", { id, method: "POST", body: JSON.stringify({ action: "reply", body: reply }) });
    setReply("");
    load();
  }

  return (
    <>
      <PageHeader
        title={ticket?.subject || "تیکت"}
        description={ticket?.cafeName ? `${ticket.cafeName}${ticket.cafeOwnerEmail ? ` · ${ticket.cafeOwnerEmail}` : ""}` : id}
        actions={<button type="button" className="sa-btn sa-btn-ghost" onClick={() => onNavigate("/panel-admin/support/")}>← بازگشت</button>}
      />
      <div className="sa-panel"><div className="sa-panel-body">
        {ticket ? (
          <>
            <div className="sa-actions-row" style={{ marginTop: 0, marginBottom: 16 }}>
              <Badge status={ticket.status} />
              <Badge status={ticket.priority} />
            </div>
            {(ticket.messages || []).map((m) => (
              <div key={m.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--sa-border)" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--sa-text-faint)" }}>{MSG_FROM_FA[m.from] || m.from} · {formatDate(m.createdAt)}</div>
                <div>{m.body}</div>
              </div>
            ))}
            <div className="sa-field" style={{ marginTop: 16 }}>
              <textarea className="sa-textarea" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="پاسخ…" />
            </div>
            <button type="button" className="sa-btn sa-btn-primary" onClick={sendReply}>ارسال پاسخ</button>
          </>
        ) : <EmptyState title="یافت نشد" />}
      </div></div>
    </>
  );
}

export function SystemHealthPage() {
  const [services, setServices] = useState<HealthService[]>([]);
  const [overall, setOverall] = useState("");
  useEffect(() => {
    saFetch<{ services: HealthService[]; overall: string }>("sa-system-health")
      .then((r) => { setServices(r.services || []); setOverall(r.overall); })
      .catch(() => {});
  }, []);
  const overallFa =
    overall === "healthy" ? "سالم" :
    overall === "warning" ? "هشدار" :
    overall === "critical" ? "بحرانی" :
    overall || "…";
  const nameFa: Record<string, string> = {
    API: "رابط برنامه‌نویسی (API)",
    Database: "پایگاه داده",
    "Payment Gateway": "درگاه پرداخت",
    "Background Jobs": "کارهای پس‌زمینه",
    "Email Service": "سرویس ایمیل",
    "SMS Service": "سرویس پیامک",
    Storage: "فضای ذخیره‌سازی",
  };
  const detailFa = (detail: string) => {
    const map: Record<string, string> = {
      ok: "سالم",
      json_files: "فایل‌های JSON",
      postgresql: "PostgreSQL",
      error: "خطا",
      "abstraction ready; no live provider": "آماده؛ هنوز درگاهی وصل نیست",
      "not configured": "پیکربندی نشده",
    };
    return map[detail] || detail;
  };
  return (
    <>
      <PageHeader title="سلامت سیستم" description={`وضعیت کلی: ${overallFa}`} />
      <div className="sa-kpi-grid">
        {services.map((s) => (
          <div key={s.name} className="sa-kpi">
            <div className="sa-kpi-label">{nameFa[s.name] || s.name}</div>
            <div style={{ margin: "8px 0" }}><Badge status={s.status} /></div>
            <div style={{ fontSize: "0.85rem", color: "var(--sa-text-muted)", lineHeight: 1.6 }}>
              {detailFa(s.detail)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function SystemSettingsPage() {
  const [trialDays, setTrialDays] = useState(14);
  const [gracePeriodDays, setGracePeriodDays] = useState(3);
  const [supportPhone, setSupportPhone] = useState("");
  const [supportNote, setSupportNote] = useState("");
  const [paymentCardNumber, setPaymentCardNumber] = useState("");
  const [paymentCardHolder, setPaymentCardHolder] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [reminderDays, setReminderDays] = useState("30, 7, 3, 1");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    saFetch<{ settings: Record<string, unknown> }>("sa-system-settings")
      .then((r) => {
        const s = r.settings || {};
        setTrialDays(Number(s.trialDays ?? 14));
        setGracePeriodDays(Number(s.gracePeriodDays ?? 3));
        setSupportPhone(String(s.supportPhone ?? ""));
        setSupportNote(String(s.supportNote ?? ""));
        setPaymentCardNumber(String(s.paymentCardNumber ?? ""));
        setPaymentCardHolder(String(s.paymentCardHolder ?? ""));
        setPaymentInstructions(String(s.paymentInstructions ?? ""));
        const rem = s.reminderDays;
        setReminderDays(Array.isArray(rem) ? rem.join(", ") : String(rem ?? "30, 7, 3, 1"));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    try {
      const days = reminderDays
        .split(",")
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => !Number.isNaN(n));
      await saFetch("sa-system-settings", {
        method: "POST",
        body: JSON.stringify({
          settings: {
            trialDays,
            gracePeriodDays,
            supportPhone,
            supportNote,
            paymentCardNumber: paymentCardNumber.trim(),
            paymentCardHolder: paymentCardHolder.trim(),
            paymentInstructions: paymentInstructions.trim(),
            reminderDays: days,
            currency: "IRT",
          },
        }),
      });
      toast("تنظیمات ذخیره شد", "success");
    } catch {
      toast("ذخیره تنظیمات ناموفق بود", "error");
    }
  }

  if (loading) return <SkeletonTable rows={4} />;

  return (
    <>
      <PageHeader
        title="تنظیمات پلتفرم"
        description="دوره آزمایشی، پرداخت کارت‌به‌کارت، یادآوری انقضا و پیام فروشگاه"
        actions={
          <button type="button" className="sa-btn sa-btn-primary" onClick={save}>
            ذخیره
          </button>
        }
      />
      <div className="sa-panel">
        <div className="sa-panel-body" style={{ maxWidth: 560 }}>
          <div className="sa-field">
            <label className="sa-label">مدت آزمایشی (روز)</label>
            <input className="sa-input" type="number" value={trialDays} onChange={(e) => setTrialDays(Number(e.target.value) || 0)} />
          </div>
          <div className="sa-field">
            <label className="sa-label">مهلت پس از انقضا (روز)</label>
            <input className="sa-input" type="number" value={gracePeriodDays} onChange={(e) => setGracePeriodDays(Number(e.target.value) || 0)} />
          </div>
          <div className="sa-field">
            <label className="sa-label">یادآوری قبل از انقضا (روزها با ویرگول)</label>
            <input className="sa-input" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} placeholder="۳۰, ۷, ۳, ۱" />
          </div>
          <div className="sa-field">
            <label className="sa-label">شماره پشتیبانی</label>
            <input className="sa-input" value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} placeholder="۰۹۱۲…" />
          </div>
          <div className="sa-field">
            <label className="sa-label">شماره کارت (پیش‌فرض برای درخواست‌ها)</label>
            <input
              className="sa-input"
              dir="ltr"
              value={paymentCardNumber}
              onChange={(e) => setPaymentCardNumber(e.target.value)}
              placeholder="6037-9977-XXXX-XXXX"
            />
          </div>
          <div className="sa-field">
            <label className="sa-label">نام صاحب کارت</label>
            <input className="sa-input" value={paymentCardHolder} onChange={(e) => setPaymentCardHolder(e.target.value)} />
          </div>
          <div className="sa-field">
            <label className="sa-label">راهنمای پرداخت (نمایش در حساب مشتری)</label>
            <textarea
              className="sa-textarea"
              rows={3}
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
              placeholder="مبلغ را کارت‌به‌کارت کنید و سپس «پرداخت کردم» را بزنید."
            />
          </div>
          <div className="sa-field">
            <label className="sa-label">متن راهنما در فروشگاه</label>
            <textarea className="sa-textarea" rows={4} value={supportNote} onChange={(e) => setSupportNote(e.target.value)} />
          </div>
        </div>
      </div>
    </>
  );
}

export function AuditLogsPage() {
  const { data, q, setQ, page: _page, setPage, loading, error, load } = usePaged<AuditLog>("sa-audit-logs");
  void _page;
  return (
    <>
      <PageHeader title="گزارش فعالیت" description="ثبت تغییرناپذیر اقدامات ویژه" />
      <div className="sa-toolbar">
        <input className="sa-input" placeholder="جستجوی اقدام، ادمین، هدف…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
      </div>
      <div className="sa-panel">
        {loading ? <SkeletonTable /> : error ? <ErrorBox message={error} onRetry={load} /> : !data?.items?.length ? (
          <EmptyState title="رویدادی ثبت نشده" />
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead><tr><th>زمان</th><th>ادمین</th><th>اقدام</th><th>هدف</th><th>IP</th></tr></thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id}>
                    <td data-label="زمان">{formatDate(l.createdAt)}</td>
                    <td data-label="ادمین">{l.adminEmail || "—"}</td>
                    <td data-label="اقدام">{auditActionFa(l.action)}</td>
                    <td data-label="هدف">{(l.targetType ? TARGET_TYPE_FA[l.targetType] || l.targetType : "—")} {l.targetId || ""}</td>
                    <td data-label="IP">{l.ip || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export function AdminUsersPage() {
  const [items, setItems] = useState<AdminUser[]>([]);
  useEffect(() => {
    saFetch<{ items: AdminUser[] }>("sa-admin-users").then((r) => setItems(r.items || [])).catch(() => {});
  }, []);
  return (
    <>
      <PageHeader title="کاربران ادمین" description="افرادی که به پنل مدیریت دسترسی دارند" />
      <div className="sa-panel">
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead><tr><th>نام</th><th>ایمیل</th><th>نقش</th><th>وضعیت</th><th>آخرین ورود</th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td data-label="نام">{a.name || a.username}</td>
                  <td data-label="ایمیل">{a.email}</td>
                  <td data-label="نقش">{roleNameFa(a.roleName || "") || a.roleName || a.roleId}</td>
                  <td data-label="وضعیت"><Badge status={a.status} /></td>
                  <td data-label="آخرین ورود">{formatDate(a.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function RolesPage() {
  const [roles, setRoles] = useState<{ id: string; name: string; description: string; permissions: string[] }[]>([]);
  const [perms, setPerms] = useState<string[]>([]);
  useEffect(() => {
    saFetch<{ items: typeof roles; allPermissions: string[] }>("sa-roles")
      .then((r) => { setRoles(r.items || []); setPerms(r.allPermissions || []); })
      .catch(() => {});
  }, []);
  return (
    <>
      <PageHeader title="نقش‌ها و دسترسی‌ها" description="کنترل دسترسی بر اساس نقش" />
      <div className="sa-role-grid">
        {roles.map((r) => {
          const permsList = r.permissions || [];
          const isFullAccess = permsList.length === 1 && permsList[0] === "*";
          return (
            <div key={r.id} className="sa-panel">
              <div className="sa-panel-head"><h2>{roleNameFa(r.name)}</h2></div>
              <div className="sa-panel-body">
                <p style={{ color: "var(--sa-text-muted)", fontSize: "0.9rem" }}>
                  {ROLE_DESC_FA[r.name] || r.description}
                </p>
                {isFullAccess ? (
                  <p style={{ margin: "8px 0 0", fontWeight: 600 }}>دسترسی کامل به تمام بخش‌ها</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {permsList.map((p) => (
                      <PermissionBadge key={p} perm={p} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sa-panel" style={{ marginTop: 16 }}>
        <div className="sa-panel-head"><h2>دسترسی‌های موجود</h2></div>
        <div className="sa-panel-body" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {perms.map((p) => (
            <span key={p} className="sa-badge muted sa-perm">
              {permLabel(p)}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
