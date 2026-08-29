export function formatMoney(amount: number, currency = "IRT"): string {
  const n = Number(amount) || 0;
  if (currency === "IRT" || currency === "IRR") {
    return new Intl.NumberFormat("fa-IR").format(n) + " تومان";
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatPct(change: number | null | undefined): string {
  if (change === null || change === undefined) return "";
  const sign = change > 0 ? "+" : "";
  return `${sign}${change}%`;
}

export function savingsPercent(monthly: number, cyclePrice: number, months: number): number | null {
  if (!monthly || !cyclePrice || !months) return null;
  const full = monthly * months;
  if (full <= 0) return null;
  const saved = Math.round(((full - cyclePrice) / full) * 100);
  return saved > 0 ? saved : null;
}

export function statusTone(status: string): "ok" | "warn" | "danger" | "muted" | "info" {
  const s = (status || "").toLowerCase();
  if (["active", "successful", "healthy", "resolved", "open"].includes(s)) return "ok";
  if (["trial", "pending", "past_due", "grace_period", "warning", "in_progress", "waiting_customer"].includes(s))
    return "warn";
  if (["expired", "suspended", "cancelled", "failed", "critical", "refunded"].includes(s))
    return "danger";
  if (["unknown"].includes(s)) return "muted";
  return "info";
}
