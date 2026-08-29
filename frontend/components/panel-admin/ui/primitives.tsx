"use client";

import type { ReactNode } from "react";
import { statusTone } from "@/lib/super-admin/format";

const STATUS_FA: Record<string, string> = {
  active: "فعال",
  trial: "آزمایشی",
  expired: "منقضی",
  suspended: "معلق",
  cancelled: "لغو شده",
  pending: "در انتظار",
  successful: "موفق",
  failed: "ناموفق",
  refunded: "استرداد",
  contacted: "تماس گرفته شد",
  fulfilled: "انجام شده",
  rejected: "رد شده",
  open: "باز",
  in_progress: "در حال پیگیری",
  waiting_customer: "منتظر مشتری",
  resolved: "حل‌شده",
  closed: "بسته",
  past_due: "معوق",
  grace_period: "مهلت",
  healthy: "سالم",
  warning: "هشدار",
  critical: "بحرانی",
  unknown: "نامشخص",
  low: "کم",
  normal: "عادی",
  high: "بالا",
  urgent: "فوری",
  sent: "ارسال‌شده",
  draft: "پیش‌نویس",
  disabled: "غیرفعال",
  archived: "بایگانی",
};

export function Badge({ status }: { status: string }) {
  const tone = statusTone(status);
  const label = STATUS_FA[status] || status.replace(/_/g, " ");
  return <span className={`sa-badge ${tone}`}>{label}</span>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="sa-empty">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function SkeletonKpis({ count = 6 }: { count?: number }) {
  return (
    <div className="sa-kpi-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="sa-skeleton sa-skel-kpi" />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ padding: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="sa-skeleton sa-skel-row" />
      ))}
    </div>
  );
}

export function ErrorBox({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="sa-empty">
      <h3>مشکلی پیش آمد</h3>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="sa-btn sa-btn-ghost" onClick={onRetry}>
          تلاش دوباره
        </button>
      ) : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="sa-page-head">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="sa-actions-row" style={{ marginTop: 0 }}>{actions}</div> : null}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  change,
  formatValue,
}: {
  label: string;
  value: number;
  change?: number | null;
  formatValue?: (n: number) => string;
}) {
  const formatted = formatValue ? formatValue(value) : value.toLocaleString("fa-IR");
  const changeClass =
    change === null || change === undefined ? "flat" : change > 0 ? "up" : change < 0 ? "down" : "flat";
  const changeText =
    change === null || change === undefined
      ? "—"
      : `${change > 0 ? "+" : ""}${change.toLocaleString("fa-IR")}٪ نسبت به قبل`;

  return (
    <div className="sa-kpi">
      <div className="sa-kpi-label">{label}</div>
      <div className="sa-kpi-value">{formatted}</div>
      <div className={`sa-kpi-change ${changeClass}`}>{changeText}</div>
    </div>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
  size = "md",
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: "md" | "lg";
}) {
  if (!open) return null;
  return (
    <div className="sa-overlay" onClick={onClose} role="presentation">
      <div
        className={`sa-modal ${size === "lg" ? "sa-modal-lg" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="sa-modal-head">
          <h3>{title}</h3>
        </div>
        <div className="sa-modal-body">{children}</div>
      </div>
    </div>
  );
}
