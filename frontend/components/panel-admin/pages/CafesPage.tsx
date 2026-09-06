"use client";

import { useEffect, useState } from "react";
import { saFetch } from "@/lib/super-admin/api";
import { formatDate } from "@/lib/super-admin/format";
import type { Cafe, PageResult, Plan } from "@/lib/super-admin/types";
import { toast } from "../ui/Toast";
import { CafeUrlField } from "../CafeUrlField";
import {
  Badge,
  EmptyState,
  ErrorBox,
  Modal,
  PageHeader,
  SkeletonTable,
} from "../ui/primitives";

export function CafesPage({
  onNavigate,
  initialStatus = "",
}: {
  onNavigate: (href: string) => void;
  initialStatus?: string;
}) {
  const [data, setData] = useState<PageResult<Cafe> | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", ownerName: "", email: "", phone: "" });
  const [plans, setPlans] = useState<Plan[]>([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await saFetch<PageResult<Cafe>>("sa-cafes", {
        query: { q, status, page, pageSize: 20, sort: "createdAt", order: "desc" },
      });
      setData(res);
    } catch {
      setError("بارگذاری کافه‌ها ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    saFetch<{ items: Plan[] }>("sa-plans")
      .then((r) => setPlans(r.items || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, page]);

  async function endSubscription(c: Cafe) {
    if (!confirm(`اشتراک «${c.name}» پایان یابد؟ منوی آنلاین غیرفعال می‌شود.`)) return;
    try {
      await saFetch("sa-cafe", {
        id: c.id,
        method: "POST",
        body: JSON.stringify({ action: "end_subscription" }),
      });
      toast("اشتراک پایان یافت", "success");
      load();
    } catch {
      toast("پایان اشتراک ممکن نشد", "error");
    }
  }

  async function suspendCafe(c: Cafe) {
    if (!confirm(`کافه «${c.name}» معلق شود؟`)) return;
    try {
      await saFetch("sa-cafe", {
        id: c.id,
        method: "POST",
        body: JSON.stringify({ action: "suspend", reason: "تعلیق توسط ادمین" }),
      });
      toast("کافه معلق شد", "success");
      load();
    } catch {
      toast("تعلیق ممکن نشد", "error");
    }
  }

  async function createCafe() {
    try {
      const res = await saFetch<{ cafe: Cafe; cashierPassword?: string }>("sa-cafes", {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (res.cashierPassword) {
        toast(`کافه ساخته شد — رمز صندوق: ${res.cashierPassword}`, "success");
      } else {
        toast("کافه ساخته شد", "success");
      }
      setCreateOpen(false);
      setForm({ name: "", ownerName: "", email: "", phone: "" });
      onNavigate(`/panel-admin/cafes/${res.cafe.id}/`);
    } catch {
      toast("ایجاد کافه ممکن نشد", "error");
    }
  }

  const planName = (id?: string | null) => plans.find((p) => p.id === id)?.name || "—";

  return (
    <>
      <PageHeader
        title="کافه‌ها"
        description="همه کافه‌ها و رستوران‌های روی پلتفرم"
        actions={
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setCreateOpen(true)}>
            ایجاد کافه
          </button>
        }
      />
      <div className="sa-toolbar">
        <input
          className="sa-input"
          placeholder="جستجوی نام، مالک، تلفن، ایمیل…"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className="sa-select"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">همه وضعیت‌ها</option>
          <option value="active">فعال</option>
          <option value="trial">آزمایشی</option>
          <option value="expired">منقضی</option>
          <option value="suspended">معلق</option>
          <option value="cancelled">لغو شده</option>
          <option value="pending">در انتظار</option>
        </select>
      </div>

      <div className="sa-panel">
        {loading ? (
          <SkeletonTable />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : !data?.items?.length ? (
          <EmptyState
            title="هنوز کافه‌ای نیست"
            description="اولین کافه را اضافه کنید تا اشتراک و درآمد را پیگیری کنید."
            action={
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => setCreateOpen(true)}>
                ایجاد کافه
              </button>
            }
          />
        ) : (
          <>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>کافه</th>
                    <th>منو</th>
                    <th>صندوق</th>
                    <th>مالک</th>
                    <th>تلفن</th>
                    <th>ایمیل</th>
                    <th>پلن</th>
                    <th>وضعیت</th>
                    <th>ایجاد</th>
                    <th>اقدامات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c) => (
                    <tr key={c.id}>
                      <td data-label="کافه">
                        <strong>{c.name}</strong>
                        {c.slug ? (
                          <div style={{ fontSize: "0.75rem", color: "var(--sa-text-faint)" }} dir="ltr">
                            /{c.slug}/
                          </div>
                        ) : null}
                      </td>
                      <td data-label="منو">
                        <CafeUrlField slug={c.slug} kind="menu" />
                      </td>
                      <td data-label="صندوق">
                        <CafeUrlField slug={c.slug} kind="cashier" />
                      </td>
                      <td data-label="مالک">{c.ownerName || "—"}</td>
                      <td data-label="تلفن">{c.phone || "—"}</td>
                      <td data-label="ایمیل">{c.email || "—"}</td>
                      <td data-label="پلن">{planName(c.planId)}</td>
                      <td data-label="وضعیت">
                        <Badge status={c.status} />
                      </td>
                      <td data-label="ایجاد">{formatDate(c.createdAt)}</td>
                      <td data-label="اقدامات">
                        <div className="sa-actions-row" style={{ flexWrap: "wrap", gap: 6 }}>
                          <button
                            type="button"
                            className="sa-btn sa-btn-ghost sa-btn-sm"
                            onClick={() => onNavigate(`/panel-admin/cafes/${c.id}/`)}
                          >
                            مشاهده
                          </button>
                          {(c.status === "active" || c.status === "trial") ? (
                            <button
                              type="button"
                              className="sa-btn sa-btn-ghost sa-btn-sm"
                              onClick={() => endSubscription(c)}
                            >
                              پایان اشتراک
                            </button>
                          ) : null}
                          {c.status === "active" || c.status === "trial" ? (
                            <button
                              type="button"
                              className="sa-btn sa-btn-ghost sa-btn-sm"
                              onClick={() => suspendCafe(c)}
                            >
                              تعلیق
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sa-pagination">
              <span>
                {data.total.toLocaleString("fa-IR")} مورد · صفحه {data.page.toLocaleString("fa-IR")} / {data.totalPages.toLocaleString("fa-IR")}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="sa-btn sa-btn-ghost sa-btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  قبلی
                </button>
                <button
                  type="button"
                  className="sa-btn sa-btn-ghost sa-btn-sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  بعدی
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal open={createOpen} title="ایجاد کافه" onClose={() => setCreateOpen(false)}>
        <div className="sa-field">
          <label className="sa-label">نام کافه</label>
          <input className="sa-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="sa-field">
          <label className="sa-label">مالک</label>
          <input className="sa-input" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
        </div>
        <div className="sa-field">
          <label className="sa-label">ایمیل</label>
          <input className="sa-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="sa-field">
          <label className="sa-label">تلفن</label>
          <input className="sa-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="sa-modal-actions">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setCreateOpen(false)}>
            انصراف
          </button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={createCafe}>
            ایجاد
          </button>
        </div>
      </Modal>
    </>
  );
}
