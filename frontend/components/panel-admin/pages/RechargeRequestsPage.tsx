"use client";

import { useEffect, useState } from "react";
import { saFetch } from "@/lib/super-admin/api";
import { formatDate, formatMoney } from "@/lib/super-admin/format";
import { toast } from "../ui/Toast";
import { Badge, EmptyState, ErrorBox, Modal, PageHeader, SkeletonTable } from "../ui/primitives";

type RecReq = {
  id: string;
  type: string;
  status: string;
  cafeName?: string;
  ownerName?: string;
  phone?: string;
  email?: string;
  planName?: string;
  billingCycle?: string;
  price?: number;
  note?: string;
  adminNote?: string;
  userPaymentReference?: string;
  userPaymentNote?: string;
  paymentCardNumber?: string;
  createdAt: string;
  tenantId?: string;
};

const CYCLE: Record<string, string> = {
  monthly: "ماهانه",
  "6months": "۶ ماهه",
  yearly: "سالانه",
};

const STEP_LABEL: Record<string, string> = {
  pending: "۱. در انتظار بررسی",
  awaiting_payment: "۲. منتظر واریز مشتری",
  contacted: "۲. منتظر واریز مشتری",
  payment_submitted: "۳. پرداخت ثبت شد — تأیید کنید",
  fulfilled: "۴. فعال شد",
  rejected: "رد شده",
};

const ACTION_REQUIRED = new Set(["pending", "payment_submitted"]);

const STATUS_PRIORITY: Record<string, number> = {
  payment_submitted: 0,
  pending: 1,
  awaiting_payment: 2,
  contacted: 3,
  fulfilled: 4,
  rejected: 5,
};

export function RechargeRequestsPage() {
  const [items, setItems] = useState<RecReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("action_required");
  const [payModal, setPayModal] = useState<RecReq | null>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [payNote, setPayNote] = useState("");

  async function load() {
    setLoading(true);
    try {
      const queryStatus = status === "action_required" ? "" : status;
      const [res, settingsRes] = await Promise.all([
        saFetch<{ items: RecReq[] }>("sa-recharge-requests", {
          query: { status: queryStatus, pageSize: 100 },
        }),
        saFetch<{ settings: Record<string, string> }>("sa-system-settings").catch(() => ({
          settings: {} as Record<string, string>,
        })),
      ]);
      let rows = res.items || [];
      if (status === "action_required") {
        rows = rows
          .filter((r) => ACTION_REQUIRED.has(r.status))
          .sort(
            (a, b) =>
              (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99) ||
              String(b.createdAt).localeCompare(String(a.createdAt))
          );
      }
      setItems(rows);
      const s = settingsRes.settings || {};
      if (!cardNumber) setCardNumber(String(s.paymentCardNumber || ""));
      if (!cardHolder) setCardHolder(String(s.paymentCardHolder || ""));
      setError("");
    } catch {
      setError("بارگذاری درخواست‌ها ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 20000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const awaitingApproval = items.filter((r) => r.status === "payment_submitted").length;

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    try {
      await saFetch("sa-recharge-request", {
        id,
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      });
      toast(
        action === "fulfill"
          ? "اشتراک فعال شد"
          : action === "send_payment_info"
            ? "شماره کارت برای مشتری ارسال شد"
            : action === "reject"
              ? "رد شد"
              : "به‌روزرسانی شد",
        "success"
      );
      setPayModal(null);
      load();
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      toast(
        code === "payment_card_missing"
          ? "شماره کارت را وارد کنید"
          : code === "invalid_status"
            ? "وضعیت درخواست برای این عملیات مناسب نیست"
            : "عملیات ناموفق",
        "error"
      );
    }
  }

  function openPayModal(r: RecReq) {
    setPayModal(r);
  }

  return (
    <>
      <PageHeader
        title="درخواست‌های خرید و تمدید"
        description="مشتری درخواست می‌فرستد → شما شماره کارت می‌دهید → مشتری «پرداخت کردم» می‌زند → شما فعال می‌کنید"
      />
      <div className="sa-toolbar">
        <select className="sa-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="action_required">نیاز به اقدام من</option>
          <option value="">همه</option>
          <option value="pending">در انتظار (ارسال کارت)</option>
          <option value="awaiting_payment">منتظر پرداخت مشتری</option>
          <option value="payment_submitted">پرداخت ثبت‌شده — تأیید کنید</option>
          <option value="fulfilled">فعال شده</option>
          <option value="rejected">رد شده</option>
        </select>
      </div>
      {awaitingApproval > 0 && status === "action_required" ? (
        <div
          className="sa-panel"
          style={{
            marginBottom: 12,
            borderColor: "var(--sa-accent)",
            background: "color-mix(in srgb, var(--sa-accent) 12%, transparent)",
          }}
        >
          <div className="sa-panel-body" style={{ padding: "12px 16px" }}>
            <strong>{awaitingApproval.toLocaleString("fa-IR")} درخواست</strong> منتظر تأیید پرداخت است —
            دکمه «تأیید پرداخت و فعال‌سازی» را بزنید.
          </div>
        </div>
      ) : null}
      <div className="sa-panel">
        {loading ? (
          <SkeletonTable />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : !items.length ? (
          <EmptyState title="درخواستی نیست" description="وقتی کافه از سایت درخواست بفرستد اینجا می‌آید." />
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>کافه</th>
                  <th>تماس</th>
                  <th>پلن</th>
                  <th>مبلغ</th>
                  <th>مرحله</th>
                  <th>تاریخ</th>
                  <th>اقدام</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr
                    key={r.id}
                    style={
                      r.status === "payment_submitted"
                        ? { background: "color-mix(in srgb, var(--sa-accent) 8%, transparent)" }
                        : undefined
                    }
                  >
                    <td data-label="کافه">
                      <strong>{r.cafeName}</strong>
                      <div style={{ fontSize: "0.8rem", color: "var(--sa-text-faint)" }}>{r.ownerName}</div>
                    </td>
                    <td data-label="تماس">
                      <div>{r.phone || "—"}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--sa-text-faint)" }}>{r.email}</div>
                    </td>
                    <td data-label="پلن">
                      {r.planName}
                      <div style={{ fontSize: "0.8rem" }}>{CYCLE[r.billingCycle || ""] || r.billingCycle}</div>
                    </td>
                    <td data-label="مبلغ">{formatMoney(r.price || 0)}</td>
                    <td data-label="مرحله">
                      <Badge status={r.status} />
                      <div style={{ fontSize: "0.75rem", color: "var(--sa-text-faint)", marginTop: 4 }}>
                        {STEP_LABEL[r.status] || r.status}
                      </div>
                      {r.status === "payment_submitted" && r.userPaymentReference ? (
                        <div style={{ fontSize: "0.75rem", marginTop: 4 }}>
                          پیگیری: {r.userPaymentReference}
                          {r.userPaymentNote ? ` — ${r.userPaymentNote}` : ""}
                        </div>
                      ) : null}
                    </td>
                    <td data-label="تاریخ">{formatDate(r.createdAt)}</td>
                    <td data-label="اقدام">
                      {r.status === "pending" ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" onClick={() => openPayModal(r)}>
                            ارسال شماره کارت
                          </button>
                          <button type="button" className="sa-btn sa-btn-danger sa-btn-sm" onClick={() => act(r.id, "reject")}>
                            رد
                          </button>
                        </div>
                      ) : null}
                      {r.status === "awaiting_payment" || r.status === "contacted" ? (
                        <span style={{ fontSize: "0.85rem", color: "var(--sa-text-muted)" }}>منتظر مشتری</span>
                      ) : null}
                      {r.status === "payment_submitted" ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" onClick={() => act(r.id, "fulfill")}>
                            تأیید پرداخت و فعال‌سازی
                          </button>
                          <button type="button" className="sa-btn sa-btn-danger sa-btn-sm" onClick={() => act(r.id, "reject")}>
                            رد
                          </button>
                        </div>
                      ) : null}
                      {r.status === "fulfilled" || r.status === "rejected" ? "—" : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!payModal} title="ارسال اطلاعات پرداخت" onClose={() => setPayModal(null)}>
        {payModal ? (
          <>
            <p style={{ color: "var(--sa-text-muted)", marginTop: 0 }}>
              مبلغ: <strong>{formatMoney(payModal.price || 0)}</strong> — {payModal.cafeName}
            </p>
            <div className="sa-field">
              <label className="sa-label">شماره کارت (کارت‌به‌کارت)</label>
              <input className="sa-input" dir="ltr" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="6037-9977-XXXX-XXXX" />
            </div>
            <div className="sa-field">
              <label className="sa-label">نام صاحب کارت</label>
              <input className="sa-input" value={cardHolder} onChange={(e) => setCardHolder(e.target.value)} />
            </div>
            <div className="sa-field">
              <label className="sa-label">یادداشت برای مشتری (اختیاری)</label>
              <textarea className="sa-textarea" rows={2} value={payNote} onChange={(e) => setPayNote(e.target.value)} />
            </div>
            <div className="sa-modal-actions">
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setPayModal(null)}>
                انصراف
              </button>
              <button
                type="button"
                className="sa-btn sa-btn-primary"
                onClick={() =>
                  act(payModal.id, "send_payment_info", {
                    paymentCardNumber: cardNumber.trim(),
                    paymentCardHolder: cardHolder.trim(),
                    adminNote: payNote.trim(),
                  })
                }
              >
                ارسال به مشتری
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
