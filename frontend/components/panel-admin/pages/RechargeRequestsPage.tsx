"use client";

import { useEffect, useState } from "react";
import { saFetch } from "@/lib/super-admin/api";
import { formatDate, formatMoney } from "@/lib/super-admin/format";
import { toast } from "../ui/Toast";
import { Badge, EmptyState, ErrorBox, PageHeader, SkeletonTable } from "../ui/primitives";

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
  createdAt: string;
  tenantId?: string;
};

const CYCLE: Record<string, string> = {
  monthly: "ماهانه",
  "6months": "۶ ماهه",
  yearly: "سالانه",
};

export function RechargeRequestsPage() {
  const [items, setItems] = useState<RecReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("pending");

  async function load() {
    setLoading(true);
    try {
      const res = await saFetch<{ items: RecReq[] }>("sa-recharge-requests", {
        query: { status, pageSize: 50 },
      });
      setItems(res.items || []);
      setError("");
    } catch {
      setError("بارگذاری درخواست‌ها ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function act(id: string, action: string) {
    try {
      await saFetch("sa-recharge-request", {
        id,
        method: "POST",
        body: JSON.stringify({ action }),
      });
      toast(
        action === "fulfill"
          ? "اشتراک فعال / تمدید شد"
          : action === "contact"
            ? "وضعیت: تماس گرفته شد"
            : "رد شد",
        "success"
      );
      load();
    } catch {
      toast("عملیات ناموفق", "error");
    }
  }

  return (
    <>
      <PageHeader
        title="درخواست‌های خرید و تمدید"
        description="کافه‌ها درخواست می‌فرستند؛ شما تماس بگیرید یا تیکت بزنید و حساب را شارژ کنید"
      />
      <div className="sa-toolbar">
        <select className="sa-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">همه</option>
          <option value="pending">در انتظار</option>
          <option value="contacted">تماس گرفته شده</option>
          <option value="fulfilled">انجام شده</option>
          <option value="rejected">رد شده</option>
        </select>
      </div>
      <div className="sa-panel">
        {loading ? (
          <SkeletonTable />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : !items.length ? (
          <EmptyState title="درخواستی نیست" description="وقتی کافه‌ها درخواست بفرستند اینجا می‌آید." />
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>کافه</th>
                  <th>تماس</th>
                  <th>پلن</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                  <th>اقدام</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
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
                    <td data-label="وضعیت">
                      <Badge status={r.status} />
                    </td>
                    <td data-label="تاریخ">{formatDate(r.createdAt)}</td>
                    <td data-label="اقدام">
                      {r.status === "pending" || r.status === "contacted" ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => act(r.id, "contact")}>
                            تماس
                          </button>
                          <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" onClick={() => act(r.id, "fulfill")}>
                            فعال‌سازی
                          </button>
                          <button type="button" className="sa-btn sa-btn-danger sa-btn-sm" onClick={() => act(r.id, "reject")}>
                            رد
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
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
