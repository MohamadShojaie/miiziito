import { apiJson, cashierHeaders } from "@/lib/api";
import type { HardwareDevice } from "@/lib/hardware";
import type { Invoice } from "@/lib/types";
import { PAY_METHOD_LABEL } from "@/lib/types";
import { formatPriceAsNumber, toPersianDigits } from "@/lib/format";
import { gregorianToJalali } from "@/lib/jalali";
import {
  DEFAULT_SITE_SETTINGS,
  mergeSiteSettings,
  type SiteSettings,
} from "@/lib/settings";
import { assetUrl } from "@/lib/menu-utils";
import { DEFAULT_CAFE_NAME_EN } from "@/lib/brand";

export type PrinterConnectionType = "network" | "bluetooth" | "usb";

export type DiscoveredPrinter = {
  id: string;
  name: string;
  hostname?: string;
  address: string;
  port?: string;
  connection: PrinterConnectionType;
  status?: string;
  likelyThermal?: boolean;
  manufacturer?: string;
  model?: string;
  vendorId?: string;
  productId?: string;
  serial?: string;
  cupsQueue?: string;
};

export type PrinterCapabilities = {
  network: boolean;
  bluetooth: boolean;
  usb: boolean;
  platform?: string;
  rfcomm?: boolean;
  cups?: boolean;
};

export type ReceiptItem = {
  name: string;
  qty?: number;
  count?: number;
  unitPrice?: number;
  price?: number;
  amount?: number;
  line?: number;
  discount?: number;
  notes?: string;
  toppings?: Array<string | { name?: string; price?: number }>;
};

export type ReceiptData = {
  mode?: "receipt" | "station" | "kitchen" | "bar" | "ticket";
  station?: "kitchen" | "bar" | string;
  storeName?: string;
  storeNameFa?: string;
  storeNameEn?: string;
  subtitle?: string;
  receiptNumber?: string | number;
  datetime?: string;
  dateJalali?: string;
  time?: string;
  table?: string | number;
  location?: string;
  customer?: string;
  phone?: string;
  address?: string;
  currency?: string;
  items?: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  payment?: string;
  footer?: string;
  showPrices?: boolean;
  paperWidth?: "58" | "80" | string;
  codePage?: string;
  feed?: number;
  cut?: boolean;
};

export type PrintResult = {
  ok: boolean;
  error?: string;
  message?: string;
  type?: string;
  bytes?: number;
  ms?: number;
  printer?: {
    id?: string;
    name?: string;
    connection?: string;
    address?: string;
  };
};

export type DiscoverResult = {
  ok: boolean;
  type?: string;
  localIp?: string;
  subnet?: string;
  scanned?: number;
  printers?: DiscoveredPrinter[];
  message?: string;
  capabilities?: PrinterCapabilities;
};

export async function getPrinterCapabilities() {
  return apiJson<{ ok?: boolean; capabilities?: PrinterCapabilities }>(
    "/api/printers",
    { headers: cashierHeaders() }
  );
}

export async function discoverPrinters(
  type: PrinterConnectionType,
  port = 9100
) {
  return apiJson<DiscoverResult>("/api/printers", {
    method: "POST",
    headers: cashierHeaders(),
    body: JSON.stringify({ action: "discover", type, port }),
  });
}

export async function testPrinter(
  printer: Partial<HardwareDevice> | DiscoveredPrinter,
  printerId?: string
) {
  return apiJson<PrintResult>("/api/printers", {
    method: "POST",
    headers: cashierHeaders(),
    body: JSON.stringify({
      action: "test",
      printerId,
      printer,
    }),
  });
}

export async function printReceipt(
  receipt: ReceiptData,
  opts?: {
    printerId?: string;
    printer?: Partial<HardwareDevice>;
    copies?: number;
    /** Pre-built ESC/POS job (e.g. image-chunk raster). Skips text layout. */
    bytesBase64?: string;
  }
) {
  return apiJson<PrintResult>("/api/printers", {
    method: "POST",
    headers: cashierHeaders(),
    body: JSON.stringify({
      action: "print",
      printerId: opts?.printerId,
      printer: opts?.printer,
      copies: opts?.copies,
      receipt: opts?.bytesBase64 ? undefined : receipt,
      bytesBase64: opts?.bytesBase64,
    }),
  });
}

export function discoveredToHardwareDraft(
  found: DiscoveredPrinter,
  type: HardwareDevice["type"] = "receipt_printer"
): Partial<HardwareDevice> {
  return {
    name: found.name || "Thermal Printer",
    type,
    station:
      type === "kitchen_printer"
        ? "kitchen"
        : type === "bar_printer"
          ? "bar"
          : "cashier",
    connection: found.connection,
    address: found.address || found.cupsQueue || "",
    port:
      found.connection === "network"
        ? found.port || "9100"
        : found.connection === "bluetooth"
          ? found.port || "1"
          : "",
    paperWidth: "80",
    copies: 1,
    enabled: true,
    isDefault: type === "receipt_printer",
    codePage: "utf8",
    manufacturer: found.manufacturer || "",
    model: found.model || "",
    vendorId: found.vendorId || "",
    productId: found.productId || "",
    cupsQueue: found.cupsQueue || "",
    notes: "",
  };
}

export function invoiceToReceipt(
  inv: Invoice,
  settings: Partial<SiteSettings> | string = DEFAULT_SITE_SETTINGS
): ReceiptData {
  const site =
    typeof settings === "string"
      ? { ...DEFAULT_SITE_SETTINGS, restaurantNameEn: settings }
      : { ...DEFAULT_SITE_SETTINGS, ...settings };
  const items = (inv.items || []).map((it) => ({
    name: String(it.name || "آیتم"),
    qty: Number(it.count || 1),
    unitPrice: Number(it.price || 0),
    amount:
      it.line != null
        ? Number(it.line)
        : Number(it.price || 0) * Number(it.count || 1),
  }));
  const created = inv.createdAt ? new Date(inv.createdAt) : new Date();
  const { jy, jm, jd } = gregorianToJalali(created);
  const dateJalali = `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
  const time = [
    String(created.getHours()).padStart(2, "0"),
    String(created.getMinutes()).padStart(2, "0"),
    String(created.getSeconds()).padStart(2, "0"),
  ].join(":");
  const table = inv.table != null && String(inv.table) !== "" ? String(inv.table) : "";
  const payKey = String(inv.payMethod || "");
  return {
    storeName: site.restaurantNameEn || DEFAULT_CAFE_NAME_EN,
    storeNameEn: site.restaurantNameEn || DEFAULT_CAFE_NAME_EN,
    storeNameFa: site.restaurantNameFa || "",
    receiptNumber: inv.number ?? inv.id,
    datetime: `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")} ${time}`,
    dateJalali,
    time,
    table,
    location: table ? `میز ${table}` : "",
    customer: [inv.customerName, inv.customerPhone].filter(Boolean).join(" · "),
    phone: site.phone || "",
    address: site.address || "",
    currency: "تومان",
    items,
    subtotal: inv.subtotal,
    tax: inv.tax,
    discount: inv.discountAmount,
    total: inv.total,
    payment: PAY_METHOD_LABEL[payKey] || payKey,
    footer:
      String(site.receiptFooterMessage || "").trim() || "به امید دیدار مجدد",
    paperWidth: "80",
    codePage: "utf8",
  };
}

export function invoicePrintHtml(inv: Invoice, settings?: Partial<SiteSettings>) {
  const site = mergeSiteSettings(settings);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const receipt = invoiceToReceipt(inv, site);
  const logoPath =
    site.showLogoOnReceipt && site.logo ? assetUrl(site.logo) : "";
  const logoAbs = !logoPath
    ? ""
    : logoPath.startsWith("http") || logoPath.startsWith("data:")
      ? logoPath
      : `${origin}${logoPath.startsWith("/") ? logoPath : `/${logoPath}`}`;
  const logoHtml = logoAbs
    ? `<div class="logo-wrap"><img class="logo" src="${logoAbs}" alt=""/></div>`
    : "";
  const rows = (inv.items || [])
    .map((it) => {
      const qty = Number(it.count || 1);
      const unit = Number(it.price || 0);
      const line =
        it.line != null ? Number(it.line) : unit * qty;
      return `<tr>
        <td class="name">${it.name || "—"}</td>
        <td>${formatPriceAsNumber(unit)}</td>
        <td>${toPersianDigits(qty)}</td>
        <td>${formatPriceAsNumber(line)}</td>
      </tr>`;
    })
    .join("");
  const phone =
    site.showContactOnReceipt && site.phone
      ? `<div class="foot-line">تلفن: ${toPersianDigits(site.phone)}</div>`
      : "";
  const address =
    site.showContactOnReceipt && site.address
      ? `<div class="foot-line">${site.address}</div>`
      : "";
  const footerMsg =
    String(site.receiptFooterMessage || "").trim() || "به امید دیدار مجدد";
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"/>
<title>فاکتور ${toPersianDigits(String(receipt.receiptNumber || ""))}</title>
<style>
  @font-face {
    font-family: "Vazir";
    src: url("${origin}/assets/fonts/Vazir.woff2") format("woff2"),
         url("${origin}/assets/fonts/Vazir.woff") format("woff"),
         url("${origin}/assets/fonts/Vazir.ttf") format("truetype");
    font-weight: 400;
    font-style: normal;
    font-display: block;
  }
  @font-face {
    font-family: "Vazir";
    src: url("${origin}/assets/fonts/Vazir-Bold.woff2") format("woff2"),
         url("${origin}/assets/fonts/Vazir-Bold.woff") format("woff"),
         url("${origin}/assets/fonts/Vazir-Bold.ttf") format("truetype");
    font-weight: 700;
    font-style: normal;
    font-display: block;
  }
  @font-face {
    font-family: "IRANYekanX";
    src: url("${origin}/assets/fonts/IRANYekanX_Regular.ttf") format("truetype");
    font-weight: 400;
    font-style: normal;
    font-display: block;
  }
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Vazir", "IRANYekanX", Tahoma, sans-serif;
    width: 72mm;
    margin: 0 auto;
    color: #111;
    font-size: 12.5px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .logo-wrap {
    text-align: center;
    margin: 0 0 8px;
  }
  .logo {
    max-width: 42%;
    max-height: 28mm;
    width: auto;
    height: auto;
    object-fit: contain;
  }
  .head {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: stretch;
    gap: 4px;
    margin-bottom: 8px;
  }
  .box {
    border: 1.5px solid #111;
    padding: 5px 6px;
    text-align: center;
    font-weight: 700;
    font-size: 11px;
    line-height: 1.45;
  }
  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    gap: 2px;
  }
  .brand strong {
    font-size: 18px;
    letter-spacing: 0.06em;
    font-family: Arial, Helvetica, sans-serif;
    font-weight: 800;
  }
  .brand em {
    font-style: normal;
    font-size: 13px;
    font-weight: 700;
    font-family: "Vazir", "IRANYekanX", Tahoma, sans-serif;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    border-top: 1px solid #111;
    border-bottom: 1px solid #111;
    padding: 7px 0;
    margin-bottom: 7px;
    font-size: 12px;
    font-weight: 600;
  }
  table { width: 100%; border-collapse: collapse; }
  th {
    background: #111;
    color: #fff;
    font-weight: 700;
    padding: 6px 3px;
    font-size: 11.5px;
    font-family: "Vazir", "IRANYekanX", Tahoma, sans-serif;
  }
  td {
    padding: 6px 3px;
    border-bottom: 1px solid #ddd;
    vertical-align: top;
    font-size: 12.5px;
  }
  td.name {
    text-align: right;
    font-weight: 700;
    font-family: "Vazir", "IRANYekanX", Tahoma, sans-serif;
  }
  td:not(.name), th:not(.name) {
    text-align: left;
    font-variant-numeric: tabular-nums;
    direction: ltr;
  }
  .sums { margin-top: 8px; font-size: 12.5px; }
  .sums div {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    font-weight: 600;
  }
  .pay {
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-weight: 700;
    font-size: 13px;
  }
  .pay b {
    background: #111;
    color: #fff;
    padding: 6px 8px;
    min-width: 42%;
    text-align: center;
    font-size: 13px;
    font-family: "Vazir", "IRANYekanX", Tahoma, sans-serif;
  }
  .foot {
    text-align: center;
    margin-top: 12px;
    border-top: 1px solid #111;
    padding-top: 10px;
    font-weight: 700;
    font-size: 13px;
  }
  .foot-line {
    margin-top: 4px;
    font-size: 11.5px;
    font-weight: 600;
  }
</style></head><body>
  ${logoHtml}
  <div class="head">
    <div class="box">شماره فاکتور<br>${toPersianDigits(String(receipt.receiptNumber || "—"))}</div>
    <div class="brand">
      <strong>${site.restaurantNameEn || DEFAULT_CAFE_NAME_EN}</strong>
      ${site.restaurantNameFa ? `<em>${site.restaurantNameFa}</em>` : ""}
    </div>
    <div class="box">${toPersianDigits(receipt.time || "")}<br>${toPersianDigits(receipt.dateJalali || "")}</div>
  </div>
  <div class="meta">
    <span>مشتری: ${receipt.customer || "—"}</span>
    <span>مکان: ${receipt.location || "—"}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th class="name">نام</th>
        <th>فی</th>
        <th>تعداد</th>
        <th>قیمت کل</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="4">—</td></tr>`}</tbody>
  </table>
  <div class="sums">
    <div><span>جمع کل</span><span>${formatPriceAsNumber(Number(inv.subtotal || 0))}</span></div>
    ${inv.discountAmount ? `<div><span>تخفیف</span><span>${formatPriceAsNumber(Number(inv.discountAmount))}</span></div>` : ""}
    ${inv.tax ? `<div><span>مالیات بر ارزش افزوده</span><span>${formatPriceAsNumber(Number(inv.tax))}</span></div>` : ""}
  </div>
  <div class="pay">
    <span>قابل پرداخت</span>
    <b>${formatPriceAsNumber(Number(inv.total || 0))} تومان</b>
  </div>
  <div class="foot">
    <div>${footerMsg}</div>
    ${site.restaurantNameFa ? `<div class="foot-line">${site.restaurantNameFa}</div>` : ""}
    ${phone}${address}
  </div>
</body></html>`;
}

/** Print HTML without a popup window (avoids browser popup blockers). */
export function printHtmlDocument(html: string): boolean {
  if (typeof document === "undefined") return false;
  const existing = document.getElementById("miiziito-print-frame");
  if (existing) existing.remove();

  const frame = document.createElement("iframe");
  frame.id = "miiziito-print-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = frame.contentDocument || win?.document;
  if (!win || !doc) {
    frame.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    try {
      frame.remove();
    } catch {
      /* ignore */
    }
  };

  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
      return;
    }
    setTimeout(cleanup, 60_000);
  };

  const waitFontsThenPrint = () => {
    const fonts = doc.fonts;
    if (fonts?.ready) {
      fonts.ready.then(() => setTimeout(runPrint, 80)).catch(() => setTimeout(runPrint, 120));
      return;
    }
    setTimeout(runPrint, 200);
  };

  if (doc.readyState === "complete") {
    waitFontsThenPrint();
  } else {
    frame.onload = () => waitFontsThenPrint();
  }
  return true;
}

export function printErrorMessage(result: PrintResult): string {
  switch (result.error) {
    case "timeout":
      return "زمان اتصال به پرینتر تمام شد";
    case "permission":
      return "مجوز دسترسی به پرینتر داده نشد";
    case "unsupported":
      return "این نوع اتصال روی این میزبان پشتیبانی نمی‌شود";
    case "disabled":
      return "پرینتر غیرفعال است";
    case "not_found":
    case "no_printer":
      return "پرینتری پیدا نشد";
    case "duplicate":
      return "این پرینتر قبلاً ذخیره شده";
    case "unavailable":
      return result.message || "پرینتر در دسترس نیست";
    case "communication_error":
      return "ارسال داده به پرینتر ناموفق بود";
    default:
      return result.message || "چاپ ناموفق بود";
  }
}

/** Local preview helper — not sent to printer. */
export function previewReceiptText(data: ReceiptData): string {
  const cols = data.paperWidth === "58" ? 32 : 48;
  const sep = (ch: string) => ch.repeat(cols);
  const col = (left: string, right: string) => {
    const space = Math.max(1, cols - left.length - right.length);
    return (left + " ".repeat(space) + right).slice(0, cols);
  };
  const lines = [
    data.storeName || "STORE",
    sep("="),
    data.receiptNumber != null ? `Receipt #${data.receiptNumber}` : "",
    data.datetime || "",
    data.table != null ? `Table ${data.table}` : "",
    sep("-"),
  ].filter(Boolean);
  for (const it of data.items || []) {
    const qty = it.qty ?? it.count ?? 1;
    const amount =
      it.amount ??
      it.line ??
      Number(it.unitPrice ?? it.price ?? 0) * Number(qty);
    lines.push(col(`${it.name} x${qty}`, formatPriceAsNumber(Number(amount))));
  }
  lines.push(sep("-"));
  if (data.subtotal != null) {
    lines.push(col("Subtotal", formatPriceAsNumber(data.subtotal)));
  }
  if (data.tax) lines.push(col("Tax", formatPriceAsNumber(data.tax)));
  if (data.total != null) {
    lines.push(col("TOTAL", formatPriceAsNumber(data.total)));
  }
  lines.push(sep("-"), data.footer || "Thank You!");
  return lines.join("\n");
}
