import type { HardwareDevice } from "@/lib/hardware";
import type { Order, OrderItem } from "@/lib/types";
import { gregorianToJalali } from "@/lib/jalali";
import {
  buildCustomerCategories,
  inferStationFromName,
  type MenuOverrides,
  type PrintStationKind,
} from "@/lib/menu-utils";
import type { ReceiptData } from "@/lib/printer";
import {
  DEFAULT_SITE_SETTINGS,
  mergeSiteSettings,
  type SiteSettings,
} from "@/lib/settings";
import { DEFAULT_CAFE_NAME_EN } from "@/lib/brand";

export type PrintStation = PrintStationKind;

export type RoutedItem = OrderItem & {
  station: PrintStation;
  categoryName?: string;
};

function normalizeName(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

export function stationForCategoryName(categoryName: string): PrintStation {
  return inferStationFromName(categoryName);
}

export function stationForItemName(itemName: string): PrintStation {
  return inferStationFromName(String(itemName || ""));
}

/** Build name/id → station lookup from menu overrides (or default menu). */
export function buildStationLookup(
  overrides?: MenuOverrides | null
): Map<string, { station: PrintStation; categoryName: string }> {
  const map = new Map<string, { station: PrintStation; categoryName: string }>();
  const cats = buildCustomerCategories(overrides || null);
  for (const cat of cats) {
    const station = cat.station;
    for (const item of cat.items) {
      const entry = { station, categoryName: cat.name };
      if (item.id) map.set(normalizeName(item.id), entry);
      map.set(normalizeName(item.name), entry);
    }
  }
  return map;
}

export function routeOrderItems(
  order: Order,
  lookup?: Map<string, { station: PrintStation; categoryName: string }>
): { kitchen: RoutedItem[]; bar: RoutedItem[]; all: RoutedItem[] } {
  const map = lookup || buildStationLookup();
  const all: RoutedItem[] = (order.items || []).map((item) => {
    const byId = item.id ? map.get(normalizeName(item.id)) : undefined;
    const byName = map.get(normalizeName(item.name));
    const hit = byId || byName;
    const station =
      hit?.station || stationForItemName(String(item.name || ""));
    return {
      ...item,
      station,
      categoryName: hit?.categoryName,
    };
  });
  return {
    all,
    kitchen: all.filter((i) => i.station === "kitchen"),
    bar: all.filter((i) => i.station === "bar"),
  };
}

export function pickStationPrinter(
  devices: HardwareDevice[],
  station: PrintStation
): HardwareDevice | null {
  const type = station === "bar" ? "bar_printer" : "kitchen_printer";
  const enabled = devices.filter((d) => d.enabled && d.type === type);
  return enabled[0] || null;
}

export function stationTicketReceipt(
  order: Order,
  items: OrderItem[],
  station: PrintStation,
  settings: Partial<SiteSettings> | string = DEFAULT_SITE_SETTINGS
): ReceiptData {
  const site =
    typeof settings === "string"
      ? mergeSiteSettings({ restaurantNameEn: settings })
      : mergeSiteSettings(settings);
  const label = station === "bar" ? "بار" : "آشپزخانه";
  const created = order.createdAt ? new Date(order.createdAt) : new Date();
  const { jy, jm, jd } = gregorianToJalali(created);
  const dateJalali = `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
  const time = [
    String(created.getHours()).padStart(2, "0"),
    String(created.getMinutes()).padStart(2, "0"),
  ].join(":");
  const table =
    order.table != null && String(order.table) !== ""
      ? String(order.table)
      : "";
  return {
    mode: "station",
    station,
    storeName: site.restaurantNameEn || DEFAULT_CAFE_NAME_EN,
    storeNameEn: site.restaurantNameEn || DEFAULT_CAFE_NAME_EN,
    storeNameFa: site.restaurantNameFa || "",
    subtitle: label,
    receiptNumber: order.id,
    datetime: `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")} ${time}`,
    dateJalali,
    time,
    table,
    location: table ? `میز ${table}` : "",
    customer: [order.customerName, order.customerPhone]
      .filter(Boolean)
      .join(" · "),
    showPrices: false,
    items: items.map((it) => ({
      name: String(it.name || "آیتم"),
      qty: Number(it.count || 1),
      // Never send money fields to kitchen/bar printers
      toppings: (it.toppings || []).map((t) =>
        typeof t === "string" ? t : { name: t.name }
      ),
    })),
    footer: "سفارش جدید",
    paperWidth: "80",
    codePage: "utf8",
  };
}
