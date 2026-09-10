const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] || d);
}

export function parsePrice(value: unknown): number {
  if (typeof value === "number") return value;
  if (value == null) return 0;
  const s = String(value)
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[^\d.]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function formatPriceAsNumber(n: number): string {
  const v = Math.round(Number(n) || 0);
  return toPersianDigits(v.toLocaleString("en-US"));
}

export function formatOrderTime(ts?: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return toPersianDigits(`${h}:${m}`);
}

const DAY_MS = 86400000;

export function formatDaysAgo(ts?: number | null): string {
  if (!ts) return "—";
  const days = Math.floor((Date.now() - ts) / DAY_MS);
  if (days <= 0) return "امروز";
  if (days === 1) return "دیروز";
  return `${toPersianDigits(days)} روز پیش`;
}

export function formatLastTouch(ts?: number | null): string {
  if (!ts) return "هنوز ثبت نشده";
  const then = new Date(ts);
  const now = new Date();
  const startToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const startThen = new Date(
    then.getFullYear(),
    then.getMonth(),
    then.getDate()
  ).getTime();
  const dayDiff = Math.round((startToday - startThen) / DAY_MS);
  if (dayDiff <= 0) return `امروز، ${formatOrderTime(ts)}`;
  if (dayDiff === 1) return `دیروز، ${formatOrderTime(ts)}`;
  return `${formatDaysAgo(ts)}، ${formatOrderTime(ts)}`;
}

export function formatBirthday(iso?: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  return toPersianDigits(`${m[3]}/${m[2]}/${m[1]}`);
}

export function normalizeStatus(status?: string): string {
  if (status === "given") return "preparing";
  return status || "waiting";
}

/** Takeaway sentinel table — not a physical seat (parse_table_number rejects 0). */
export const TAKEAWAY_TABLE = "0";

export function isTakeawayOrder(order: { type?: string } | null | undefined): boolean {
  return order?.type === "takeaway";
}

export function isFoodLikeOrder(order: { type?: string } | null | undefined): boolean {
  const t = order?.type || "food";
  return t === "food" || t === "takeaway";
}

/** Display label for where the order belongs (table vs بیرون‌بر). */
export function orderLocationLabel(order: {
  type?: string;
  table?: string | number;
}): string {
  if (order.type === "takeaway") return "بیرون‌بر";
  return `میز ${toPersianDigits(String(order.table ?? ""))}`;
}

export function slugId(name: string, index: number): string {
  return `item-${index}-${name}`.replace(/\s+/g, "-").slice(0, 64);
}
