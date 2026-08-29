import type { Customer, CustomerTier, Invoice, Order } from "@/lib/types";
import { gregorianToJalali, jalaliToGregorian, jalaliWeekdayIndex } from "@/lib/jalali";

export const CRM_TIER_OPTIONS: Array<{ id: CustomerTier; title: string }> = [
  { id: "standard", title: "عادی" },
  { id: "silver", title: "نقره‌ای" },
  { id: "gold", title: "طلایی" },
  { id: "vip", title: "VIP" },
];

export type CrmSegment =
  | "all"
  | "vip"
  | "gold"
  | "active"
  | "inactive"
  | "birthday"
  | "followup"
  | "top"
  | "atrisk";

export type CrmFavorite = { name: string; count: number };

export type CrmVisitPattern = {
  avgMonthly: number;
  usualHours: string;
  busyDays: string[];
};

export type CrmRecentVisit = {
  key: string;
  kind: "order" | "invoice";
  orderId?: string;
  invoiceId?: string;
  number?: string;
  table?: string | number;
  total: number;
  status: string;
  createdAt: number;
};

export type CrmProfile = Customer & {
  visits: number;
  orderCount: number;
  spend: number;
  avgTicket: number;
  lastVisitAt: number | null;
  monthSpend: number;
  favorites: CrmFavorite[];
  recentVisits: CrmRecentVisit[];
  visitTimes: number[];
  invoices: Invoice[];
  visitPattern: CrmVisitPattern | null;
};

const DAY_MS = 86400000;
const AT_RISK_MIN_VISITS = 3;
const AT_RISK_MIN_GAP_DAYS = 21;
const AT_RISK_INTERVAL_MULT = 2.2;
const AT_RISK_EXTRA_DAYS = 14;
const INSIGHT_MIN_VISITS = 4;
const WEEKDAY_FA = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
];
const HOUR_BUCKETS: Array<{ start: number; end: number; label: string }> = [
  { start: 8, end: 12, label: "۰۸:۰۰ تا ۱۲:۰۰" },
  { start: 12, end: 16, label: "۱۲:۰۰ تا ۱۶:۰۰" },
  { start: 16, end: 20, label: "۱۶:۰۰ تا ۲۰:۰۰" },
  { start: 20, end: 24, label: "۲۰:۰۰ تا ۲۴:۰۰" },
  { start: 0, end: 8, label: "۰۰:۰۰ تا ۰۸:۰۰" },
];

export function customerTierLabel(tier?: CustomerTier | string): string {
  return CRM_TIER_OPTIONS.find((o) => o.id === tier)?.title || "عادی";
}

export function isActiveCustomer(customer?: Customer | null): boolean {
  return !!customer && !customer.deletedAt;
}

export function activeCustomers(customers: Customer[]): Customer[] {
  return customers.filter(isActiveCustomer);
}

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const tag = String(item || "").trim().slice(0, 24);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

export function normalizeTier(raw: unknown): CustomerTier {
  const v = String(raw || "").trim() as CustomerTier;
  if (v === "silver" || v === "gold" || v === "vip") return v;
  return "standard";
}

function invoiceIsPurchase(inv: Invoice): boolean {
  const st = String(inv.status || "paid");
  return st !== "cancelled";
}

function orderIsCountable(order: Order): boolean {
  if (order.type === "waiter") return false;
  const st = String(order.status || "");
  return st !== "cancelled";
}

export function matchesCustomerRecord(
  row: {
    customerId?: string | null;
    customerName?: string;
    customerPhone?: string;
  },
  customer: Customer
): boolean {
  const cid = String(row.customerId || "").trim();
  if (cid) return cid === customer.id;
  const name = String(customer.name || "").trim();
  const phone = String(customer.phone || "").trim();
  const rowName = String(row.customerName || "").trim();
  const rowPhone = String(row.customerPhone || "").trim();
  if (phone && rowPhone && phone === rowPhone) return true;
  if (name && rowName && name === rowName) return true;
  return false;
}

function startOfJalaliMonthMs(now = Date.now()): number {
  const { jy, jm } = gregorianToJalali(new Date(now));
  const start = jalaliToGregorian(jy, jm, 1);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
}

function itemName(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  return String((raw as { name?: string }).name || "").trim();
}

function itemCount(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  return Math.max(1, Number((raw as { count?: number }).count) || 1);
}

function collectFavorites(invoices: Invoice[], orders: Order[]): CrmFavorite[] {
  const map = new Map<string, { name: string; count: number }>();
  function add(name: string, count: number) {
    const key = name.toLowerCase();
    const cur = map.get(key) || { name, count: 0 };
    cur.count += count;
    map.set(key, cur);
  }
  invoices.forEach((inv) => {
    (inv.items || []).forEach((it) => {
      const name = itemName(it);
      if (name) add(name, itemCount(it));
    });
  });
  const invoiced = new Set(
    invoices.map((inv) => String(inv.orderId || "")).filter(Boolean)
  );
  orders.forEach((order) => {
    if (order.invoiceId || invoiced.has(order.id)) return;
    (order.items || []).forEach((it) => {
      const name = itemName(it);
      if (name) add(name, itemCount(it));
    });
  });
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
}

function buildVisitPattern(times: number[]): CrmVisitPattern | null {
  if (times.length < INSIGHT_MIN_VISITS) return null;
  const sorted = [...times].sort((a, b) => a - b);
  const first = sorted[0];
  const spanMonths = Math.max(
    1,
    (Date.now() - first) / (30.44 * DAY_MS)
  );
  const avgMonthly = Math.round((times.length / spanMonths) * 10) / 10;

  const hourHits = HOUR_BUCKETS.map((b) => ({ ...b, n: 0 }));
  const dayHits = WEEKDAY_FA.map((label) => ({ label, n: 0 }));
  times.forEach((ts) => {
    const d = new Date(ts);
    const h = d.getHours();
    const bucket =
      hourHits.find((b) => h >= b.start && h < b.end) || hourHits[hourHits.length - 1];
    bucket.n += 1;
    const di = jalaliWeekdayIndex(d);
    if (dayHits[di]) dayHits[di].n += 1;
  });
  hourHits.sort((a, b) => b.n - a.n);
  const usualHours = hourHits[0].n > 0 ? hourHits[0].label : "";
  const busyDays = dayHits
    .filter((d) => d.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((d) => d.label);
  if (!usualHours && !busyDays.length) return null;
  return { avgMonthly, usualHours, busyDays };
}

export function isAtRisk(profile: CrmProfile, now = Date.now()): boolean {
  const visitTimes = (profile.visitTimes || [])
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (visitTimes.length < AT_RISK_MIN_VISITS) return false;
  const last = visitTimes[visitTimes.length - 1];
  const gaps: number[] = [];
  for (let i = 1; i < visitTimes.length; i += 1) {
    gaps.push(visitTimes[i] - visitTimes[i - 1]);
  }
  const avgGap = gaps.reduce((s, n) => s + n, 0) / gaps.length;
  const lastGap = now - last;
  const threshold = Math.max(
    avgGap * AT_RISK_INTERVAL_MULT,
    avgGap + AT_RISK_EXTRA_DAYS * DAY_MS,
    AT_RISK_MIN_GAP_DAYS * DAY_MS
  );
  return lastGap > threshold;
}

export function buildCrmProfiles(
  customers: Customer[],
  invoices: Invoice[],
  orders: Order[] = []
): CrmProfile[] {
  const monthStart = startOfJalaliMonthMs();
  return activeCustomers(customers).map((customer) => {
    const relatedInvoices = invoices
      .filter((inv) => invoiceIsPurchase(inv) && matchesCustomerRecord(inv, customer))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const relatedOrders = orders
      .filter((order) => orderIsCountable(order) && matchesCustomerRecord(order, customer))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    const spend = relatedInvoices.reduce(
      (sum, inv) => sum + Number(inv.total || 0),
      0
    );
    const visits = relatedInvoices.length;
    const lastInvoiceAt = relatedInvoices[0]?.createdAt
      ? Number(relatedInvoices[0].createdAt)
      : 0;
    const lastOpenOrderAt = relatedOrders
      .filter((o) => o.status !== "invoiced")
      .reduce((max, o) => Math.max(max, Number(o.createdAt || 0)), 0);
    const lastVisitAt = Math.max(lastInvoiceAt, lastOpenOrderAt) || null;
    const monthSpend = relatedInvoices
      .filter((inv) => Number(inv.createdAt || 0) >= monthStart)
      .reduce((sum, inv) => sum + Number(inv.total || 0), 0);

    const recentByKey = new Map<string, CrmRecentVisit>();
    relatedInvoices.forEach((inv) => {
      const createdAt = Number(inv.createdAt || 0);
      const row: CrmRecentVisit = {
        key: `inv-${inv.id}`,
        kind: "invoice",
        invoiceId: inv.id,
        orderId: inv.orderId,
        number: inv.number != null ? String(inv.number) : undefined,
        table: inv.table,
        total: Number(inv.total || 0),
        status: String(inv.status || "paid"),
        createdAt,
      };
      recentByKey.set(inv.orderId ? `ord-${inv.orderId}` : row.key, row);
    });
    relatedOrders.forEach((order) => {
      const key = `ord-${order.id}`;
      if (recentByKey.has(key)) return;
      recentByKey.set(key, {
        key,
        kind: "order",
        orderId: order.id,
        invoiceId: order.invoiceId,
        table: order.table,
        total: Number(order.total || 0),
        status: String(order.status || "waiting"),
        createdAt: Number(order.createdAt || 0),
      });
    });
    const recentVisits = [...recentByKey.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 12);

    const visitTimes = relatedInvoices
      .map((inv) => Number(inv.createdAt || 0))
      .filter((n) => n > 0);

    return {
      ...customer,
      tier: normalizeTier(customer.tier),
      tags: normalizeTags(customer.tags),
      visits,
      orderCount: relatedOrders.length,
      spend,
      avgTicket: visits ? Math.round(spend / visits) : 0,
      lastVisitAt,
      monthSpend,
      favorites: collectFavorites(relatedInvoices, relatedOrders),
      recentVisits,
      visitTimes,
      invoices: relatedInvoices.slice(0, 12),
      visitPattern: buildVisitPattern(visitTimes),
    };
  });
}

export function isBirthdaySoon(iso?: string, withinDays = 14): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [, mo, d] = iso.split("-").map(Number);
  const now = new Date();
  const year = now.getFullYear();
  let next = new Date(year, mo - 1, d);
  const today = new Date(year, now.getMonth(), now.getDate());
  if (next < today) next = new Date(year + 1, mo - 1, d);
  const diff = (next.getTime() - today.getTime()) / DAY_MS;
  return diff >= 0 && diff <= withinDays;
}

/** Regulars who haven’t been visited or contacted recently. */
export function needsFollowUp(profile: CrmProfile, now = Date.now()): boolean {
  if (!profile.phone && profile.visits === 0) return false;
  const lastTouch = Math.max(profile.lastContactAt || 0, profile.lastVisitAt || 0);
  if (!lastTouch) return true;
  return now - lastTouch > 45 * DAY_MS;
}

export function filterCrmProfiles(
  profiles: CrmProfile[],
  segment: CrmSegment,
  query: string
): CrmProfile[] {
  const needle = query.trim().toLowerCase();
  const now = Date.now();
  let rows = profiles;

  switch (segment) {
    case "vip":
      rows = rows.filter((p) => p.tier === "vip");
      break;
    case "gold":
      rows = rows.filter((p) => p.tier === "gold" || p.tier === "vip");
      break;
    case "active":
      rows = rows.filter(
        (p) => p.lastVisitAt && now - p.lastVisitAt <= 30 * DAY_MS
      );
      break;
    case "inactive":
      rows = rows.filter(
        (p) => !p.lastVisitAt || now - p.lastVisitAt > 60 * DAY_MS
      );
      break;
    case "birthday":
      rows = rows.filter((p) => isBirthdaySoon(p.birthday));
      break;
    case "followup":
      rows = rows.filter((p) => needsFollowUp(p, now));
      break;
    case "atrisk":
      rows = rows.filter((p) => isAtRisk(p, now));
      break;
    case "top":
      rows = [...rows].sort((a, b) => b.spend - a.spend).slice(0, 20);
      break;
    default:
      break;
  }

  if (!needle) return rows;
  return rows.filter((p) => {
    const hay = `${p.name} ${p.phone || ""} ${p.notes || ""} ${(p.tags || []).join(" ")} ${customerTierLabel(p.tier)}`.toLowerCase();
    return hay.includes(needle);
  });
}

export function crmKpis(profiles: CrmProfile[]) {
  const now = Date.now();
  const monthStart = startOfJalaliMonthMs(now);
  const active = profiles.filter(
    (p) => p.lastVisitAt && now - p.lastVisitAt <= 30 * DAY_MS
  ).length;
  const vip = profiles.filter((p) => p.tier === "vip").length;
  const birthday = profiles.filter((p) => isBirthdaySoon(p.birthday)).length;
  const followup = profiles.filter((p) => needsFollowUp(p, now)).length;
  const atRisk = profiles.filter((p) => isAtRisk(p, now)).length;
  const newThisMonth = profiles.filter(
    (p) => Number(p.createdAt || 0) >= monthStart
  ).length;
  const returning = profiles.filter((p) => p.visits >= 2).length;
  const withSpend = profiles.filter((p) => p.spend > 0);
  const avgSpend = withSpend.length
    ? Math.round(
        withSpend.reduce((sum, p) => sum + p.spend, 0) / withSpend.length
      )
    : 0;
  const revenue = profiles.reduce((sum, p) => sum + p.spend, 0);
  return {
    total: profiles.length,
    active,
    vip,
    birthday,
    followup,
    atRisk,
    newThisMonth,
    returning,
    avgSpend,
    revenue,
  };
}

export function findCustomerForOrder(
  customers: Customer[],
  order?: Order | null,
  invoices: Invoice[] = []
): Customer | null {
  if (!order) return null;
  const live = activeCustomers(customers);
  const byId = String(order.customerId || "").trim();
  if (byId) {
    const hit = live.find((c) => c.id === byId);
    if (hit) return hit;
  }
  const name = String(order.customerName || "").trim();
  const phone = String(order.customerPhone || "").trim();
  if (phone) {
    const hit = live.find((c) => String(c.phone || "").trim() === phone);
    if (hit) return hit;
  }
  if (name) {
    const hit = live.find((c) => String(c.name || "").trim() === name);
    if (hit) return hit;
  }
  if (order.invoiceId) {
    const inv = invoices.find((i) => i.id === order.invoiceId);
    if (inv) {
      const linked = live.find((c) => matchesCustomerRecord(inv, c));
      if (linked) return linked;
    }
  }
  return null;
}

/** Invoice customers missing from the CRM registry */
export function suggestCrmImports(
  customers: Customer[],
  invoices: Invoice[]
): Array<{ name: string; phone: string; visits: number; spend: number }> {
  const live = activeCustomers(customers);
  const knownNames = new Set(
    live.map((c) => String(c.name || "").trim().toLowerCase()).filter(Boolean)
  );
  const knownPhones = new Set(
    live.map((c) => String(c.phone || "").trim()).filter(Boolean)
  );
  const knownIds = new Set(live.map((c) => c.id));
  const map = new Map<
    string,
    { name: string; phone: string; visits: number; spend: number }
  >();

  for (const inv of invoices) {
    if (!invoiceIsPurchase(inv)) continue;
    const cid = String(inv.customerId || "").trim();
    if (cid && knownIds.has(cid)) continue;
    const name = String(inv.customerName || "").trim();
    const phone = String(inv.customerPhone || "").trim();
    if (!name && !phone) continue;
    if (name && knownNames.has(name.toLowerCase())) continue;
    if (phone && knownPhones.has(phone)) continue;
    const key = `${name.toLowerCase()}|${phone}`;
    const cur = map.get(key) || { name, phone, visits: 0, spend: 0 };
    cur.visits += 1;
    cur.spend += Number(inv.total || 0);
    map.set(key, cur);
  }

  return [...map.values()]
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 8);
}
