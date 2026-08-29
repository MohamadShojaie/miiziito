export type HardwareDeviceType =
  | "waiter_pager"
  | "kitchen_printer"
  | "bar_printer"
  | "receipt_printer"
  | "kds"
  | "other";

export type HardwareConnection =
  | "network"
  | "usb"
  | "bluetooth"
  | "serial"
  | "cloud";

export type HardwareStation =
  | "waiter"
  | "kitchen"
  | "bar"
  | "cashier"
  | "general";

export type HardwareDevice = {
  id: string;
  name: string;
  type: HardwareDeviceType;
  station: HardwareStation;
  connection: HardwareConnection;
  address: string;
  port: string;
  paperWidth: "" | "58" | "80";
  copies: number;
  enabled: boolean;
  notes: string;
  isDefault?: boolean;
  codePage?: string;
  manufacturer?: string;
  model?: string;
  vendorId?: string;
  productId?: string;
  cupsQueue?: string;
  createdAt: number;
  updatedAt: number;
};

export const HARDWARE_TYPE_OPTIONS: Array<{
  id: HardwareDeviceType;
  title: string;
  description: string;
}> = [
  {
    id: "waiter_pager",
    title: "پیجر گارسون",
    description: "پیجر فیزیکی برای صدا زدن گارسون",
  },
  {
    id: "kitchen_printer",
    title: "پرینتر آشپزخانه",
    description: "چاپ سفارش‌های بخش آشپزخانه",
  },
  {
    id: "bar_printer",
    title: "پرینتر بار",
    description: "چاپ سفارش‌های نوشیدنی و بار",
  },
  {
    id: "receipt_printer",
    title: "پرینتر فاکتور",
    description: "چاپ رسید صندوق / مشتری",
  },
  {
    id: "kds",
    title: "نمایشگر سفارش (KDS)",
    description: "صفحه نمایش آشپزخانه یا بار",
  },
  {
    id: "other",
    title: "سایر دستگاه‌ها",
    description: "اسکنر، کشوی پول، و سایر سخت‌افزار",
  },
];

export const HARDWARE_STATION_OPTIONS: Array<{
  id: HardwareStation;
  title: string;
}> = [
  { id: "waiter", title: "گارسون" },
  { id: "kitchen", title: "آشپزخانه" },
  { id: "bar", title: "بار" },
  { id: "cashier", title: "صندوق" },
  { id: "general", title: "عمومی" },
];

export const HARDWARE_CONNECTION_OPTIONS: Array<{
  id: HardwareConnection;
  title: string;
}> = [
  { id: "network", title: "شبکه (IP)" },
  { id: "usb", title: "USB" },
  { id: "bluetooth", title: "بلوتوث" },
  { id: "serial", title: "سریال" },
  { id: "cloud", title: "ابری / سرویس" },
];

export function hardwareTypeLabel(type: HardwareDeviceType): string {
  return HARDWARE_TYPE_OPTIONS.find((o) => o.id === type)?.title || type;
}

export function hardwareStationLabel(station: HardwareStation): string {
  return HARDWARE_STATION_OPTIONS.find((o) => o.id === station)?.title || station;
}

export function hardwareConnectionLabel(connection: HardwareConnection): string {
  return (
    HARDWARE_CONNECTION_OPTIONS.find((o) => o.id === connection)?.title ||
    connection
  );
}

export function defaultStationForType(
  type: HardwareDeviceType
): HardwareStation {
  switch (type) {
    case "waiter_pager":
      return "waiter";
    case "kitchen_printer":
    case "kds":
      return "kitchen";
    case "bar_printer":
      return "bar";
    case "receipt_printer":
      return "cashier";
    default:
      return "general";
  }
}

export function normalizeHardwareDevice(
  raw?: Partial<HardwareDevice> | null
): HardwareDevice {
  const now = Date.now();
  const type = (
    HARDWARE_TYPE_OPTIONS.some((o) => o.id === raw?.type)
      ? raw?.type
      : "other"
  ) as HardwareDeviceType;
  const station = (
    HARDWARE_STATION_OPTIONS.some((o) => o.id === raw?.station)
      ? raw?.station
      : defaultStationForType(type)
  ) as HardwareStation;
  const connection = (
    HARDWARE_CONNECTION_OPTIONS.some((o) => o.id === raw?.connection)
      ? raw?.connection
      : "network"
  ) as HardwareConnection;
  const paper =
    raw?.paperWidth === "58" || raw?.paperWidth === "80" ? raw.paperWidth : "";
  const copies = Math.max(
    1,
    Math.min(9, Number(raw?.copies) > 0 ? Number(raw?.copies) : 1)
  );
  const id = String(raw?.id || "").trim() || `hw_${now.toString(36)}`;

  return {
    id,
    name: String(raw?.name || "").trim().slice(0, 80) || "دستگاه بدون نام",
    type,
    station,
    connection,
    address: String(raw?.address || "").trim().slice(0, 120),
    port: String(raw?.port || "").trim().slice(0, 20),
    paperWidth: paper,
    copies,
    enabled: raw?.enabled !== false,
    notes: String(raw?.notes || "").trim().slice(0, 240),
    isDefault: Boolean(raw?.isDefault),
    codePage: String(raw?.codePage || "utf8").trim().slice(0, 24) || "utf8",
    manufacturer: String(raw?.manufacturer || "").trim().slice(0, 80),
    model: String(raw?.model || "").trim().slice(0, 80),
    vendorId: String(raw?.vendorId || "").trim().slice(0, 16),
    productId: String(raw?.productId || "").trim().slice(0, 16),
    cupsQueue: String(raw?.cupsQueue || "").trim().slice(0, 80),
    createdAt:
      typeof raw?.createdAt === "number" && raw.createdAt > 0
        ? raw.createdAt
        : now,
    updatedAt:
      typeof raw?.updatedAt === "number" && raw.updatedAt > 0
        ? raw.updatedAt
        : now,
  };
}
