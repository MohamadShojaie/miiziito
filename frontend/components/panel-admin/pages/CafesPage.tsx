"use client";

import { useEffect, useState } from "react";
import { saFetch } from "@/lib/super-admin/api";
import type { Cafe, PageResult, Plan } from "@/lib/super-admin/types";
import { cafeCashierUrl, cafeMenuUrl } from "@/lib/super-admin/tenant-urls";
import { toast } from "../ui/Toast";
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

  async function deleteCafe(c: Cafe) {
    if (
      !confirm(
        `کافه «${c.name}» برای همیشه حذف شود؟\nمنو، سفارش‌ها، اشتراک و حساب مالک پاک می‌شوند.`
      )
    ) {
      return;
    }
    try {
      await saFetch("sa-cafe", {
        id: c.id,
        method: "POST",
        body: JSON.stringify({ action: "delete" }),
      });
      toast("کافه حذف شد", "success");
      load();
    } catch {
      toast("حذف کافه ممکن نشد", "error");
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
        description="لیست کافه‌ها — برای جزئیات و مدیریت اشتراک وارد هر کافه شوید"
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
              <table className="sa-table sa-table--cafes">
                <thead>
                  <tr>
                    <th>کافه</th>
                    <th>تماس</th>
                    <th>پلن</th>
                    <th>لینک</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c) => (
                    <tr key={c.id}>
                      <td data-label="کافه">
                        <div className="sa-cafe-cell">
                          <button
                            type="button"
                            className="sa-cafe-name"
                            onClick={() => onNavigate(`/panel-admin/cafes/${c.id}/`)}
                          >
                            {c.name}
                          </button>
                          <div className="sa-cafe-meta">
                            {c.slug ? <span dir="ltr">/{c.slug}/</span> : null}
                            <Badge status={c.status} />
                          </div>
                        </div>
                      </td>
                      <td data-label="تماس">
                        <div className="sa-cafe-contact">
                          <span>{c.ownerName || "—"}</span>
                          {c.phone ? <span className="sa-cafe-meta" dir="ltr">{c.phone}</span> : null}
                          {c.email ? <span className="sa-cafe-meta" dir="ltr">{c.email}</span> : null}
                        </div>
                      </td>
                      <td data-label="پلن">{planName(c.planId)}</td>
                      <td data-label="لینک">
                        {c.slug ? (
                          <div className="sa-cafe-links">
                            <a href={cafeMenuUrl(c.slug)} target="_blank" rel="noreferrer">
                              منو
                            </a>
                            <a href={cafeCashierUrl(c.slug)} target="_blank" rel="noreferrer">
                              صندوق
                            </a>
                          </div>
                        ) : (
                          <span className="sa-cafe-meta">بدون آدرس</span>
                        )}
                      </td>
                      <td data-label="اقدامات">
                        <div className="sa-cafe-actions">
                          <button
                            type="button"
                            className="sa-btn sa-btn-primary sa-btn-sm"
                            onClick={() => onNavigate(`/panel-admin/cafes/${c.id}/`)}
                          >
                            مدیریت
                          </button>
                          <button
                            type="button"
                            className="sa-btn sa-btn-ghost sa-btn-sm sa-cafe-delete"
                            onClick={() => deleteCafe(c)}
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sa-pagination">
              <span>
                {data.total.toLocaleString("fa-IR")} مورد · صفحه {data.page.toLocaleString("fa-IR")} /{" "}
                {data.totalPages.toLocaleString("fa-IR")}
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
          <input
            className="sa-input"
            value={form.ownerName}
            onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
          />
        </div>
        <div className="sa-field">
          <label className="sa-label">ایمیل</label>
          <input
            className="sa-input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
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
