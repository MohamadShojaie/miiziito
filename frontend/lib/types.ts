export type OrderStatus =
  | "waiting"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled"
  | "invoiced"
  | "given";

export type Topping = { name: string; price: number };

export type MenuItem = {
  id?: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  toppings?: Topping[];
  soldOut?: boolean;
  isNew?: boolean;
  newAt?: number;
  createdAt?: number;
};

export type MenuCategory = {
  name: string;
  items: MenuItem[];
  icon?: string;
  hidden?: boolean;
};

export type MenuData = { categories: MenuCategory[] };

export type CartLine = {
  key: string;
  id: string;
  name: string;
  unit: number;
  count: number;
  toppings?: Topping[];
};

export type OrderItem = {
  id?: string;
  name: string;
  price: number | string;
  count: number;
  toppings?: Array<Topping | string>;
};

export type Order = {
  id: string;
  type?: "food" | "waiter";
  table: string | number;
  status: OrderStatus;
  items?: OrderItem[];
  total?: number;
  createdAt?: number;
  updatedAt?: number;
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string;
  batches?: Array<{
    createdAt?: number;
    items?: OrderItem[];
    total?: number;
    edit?: boolean;
  }>;
  calls?: Array<{ createdAt?: number }>;
  history?: Array<{ at?: number; action?: string; status?: string }>;
  invoiceId?: string;
};

export type Invoice = {
  id: string;
  number?: number | string;
  orderId?: string;
  table?: string | number;
  total?: number;
  subtotal?: number;
  tax?: number;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  status?: string;
  payMethod?: string;
  createdAt?: number;
  updatedAt?: number;
  cashierName?: string;
  cashier?: string;
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string;
  items?: Array<{
    name?: string;
    price?: number;
    count?: number;
    line?: number;
  }>;
  payments?: Array<{
    method?: string;
    amount?: number;
    paymentId?: string;
    referenceNumber?: string;
    terminalId?: string;
    providerTransactionId?: string;
  }>;
  refunds?: Array<{ amount?: number }>;
  splitIndex?: number;
  splitCount?: number;
};

export type CustomerTier = "standard" | "silver" | "gold" | "vip";

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  birthday?: string;
  notes?: string;
  tier?: CustomerTier;
  tags?: string[];
  lastContactAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number | null;
};

export type Coupon = {
  id: string;
  code: string;
  label?: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  active: boolean;
  expiresAt?: number | null;
  usageLimit?: number | null;
  usedCount?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type ReservationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "seated";

export type Reservation = {
  id: string;
  table: string | number;
  name: string;
  phone: string;
  guests?: number;
  /** ISO date YYYY-MM-DD for the reservation day */
  date?: string;
  /** Local time HH:mm */
  time?: string;
  /** Epoch ms for date+time */
  reservedAt?: number;
  status: ReservationStatus;
  createdAt?: number;
  updatedAt?: number;
};

export type TableRegion = {
  id: string;
  name: string;
  tables: number[];
};

export type TablesPayload = {
  tables?: Record<string, string>;
  regions?: TableRegion[];
  orders?: Order[];
  order?: Order;
  invoices?: Invoice[];
  invoice?: Invoice;
  reservations?: Reservation[];
  reservation?: Reservation;
  summary?: Record<string, unknown>;
  since?: number;
};

export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  pending: "در انتظار",
  accepted: "تأیید شده",
  rejected: "رد شده",
  cancelled: "لغو شده",
  seated: "نشسته‌اند",
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  waiting: "جدید",
  preparing: "در حال آماده‌سازی",
  ready: "آماده",
  delivered: "تحویل شد",
  cancelled: "لغو شده",
  invoiced: "فاکتور شده",
  given: "در حال آماده‌سازی",
};

export const PAY_METHOD_LABEL: Record<string, string> = {
  cash: "نقدی",
  card: "کارت",
  online: "آنلاین",
  mixed: "ترکیبی",
};

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  paid: "پرداخت‌شده",
  unpaid: "پرداخت‌نشده",
  cancelled: "لغوشده",
  refunded: "برگشت وجه",
  partially_refunded: "برگشت جزئی",
};

export const DEFAULT_TABLE_REGIONS: TableRegion[] = [
  { id: "green", name: "اتاق سبز", tables: [1, 2, 3, 4] },
  { id: "blue", name: "اتاق آبی", tables: [6, 7, 8, 9, 10, 11] },
  { id: "yard-up", name: "حیاط بالا", tables: [12, 13, 14, 15, 16, 17, 18, 19, 20] },
  { id: "yard-down", name: "حیاط پایین", tables: [21, 22, 23, 24, 25] },
];

/** Flatten region layout into sorted unique table numbers. */
export function tablesFromRegions(
  regions?: TableRegion[] | null
): number[] {
  const source = regions && regions.length ? regions : [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const region of source) {
    for (const raw of region.tables || []) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
  }
  return out.sort((a, b) => a - b);
}
