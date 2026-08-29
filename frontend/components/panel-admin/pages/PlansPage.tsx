"use client";

import { useEffect, useState } from "react";
import { saFetch } from "@/lib/super-admin/api";
import { formatMoney, savingsPercent } from "@/lib/super-admin/format";
import type { Plan } from "@/lib/super-admin/types";
import { toast } from "../ui/Toast";
import { Badge, EmptyState, ErrorBox, Modal, PageHeader, SkeletonTable } from "../ui/primitives";

const CYCLE_LABEL: Record<string, string> = {
  monthly: "ماهانه",
  "6months": "۶ ماهه",
  yearly: "سالانه",
};

const ENTITLEMENT_BOOL: { key: string; label: string }[] = [
  { key: "digitalMenu", label: "منوی دیجیتال" },
  { key: "crm", label: "باشگاه مشتریان" },
  { key: "pos", label: "صندوق فروش" },
  { key: "kitchenDisplay", label: "نمایشگر آشپزخانه" },
  { key: "printers", label: "پرینترها" },
  { key: "advancedAnalytics", label: "تحلیل پیشرفته" },
  { key: "multiBranch", label: "چندشعبه" },
  { key: "prioritySupport", label: "پشتیبانی ویژه" },
  { key: "customDomain", label: "دامنه اختصاصی" },
  { key: "apiAccess", label: "دسترسی API" },
];

const ENTITLEMENT_NUM: { key: string; label: string }[] = [
  { key: "maxUsers", label: "حداکثر کاربر" },
  { key: "maxBranches", label: "حداکثر شعبه" },
  { key: "maxMenuItems", label: "حداکثر آیتم منو" },
  { key: "maxOrdersPerMonth", label: "سفارش ماهانه" },
  { key: "storageMb", label: "فضای ذخیره (مگابایت)" },
];

function entitlementLabel(key: string): string {
  return (
    ENTITLEMENT_BOOL.find((x) => x.key === key)?.label ||
    ENTITLEMENT_NUM.find((x) => x.key === key)?.label ||
    key
  );
}

function EntitlementsEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const ent = value || {};
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {ENTITLEMENT_BOOL.map(({ key, label }) => (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem" }}>
            <input
              type="checkbox"
              checked={Boolean(ent[key])}
              onChange={(e) => onChange({ ...ent, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="sa-grid-2" style={{ gap: 12 }}>
        {ENTITLEMENT_NUM.map(({ key, label }) => (
          <div className="sa-field" key={key} style={{ margin: 0 }}>
            <label className="sa-label">{label}</label>
            <input
              className="sa-input"
              type="number"
              value={Number(ent[key] ?? 0)}
              onChange={(e) => onChange({ ...ent, [key]: Number(e.target.value) || 0 })}
            />
          </div>
        ))}
      </div>
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
          entitlements: { maxUsers: 5, digitalMenu: true, crm: false },
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

  return (
    <>
      <PageHeader
        title="پلن‌ها و قیمت‌گذاری"
        description="تنظیم دسترسی‌ها و دوره‌های صورتحساب به‌صورت مستقل"
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
                  <th>ماهانه</th>
                  <th>۶ ماهه</th>
                  <th>سالانه</th>
                  <th>وضعیت</th>
                  <th>اقدامات</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => {
                  const s6 = savingsPercent(p.prices?.monthly || 0, p.prices?.["6months"] || 0, 6);
                  const sy = savingsPercent(p.prices?.monthly || 0, p.prices?.yearly || 0, 12);
                  return (
                    <tr key={p.id}>
                      <td data-label="پلن">
                        <strong>{p.name}</strong>
                        <div style={{ fontSize: "0.8rem", color: "var(--sa-text-faint)" }}>{p.description}</div>
                      </td>
                      <td data-label="ماهانه">{formatMoney(p.prices?.monthly || 0)}</td>
                      <td data-label="۶ ماهه">
                        {formatMoney(p.prices?.["6months"] || 0)}
                        {s6 ? <div style={{ fontSize: "0.75rem", color: "var(--sa-ok)" }}>صرفه‌جویی {s6.toLocaleString("fa-IR")}٪</div> : null}
                      </td>
                      <td data-label="سالانه">
                        {formatMoney(p.prices?.yearly || 0)}
                        {sy ? <div style={{ fontSize: "0.75rem", color: "var(--sa-ok)" }}>صرفه‌جویی {sy.toLocaleString("fa-IR")}٪</div> : null}
                      </td>
                      <td data-label="وضعیت">
                        <Badge status={p.status} />
                      </td>
                      <td data-label="اقدامات">
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setEdit({ ...p })}>
                          ویرایش
                        </button>
                        <button
                          type="button"
                          className="sa-btn sa-btn-ghost sa-btn-sm"
                          onClick={() => onNavigate(`/panel-admin/plans/${p.id}/`)}
                        >
                          باز کردن
                        </button>
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
              <label className="sa-label">وضعیت</label>
              <select
                className="sa-select"
                value={edit.status}
                onChange={(e) => setEdit({ ...edit, status: e.target.value })}
              >
                <option value="active">فعال</option>
                <option value="disabled">غیرفعال</option>
                <option value="archived">بایگانی</option>
              </select>
            </div>
            {(["monthly", "6months", "yearly"] as const).map((cycle) => (
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
              <label className="sa-label">دسترسی‌ها و محدودیت‌ها</label>
              <EntitlementsEditor
                value={(edit.entitlements || {}) as Record<string, unknown>}
                onChange={(next) => setEdit({ ...edit, entitlements: next as Plan["entitlements"] })}
              />
            </div>
            <div className="sa-modal-actions">
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
              <label>ماهانه</label>
              <strong>{formatMoney(plan.prices?.monthly || 0)}</strong>
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
