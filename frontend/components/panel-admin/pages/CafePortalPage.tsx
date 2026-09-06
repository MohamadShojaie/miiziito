"use client";

import { BrandMark } from "@/components/panel-admin/BrandMark";
import { AccessCredentialsCard } from "@/components/panel-admin/AccessCredentialsCard";

import { useEffect, useMemo, useState } from "react";
import { resolveAccessPayload } from "@/lib/super-admin/access-message";
import { PANEL_GUIDE_PATH } from "@/lib/super-admin/access-message";
import { saFetch } from "@/lib/super-admin/api";
import { formatDate, formatDateTime, formatMoney } from "@/lib/super-admin/format";
import { cafeCashierUrl, cafeMenuUrl } from "@/lib/super-admin/tenant-urls";
import type { Cafe, Plan, Subscription, SupportTicket } from "@/lib/super-admin/types";
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
  paymentCardNumber?: string;
  paymentCardHolder?: string;
  paymentInstructions?: string;
  adminNote?: string;
  userPaymentReference?: string;
  userPaymentNote?: string;
};

const REQUEST_STEPS = [
  { key: "pending", label: "ثبت درخواست" },
  { key: "awaiting_payment", label: "دریافت شماره کارت" },
  { key: "payment_submitted", label: "ثبت پرداخت" },
  { key: "fulfilled", label: "فعال‌سازی" },
];

function requestStepIndex(status: string): number {
  if (status === "contacted") return 1;
  if (status === "awaiting_payment") return 1;
  if (status === "payment_submitted") return 2;
  if (status === "fulfilled") return 3;
  if (status === "rejected") return -1;
  return 0;
}

function RequestStepTracker({ status }: { status: string }) {
  const current = requestStepIndex(status);
  if (status === "rejected") {
    return <p style={{ color: "var(--sa-danger)" }}>درخواست رد شده است.</p>;
  }
  return (
    <ol className="sa-steps" style={{ margin: "0 0 16px", padding: 0, listStyle: "none" }}>
      {REQUEST_STEPS.map((step, i) => (
        <li
          key={step.key}
          style={{
            padding: "8px 0",
            color: i <= current ? "var(--sa-text)" : "var(--sa-text-faint)",
            fontWeight: i === current ? 600 : 400,
          }}
        >
          {i < current ? "✓ " : i === current ? "● " : "○ "}
          {step.label}
        </li>
      ))}
    </ol>
  );
}

const CYCLE_LABEL: Record<string, string> = {
  monthly: "ماهانه",
  "6months": "۶ ماهه",
  yearly: "سالانه",
};

type TicketSummary = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  lastReplyAt?: string | null;
};

const MSG_FROM_FA: Record<string, string> = {
  admin: "پشتیبانی",
  cafe: "شما",
  system: "سیستم",
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
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [confirmingPay, setConfirmingPay] = useState(false);
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketBody, setTicketBody] = useState("");
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [ticketReply, setTicketReply] = useState("");
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [access, setAccess] = useState<{
    menuUrl?: string;
    adminUrl?: string;
    cashierPassword?: string;
    accountEmail?: string;
  }>({});
  const [accountCurrent, setAccountCurrent] = useState("");
  const [accountNew, setAccountNew] = useState("");
  const [cashierCurrent, setCashierCurrent] = useState("");
  const [cashierNew, setCashierNew] = useState("");
  const [savingAccountPass, setSavingAccountPass] = useState(false);
  const [savingCashierPass, setSavingCashierPass] = useState(false);

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
        paymentInstructions?: string;
        supportPhone?: string;
        tickets?: TicketSummary[];
        access?: {
          menuUrl?: string;
          adminUrl?: string;
          cashierPassword?: string;
          accountEmail?: string;
        };
      }>("sa-cafe-portal");
      setCafe(data.cafe);
      setPlan(data.plan);
      setSub(data.subscription);
      setHistory(data.history || []);
      setRequests(data.requests || []);
      setPlans(data.plans || []);
      setPaymentInstructions(data.paymentInstructions || "");
      setSupportPhone(data.supportPhone || "");
      setTickets(data.tickets || []);
      setAccess(data.access || {});
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
  const activeRequest = useMemo(
    () =>
      requests.find((r) =>
        ["pending", "awaiting_payment", "contacted", "payment_submitted"].includes(r.status)
      ) || null,
    [requests]
  );
  const menuUrl = cafe?.slug ? cafeMenuUrl(cafe.slug) : access.menuUrl || "";
  const adminUrl = cafe?.slug ? cafeCashierUrl(cafe.slug) : access.adminUrl || "";

  async function confirmPayment() {
    if (!activeRequest) return;
    setConfirmingPay(true);
    try {
      await saFetch("sa-recharge-request", {
        id: activeRequest.id,
        method: "POST",
        body: JSON.stringify({
          action: "confirm_payment",
          paymentReference: paymentRef.trim(),
          note: paymentNote.trim(),
        }),
      });
      toast("پرداخت ثبت شد. پس از تأیید، حساب فعال می‌شود.", "success");
      setPaymentRef("");
      setPaymentNote("");
      load();
    } catch {
      toast("ثبت پرداخت ناموفق بود", "error");
    } finally {
      setConfirmingPay(false);
    }
  }

  async function createSupportTicket() {
    const subject = ticketSubject.trim();
    const body = ticketBody.trim();
    if (!subject) {
      toast("موضوع تیکت را وارد کنید", "error");
      return;
    }
    setCreatingTicket(true);
    try {
      const res = await saFetch<{ ticket: SupportTicket }>("sa-cafe-support", {
        method: "POST",
        body: JSON.stringify({ subject, body }),
      });
      toast("تیکت پشتیبانی ثبت شد", "success");
      setTicketSubject("");
      setTicketBody("");
      setSelectedTicketId(res.ticket.id);
      setSelectedTicket(res.ticket);
      load();
    } catch {
      toast("ثبت تیکت ناموفق بود", "error");
    } finally {
      setCreatingTicket(false);
    }
  }

  async function openTicket(id: string) {
    if (selectedTicketId === id) {
      setSelectedTicketId(null);
      setSelectedTicket(null);
      setTicketReply("");
      return;
    }
    setSelectedTicketId(id);
    setLoadingTicket(true);
    setSelectedTicket(null);
    setTicketReply("");
    try {
      const res = await saFetch<{ ticket: SupportTicket }>("sa-cafe-support-item", { id });
      setSelectedTicket(res.ticket);
    } catch {
      toast("بارگذاری تیکت ناموفق بود", "error");
      setSelectedTicketId(null);
    } finally {
      setLoadingTicket(false);
    }
  }

  async function sendTicketReply() {
    if (!selectedTicketId || !ticketReply.trim()) return;
    setSendingReply(true);
    try {
      const res = await saFetch<{ ticket: SupportTicket }>("sa-cafe-support-item", {
        id: selectedTicketId,
        method: "POST",
        body: JSON.stringify({ action: "reply", body: ticketReply.trim() }),
      });
      setSelectedTicket(res.ticket);
      setTicketReply("");
      toast("پاسخ ارسال شد", "success");
      load();
    } catch {
      toast("ارسال پاسخ ناموفق بود", "error");
    } finally {
      setSendingReply(false);
    }
  }

  async function changePassword(kind: "account" | "cashier") {
    const currentPassword = kind === "account" ? accountCurrent : cashierCurrent;
    const newPassword = kind === "account" ? accountNew : cashierNew;
    if (newPassword.trim().length < 6) {
      toast("رمز جدید حداقل ۶ کاراکتر باشد", "error");
      return;
    }
    if (kind === "account") setSavingAccountPass(true);
    else setSavingCashierPass(true);
    try {
      const res = await saFetch<{ cashierPassword?: string }>("sa-cafe-change-password", {
        method: "POST",
        body: JSON.stringify({ kind, currentPassword, newPassword: newPassword.trim() }),
      });
      toast("رمز با موفقیت تغییر کرد", "success");
      if (kind === "account") {
        setAccountCurrent("");
        setAccountNew("");
      } else {
        setCashierCurrent("");
        setCashierNew("");
        if (res.cashierPassword) {
          setAccess((a) => ({ ...a, cashierPassword: res.cashierPassword }));
        }
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === "bad_credentials") toast("رمز فعلی اشتباه است", "error");
      else if (msg === "weak_password") toast("رمز جدید ضعیف است", "error");
      else toast("تغییر رمز ناموفق بود", "error");
    } finally {
      if (kind === "account") setSavingAccountPass(false);
      else setSavingCashierPass(false);
    }
  }

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
      toast("درخواست ثبت شد. به‌زودی شماره کارت اینجا نمایش داده می‌شود.", "success");
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
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => onNavigate("/")}>
            فروشگاه
          </button>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onLogout}>
            خروج
          </button>
        </div>
      </header>

      <PageHeader
        title={cafe?.name || "حساب من"}
        description="پلن فعلی، دسترسی منو/پنل، تغییر رمز و درخواست خرید / تمدید"
      />

      {(menuUrl || adminUrl || access.cashierPassword) ? (
        <div className="sa-panel" style={{ marginBottom: 16 }}>
          <div className="sa-panel-head">
            <h2>دسترسی منو و پنل مدیریت</h2>
            <a className="sa-btn sa-btn-ghost sa-btn-sm" href={PANEL_GUIDE_PATH} download target="_blank" rel="noreferrer">
              دانلود راهنما
            </a>
          </div>
          <div className="sa-panel-body">
            <div className="sa-detail-grid">
              {menuUrl ? (
                <div className="sa-detail-item">
                  <label>آدرس منو</label>
                  <strong>
                    <a href={menuUrl} target="_blank" rel="noreferrer" dir="ltr" className="sa-link">
                      {menuUrl}
                    </a>
                  </strong>
                </div>
              ) : null}
              {adminUrl ? (
                <div className="sa-detail-item">
                  <label>آدرس پنل مدیریت</label>
                  <strong>
                    <a href={adminUrl} target="_blank" rel="noreferrer" dir="ltr" className="sa-link">
                      {adminUrl}
                    </a>
                  </strong>
                </div>
              ) : null}
              {access.cashierPassword ? (
                <div className="sa-detail-item">
                  <label>رمز پنل مدیریت</label>
                  <strong dir="ltr">{access.cashierPassword}</strong>
                </div>
              ) : null}
              {access.accountEmail ? (
                <div className="sa-detail-item">
                  <label>ایمیل حساب اشتراک</label>
                  <strong dir="ltr">{access.accountEmail}</strong>
                </div>
              ) : null}
            </div>
            <p style={{ marginTop: 14, marginBottom: 0, color: "var(--sa-text-muted)", fontSize: "0.9rem" }}>
              برای آموزش گام‌به‌گام منو، صندوق و میزها،{" "}
              <a className="sa-link" href={PANEL_GUIDE_PATH} target="_blank" rel="noreferrer">
                راهنمای کار با پنل
              </a>{" "}
              را دانلود یا مشاهده کنید.
            </p>
          </div>
        </div>
      ) : null}

      <div className="sa-grid-2" style={{ marginBottom: 16 }}>
        <div className="sa-panel">
          <div className="sa-panel-head">
            <h2>تغییر رمز حساب اشتراک</h2>
          </div>
          <div className="sa-panel-body">
            <p style={{ color: "var(--sa-text-muted)", fontSize: "0.9rem", marginTop: 0 }}>
              رمز ورود به همین صفحه حساب / خرید پلن
            </p>
            <div className="sa-field">
              <label className="sa-label">رمز فعلی</label>
              <input
                className="sa-input"
                type="password"
                value={accountCurrent}
                onChange={(e) => setAccountCurrent(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="sa-field">
              <label className="sa-label">رمز جدید</label>
              <input
                className="sa-input"
                type="password"
                value={accountNew}
                onChange={(e) => setAccountNew(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button
              type="button"
              className="sa-btn sa-btn-primary"
              disabled={savingAccountPass || !accountCurrent || !accountNew}
              onClick={() => changePassword("account")}
            >
              {savingAccountPass ? "در حال ذخیره…" : "ذخیره رمز حساب"}
            </button>
          </div>
        </div>

        <div className="sa-panel">
          <div className="sa-panel-head">
            <h2>تغییر رمز پنل مدیریت</h2>
          </div>
          <div className="sa-panel-body">
            <p style={{ color: "var(--sa-text-muted)", fontSize: "0.9rem", marginTop: 0 }}>
              رمز ورود به پنل صندوق / مدیریت روزانه کافه
            </p>
            <div className="sa-field">
              <label className="sa-label">رمز فعلی</label>
              <input
                className="sa-input"
                type="password"
                value={cashierCurrent}
                onChange={(e) => setCashierCurrent(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="sa-field">
              <label className="sa-label">رمز جدید</label>
              <input
                className="sa-input"
                type="password"
                value={cashierNew}
                onChange={(e) => setCashierNew(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button
              type="button"
              className="sa-btn sa-btn-primary"
              disabled={savingCashierPass || !cashierNew}
              onClick={() => changePassword("cashier")}
            >
              {savingCashierPass ? "در حال ذخیره…" : "ذخیره رمز پنل"}
            </button>
          </div>
        </div>
      </div>

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
              {paymentInstructions ||
                "درخواست بفرستید. شماره کارت در همین صفحه نمایش داده می‌شود. بعد از واریز، «پرداخت کردم» را بزنید."}
            </p>
            {activeRequest ? (
              <div className="sa-panel" style={{ marginBottom: 16, background: "var(--sa-surface-soft)" }}>
                <div className="sa-panel-body">
                  <h3 style={{ marginTop: 0 }}>درخواست جاری</h3>
                  <RequestStepTracker status={activeRequest.status} />
                  <div className="sa-detail-grid">
                    <div className="sa-detail-item">
                      <label>پلن</label>
                      <strong>{activeRequest.planName}</strong>
                    </div>
                    <div className="sa-detail-item">
                      <label>مبلغ</label>
                      <strong>{formatMoney(activeRequest.price || 0)}</strong>
                    </div>
                    <div className="sa-detail-item">
                      <label>وضعیت</label>
                      <strong>
                        <Badge status={activeRequest.status} />
                      </strong>
                    </div>
                  </div>
                  {(activeRequest.status === "awaiting_payment" || activeRequest.status === "contacted") &&
                  activeRequest.paymentCardNumber ? (
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "var(--sa-bg)" }}>
                      <p style={{ margin: "0 0 8px", fontWeight: 600 }}>اطلاعات واریز</p>
                      <p style={{ margin: "4px 0" }} dir="ltr">
                        کارت: {activeRequest.paymentCardNumber}
                      </p>
                      {activeRequest.paymentCardHolder ? (
                        <p style={{ margin: "4px 0" }}>به نام: {activeRequest.paymentCardHolder}</p>
                      ) : null}
                      {activeRequest.adminNote ? (
                        <p style={{ margin: "8px 0 0", color: "var(--sa-text-muted)" }}>{activeRequest.adminNote}</p>
                      ) : null}
                      <div className="sa-field" style={{ marginTop: 12 }}>
                        <label className="sa-label">شماره پیگیری / ۴ رقم آخر کارت</label>
                        <input className="sa-input" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
                      </div>
                      <div className="sa-field">
                        <label className="sa-label">توضیح (اختیاری)</label>
                        <input className="sa-input" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} />
                      </div>
                      <button
                        type="button"
                        className="sa-btn sa-btn-primary"
                        disabled={confirmingPay || !paymentRef.trim()}
                        onClick={confirmPayment}
                      >
                        {confirmingPay ? "در حال ثبت…" : "پرداخت کردم"}
                      </button>
                    </div>
                  ) : null}
                  {activeRequest.status === "payment_submitted" ? (
                    <p style={{ marginTop: 12, color: "var(--sa-text-muted)" }}>
                      پرداخت شما ثبت شد. پس از تأیید مدیر، اشتراک فعال می‌شود.
                    </p>
                  ) : null}
                  {activeRequest.status === "pending" ? (
                    <p style={{ marginTop: 12, color: "var(--sa-text-muted)" }}>
                      درخواست شما ثبت شد. به‌زودی شماره کارت اینجا نمایش داده می‌شود.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
            {!activeRequest ? (
              <>
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
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="sa-panel" style={{ marginTop: 16 }}>
        <div className="sa-panel-head">
          <h2>پشتیبانی</h2>
        </div>
        <div className="sa-panel-body">
          {supportPhone ? (
            <div className="sa-detail-item" style={{ marginBottom: 16 }}>
              <label>تماس با پشتیبانی</label>
              <strong>
                <a href={`tel:${supportPhone.replace(/\s/g, "")}`} dir="ltr" style={{ color: "var(--sa-accent)" }}>
                  {supportPhone}
                </a>
              </strong>
            </div>
          ) : (
            <p style={{ color: "var(--sa-text-muted)", fontSize: "0.9rem", marginTop: 0 }}>
              برای ارتباط با پشتیبانی، تیکت ثبت کنید.
            </p>
          )}

          <div className="sa-field">
            <label className="sa-label">موضوع تیکت جدید</label>
            <input
              className="sa-input"
              value={ticketSubject}
              onChange={(e) => setTicketSubject(e.target.value)}
              placeholder="مثلاً: مشکل در منوی دیجیتال"
            />
          </div>
          <div className="sa-field">
            <label className="sa-label">متن پیام</label>
            <textarea
              className="sa-textarea"
              rows={3}
              value={ticketBody}
              onChange={(e) => setTicketBody(e.target.value)}
              placeholder="توضیح مشکل یا درخواست خود را بنویسید…"
            />
          </div>
          <button
            type="button"
            className="sa-btn sa-btn-primary"
            disabled={creatingTicket}
            onClick={createSupportTicket}
          >
            {creatingTicket ? "در حال ارسال…" : "ارسال تیکت پشتیبانی"}
          </button>

          {!tickets.length ? (
            <div className="sa-empty" style={{ padding: 28, marginTop: 16 }}>
              هنوز تیکتی ثبت نکرده‌اید.
            </div>
          ) : (
            <div className="sa-table-wrap" style={{ marginTop: 20 }}>
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>موضوع</th>
                    <th>وضعیت</th>
                    <th>تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr
                      key={t.id}
                      style={{ cursor: "pointer", background: selectedTicketId === t.id ? "var(--sa-surface-soft)" : undefined }}
                      onClick={() => openTicket(t.id)}
                    >
                      <td data-label="موضوع">{t.subject}</td>
                      <td data-label="وضعیت">
                        <Badge status={t.status} />
                      </td>
                      <td data-label="تاریخ">{formatDateTime(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedTicketId ? (
            <div className="sa-panel" style={{ marginTop: 16, background: "var(--sa-surface-soft)" }}>
              <div className="sa-panel-body">
                {loadingTicket ? (
                  <p style={{ color: "var(--sa-text-muted)" }}>در حال بارگذاری…</p>
                ) : selectedTicket ? (
                  <>
                    <div className="sa-actions-row" style={{ marginTop: 0, marginBottom: 12 }}>
                      <strong>{selectedTicket.subject}</strong>
                      <Badge status={selectedTicket.status} />
                    </div>
                    {[...(selectedTicket.messages || [])].reverse().map((m) => {
                      const accessPayload = resolveAccessPayload(m, selectedTicket.subject);
                      return (
                        <div key={m.id} className="sa-ticket-message">
                          <div className="sa-ticket-message-meta">
                            {MSG_FROM_FA[m.from] || m.from} · {formatDateTime(m.createdAt)}
                          </div>
                          {accessPayload ? (
                            <AccessCredentialsCard payload={accessPayload} />
                          ) : (
                            <div className="sa-ticket-message-body">{m.body}</div>
                          )}
                        </div>
                      );
                    })}
                    {selectedTicket.status !== "closed" && selectedTicket.status !== "resolved" ? (
                      <>
                        <div className="sa-field" style={{ marginTop: 12 }}>
                          <label className="sa-label">پاسخ شما</label>
                          <textarea
                            className="sa-textarea"
                            rows={3}
                            value={ticketReply}
                            onChange={(e) => setTicketReply(e.target.value)}
                            placeholder="پاسخ یا توضیح بیشتر…"
                          />
                        </div>
                        <button
                          type="button"
                          className="sa-btn sa-btn-primary"
                          disabled={sendingReply || !ticketReply.trim()}
                          onClick={sendTicketReply}
                        >
                          {sendingReply ? "در حال ارسال…" : "ارسال پاسخ"}
                        </button>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
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
