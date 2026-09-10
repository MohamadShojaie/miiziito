"use client";

import { useEffect, useState } from "react";
import { saFetch } from "@/lib/super-admin/api";
import { formatMoney, savingsPercent } from "@/lib/super-admin/format";
import type { Plan } from "@/lib/super-admin/types";
import { toast } from "../ui/Toast";
import { Badge, EmptyState, ErrorBox, Modal, PageHeader, SkeletonTable } from "../ui/primitives";

const CYCLE_LABEL: Record<string, string> = {
  "6months": "۶ ماهه",
  yearly: "سالانه",
};

const ENTITLEMENT_BOOL: { key: string; label: string }[] = [
  { key: "invoices", label: "فاکتور" },
  { key: "reservations", label: "رزرو میز" },
  { key: "coupons", label: "کوپن" },
  { key: "advancedAnalytics", label: "آمار فروش" },
  { key: "paymentTerminal", label: "پایانه پرداخت" },
  { key: "crm", label: "باشگاه مشتریان" },
  { key: "hardware", label: "سخت‌افزار و پرینتر" },
  { key: "kitchenPrint", label: "چاپ تیکت آشپزخانه / بار" },
  { key: "tableOps", label: "وضعیت میز و سفارش از نقشه میزها" },
  { key: "menuCosting", label: "هزینه‌یابی منو" },
];

const EMPTY_ENTITLEMENTS: Record<string, boolean> = Object.fromEntries(
  ENTITLEMENT_BOOL.map(({ key }) => [key, false])
);

function pickEntitlements(value: Record<string, unknown> | undefined): Record<string, boolean> {
  const src = value || {};
  const out: Record<string, boolean> = {};
  for (const { key } of ENTITLEMENT_BOOL) {
    out[key] = Boolean(src[key]);
  }
  return out;
}

function entitlementLabel(key: string): string {
  return ENTITLEMENT_BOOL.find((x) => x.key === key)?.label || key;
}

function EntitlementsEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  const ent = pickEntitlements(value);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {ENTITLEMENT_BOOL.map(({ key, label }) => (
        <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem" }}>
          <input
            type="checkbox"
            checked={ent[key]}
            onChange={(e) => onChange({ ...ent, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

export function PlansPage({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<Plan | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await saFetch<{ items: Plan[] }>("sa-plans");
      setPlans(res.items || []);
      setError("");
    } catch {
      setError("بارگذاری پلن‌ها ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createPlan() {
    try {
      const res = await saFetch<{ plan: Plan }>("sa-plans", {
        method: "POST",
        body: JSON.stringify({
          name: name || "پلن جدید",
          entitlements: { ...EMPTY_ENTITLEMENTS },
          prices: { monthly: 0, "6months": 0, yearly: 0 },
        }),
      });
      toast("پلن ساخته شد", "success");
      setCreateOpen(false);
      setName("");
      onNavigate(`/panel-admin/plans/${res.plan.id}/`);
    } catch {
      toast("ایجاد ناموفق بود", "error");
    }
  }

  async function savePlan() {
    if (!edit) return;
    try {
      await saFetch("sa-plan", {
        id: edit.id,
        method: "POST",
        body: JSON.stringify(edit),
      });
      toast("پلن ذخیره شد", "success");
      setEdit(null);
      load();
    } catch {
      toast("ذخیره ناموفق بود", "error");
    }
  }

  async function setPlanVisibility(plan: Plan, visible: boolean) {
    try {
      await saFetch("sa-plan", {
        id: plan.id,
        method: "POST",
        body: JSON.stringify({ status: visible ? "active" : "disabled" }),
      });
      toast(visible ? "پلن در فروشگاه نمایش داده می‌شود" : "پلن از فروشگاه مخفی شد", "success");
      load();
    } catch {
      toast("تغییر وضعیت ناموفق بود", "error");
    }
  }

  async function deletePlan(plan: Plan) {
    if (!confirm(`پلن «${plan.name}» حذف شود؟ این کار قابل بازگشت نیست.`)) return;
    try {
      await saFetch("sa-plan", {
        id: plan.id,
        method: "DELETE",
      });
      toast("پلن حذف شد", "success");
      if (edit?.id === plan.id) setEdit(null);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast(
        msg && msg !== "plan_in_use" && msg !== "request_failed"
          ? msg
          : "حذف ممکن نیست. اگر پلن در حال استفاده است، ابتدا آن را مخفی کنید.",
        "error",
      );
    }
  }

  return (
    <>
      <PageHeader
        title="پلن‌ها و قیمت‌گذاری"
        description="پلن‌های فعال در فروشگاه عمومی نمایش داده می‌شوند. پلن‌های مخفی فقط در پنل باقی می‌مانند."
        actions={
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setCreateOpen(true)}>
            ایجاد پلن
          </button>
        }
      />
      <div className="sa-panel">
        {loading ? (
          <SkeletonTable />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : !plans.length ? (
          <EmptyState title="پلنی نیست" description="اولین پلن اشتراک را بسازید." />
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>پلن</th>
                  <th>۶ ماهه</th>
                  <th>سالانه</th>
                  <th>نمایش در فروشگاه</th>
                  <th>اقدامات</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => {
                  const six = p.prices?.["6months"] || 0;
                  const yearly = p.prices?.yearly || 0;
                  const monthlyEq = six > 0 ? six / 6 : 0;
                  const sy = savingsPercent(monthlyEq, yearly, 12);
                  const visible = p.status === "active";
                  return (
                    <tr key={p.id}>
                      <td data-label="پلن">
                        <strong>{p.name}</strong>
                        <div style={{ fontSize: "0.8rem", color: "var(--sa-text-faint)" }}>{p.description}</div>
                      </td>
                      <td data-label="۶ ماهه">{formatMoney(six)}</td>
                      <td data-label="سالانه">
                        {formatMoney(yearly)}
                        {sy ? <div style={{ fontSize: "0.75rem", color: "var(--sa-ok)" }}>صرفه‌جویی {sy.toLocaleString("fa-IR")}٪</div> : null}
                      </td>
                      <td data-label="نمایش در فروشگاه">
                        <Badge status={visible ? "active" : "disabled"} />
                        <div style={{ fontSize: "0.75rem", color: "var(--sa-text-faint)", marginTop: 4 }}>
                          {visible ? "قابل خرید در صفحه اصلی" : "مخفی از فروشگاه"}
                        </div>
                      </td>
                      <td data-label="اقدامات">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setEdit({ ...p, entitlements: pickEntitlements(p.entitlements as Record<string, unknown>) })}>
                            ویرایش
                          </button>
                          <button
                            type="button"
                            className="sa-btn sa-btn-ghost sa-btn-sm"
                            onClick={() => setPlanVisibility(p, !visible)}
                          >
                            {visible ? "مخفی کردن" : "نمایش در فروشگاه"}
                          </button>
                          <button
                            type="button"
                            className="sa-btn sa-btn-ghost sa-btn-sm"
                            onClick={() => onNavigate(`/panel-admin/plans/${p.id}/`)}
                          >
                            باز کردن
                          </button>
                          <button
                            type="button"
                            className="sa-btn sa-btn-ghost sa-btn-sm"
                            style={{ color: "var(--sa-danger, #e06c75)" }}
                            onClick={() => deletePlan(p)}
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={createOpen} title="ایجاد پلن" onClose={() => setCreateOpen(false)}>
        <div className="sa-field">
          <label className="sa-label">نام</label>
          <input className="sa-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="sa-modal-actions">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setCreateOpen(false)}>
            انصراف
          </button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={createPlan}>
            ایجاد
          </button>
        </div>
      </Modal>

      <Modal open={!!edit} title="ویرایش پلن" onClose={() => setEdit(null)} size="lg">
        {edit ? (
          <>
            <div className="sa-field">
              <label className="sa-label">نام</label>
              <input className="sa-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </div>
            <div className="sa-field">
              <label className="sa-label">توضیحات</label>
              <textarea
                className="sa-textarea"
                rows={2}
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
              />
            </div>
            <div className="sa-field">
              <label className="sa-label">ویژگی‌های نمایشی صفحه فروش</label>
              <textarea
                className="sa-textarea"
                rows={8}
                dir="rtl"
                placeholder={"هر خط یک ویژگی — مثلاً:\nمنوی دیجیتال QR\nسفارش سر میز\nصدازدن گارسون"}
                value={(edit.marketingFeatures || []).join("\n")}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    marketingFeatures: e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .slice(0, 30),
                  })
                }
              />
              <p className="sa-hint" style={{ marginTop: 6, fontSize: "0.8rem", color: "var(--sa-text-faint)" }}>
                این لیست روی صفحه اصلی (کارت پلن) نشان داده می‌شود. هر خط یک مورد. حداکثر ۳۰ مورد.
              </p>
            </div>
            <div className="sa-field">
              <label className="sa-label">نمایش در فروشگاه</label>
              <select
                className="sa-select"
                value={edit.status === "active" ? "active" : "disabled"}
                onChange={(e) => setEdit({ ...edit, status: e.target.value })}
              >
                <option value="active">نمایش داده شود (قابل خرید)</option>
                <option value="disabled">مخفی از فروشگاه</option>
              </select>
              <p className="sa-hint" style={{ marginTop: 6, fontSize: "0.8rem", color: "var(--sa-text-faint)" }}>
                فقط پلن‌های «نمایش» روی صفحه اصلی فروشگاه دیده می‌شوند.
              </p>
            </div>
            {(["6months", "yearly"] as const).map((cycle) => (
              <div className="sa-field" key={cycle}>
                <label className="sa-label">قیمت · {CYCLE_LABEL[cycle]}</label>
                <input
                  className="sa-input"
                  type="number"
                  value={edit.prices?.[cycle] ?? 0}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      prices: { ...edit.prices, [cycle]: Number(e.target.value) || 0 },
                    })
                  }
                />
              </div>
            ))}
            <div className="sa-field">
              <label className="sa-label">دسترسی‌های پنل صندوق</label>
              <EntitlementsEditor
                value={(edit.entitlements || {}) as Record<string, unknown>}
                onChange={(next) => setEdit({ ...edit, entitlements: next as Plan["entitlements"] })}
              />
            </div>
            <div className="sa-modal-actions">
              <button
                type="button"
                className="sa-btn sa-btn-ghost"
                style={{ color: "var(--sa-danger, #e06c75)", marginInlineEnd: "auto" }}
                onClick={() => deletePlan(edit)}
              >
                حذف پلن
              </button>
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setEdit(null)}>
                انصراف
              </button>
              <button type="button" className="sa-btn sa-btn-primary" onClick={savePlan}>
                ذخیره
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}

export function PlanDetailPage({ id, onNavigate }: { id: string; onNavigate: (href: string) => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    saFetch<{ plan: Plan }>("sa-plan", { id })
      .then((r) => setPlan(r.plan))
      .catch(() => setPlan(null));
  }, [id]);

  if (!plan) {
    return (
      <PageHeader
        title="پلن"
        actions={
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => onNavigate("/panel-admin/plans/")}>
            ← بازگشت
          </button>
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        title={plan.name}
        description={plan.description}
        actions={
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => onNavigate("/panel-admin/plans/")}>
            ← بازگشت
          </button>
        }
      />
      <div className="sa-panel">
        <div className="sa-panel-body">
          <div className="sa-detail-grid">
            <div className="sa-detail-item">
              <label>وضعیت</label>
              <strong>
                <Badge status={plan.status} />
              </strong>
            </div>
            <div className="sa-detail-item">
              <label>۶ ماهه</label>
              <strong>{formatMoney(plan.prices?.["6months"] || 0)}</strong>
            </div>
            <div className="sa-detail-item">
              <label>سالانه</label>
              <strong>{formatMoney(plan.prices?.yearly || 0)}</strong>
            </div>
          </div>
          <h3 style={{ marginTop: 24, fontSize: "0.95rem" }}>ویژگی‌های نمایشی صفحه فروش</h3>
          {(plan.marketingFeatures || []).length ? (
            <ul style={{ margin: "12px 0 0", paddingInlineStart: 20, fontSize: "0.9rem", lineHeight: 1.8 }}>
              {(plan.marketingFeatures || []).map((feat) => (
                <li key={feat}>{feat}</li>
              ))}
            </ul>
          ) : (
            <p style={{ marginTop: 12, color: "var(--sa-text-faint)", fontSize: "0.9rem" }}>
              هنوز ویژگی نمایشی تنظیم نشده — از ویرایش پلن اضافه کنید.
            </p>
          )}
          <h3 style={{ marginTop: 24, fontSize: "0.95rem" }}>دسترسی‌ها</h3>
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
            {Object.entries(plan.entitlements || {}).map(([key, val]) => (
              <li
                key={key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--sa-border)",
                  fontSize: "0.9rem",
                }}
              >
                <span>{entitlementLabel(key)}</span>
                <strong>
                  {typeof val === "boolean" ? (val ? "فعال" : "غیرفعال") : String(val ?? "—")}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
