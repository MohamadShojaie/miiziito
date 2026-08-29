import type { Invoice, Order, OrderItem } from "@/lib/types";
import {
  mergeSiteSettings,
  type SiteSettings,
} from "@/lib/settings";
import { formatPriceAsNumber, toPersianDigits } from "@/lib/format";
import { assetUrl } from "@/lib/menu-utils";
import { DEFAULT_CAFE_NAME_EN } from "@/lib/brand";
import { invoiceToReceipt, type ReceiptData } from "@/lib/printer";
import {
  stationTicketReceipt,
  type PrintStation,
} from "@/lib/print-routing";
import {
  RECEIPT_IMAGE_WIDTH,
  canvasToEscPosJob,
  bytesToBase64,
} from "@/lib/escpos-image";

type DrawOpts = {
  width?: number;
};

function money(n: number): string {
  return formatPriceAsNumber(n);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Draw PDF-style receipt at printer width with large type.
 * Uses hard black/white (no gray) for a smaller, faster ESC/POS payload.
 */
export async function renderInvoiceReceiptCanvas(
  inv: Invoice,
  settings?: Partial<SiteSettings>,
  opts?: DrawOpts
): Promise<HTMLCanvasElement> {
  const targetW = opts?.width ?? RECEIPT_IMAGE_WIDTH;
  if (typeof document === "undefined") {
    throw new Error("receipt_render_ssr");
  }

  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }

  const site = mergeSiteSettings(settings);
  const receipt = invoiceToReceipt(inv, site);
  const items = inv.items || [];

  const logoImg =
    site.showLogoOnReceipt && site.logo
      ? await loadImage(assetUrl(site.logo))
      : null;

  // Mid scale: between previous ~1.35 and oversized ~2.15
  const scale = 1.7;
  const W = targetW;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = 8000;
  const ctx = out.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("receipt_canvas");

  // Disable smoothing — sharper 1-bit edges, less gray bleed.
  ctx.imageSmoothingEnabled = false;

  const contentH = paintReceipt(ctx, {
    width: W,
    scale,
    site,
    receipt,
    logoImg,
    items: items.map((it) => ({
      name: String(it.name || "—"),
      qty: Number(it.count || 1),
      unit: Number(it.price || 0),
      line:
        it.line != null
          ? Number(it.line)
          : Number(it.price || 0) * Number(it.count || 1),
    })),
    inv,
  });

  // Tiny pad only; paper advance is handled by the cut command.
  const bottomPad = Math.max(4, Math.round(4 * scale));
  const finalH = Math.max(1, contentH + bottomPad);
  const cropped = document.createElement("canvas");
  cropped.width = W;
  cropped.height = finalH;
  const cctx = cropped.getContext("2d", { alpha: false });
  if (!cctx) throw new Error("receipt_canvas");
  cctx.fillStyle = "#ffffff";
  cctx.fillRect(0, 0, W, finalH);
  cctx.drawImage(out, 0, 0, W, contentH, 0, 0, W, contentH);

  // Force pure B/W (no antialias gray) before ESC/POS packing.
  const imageData = cctx.getImageData(0, 0, W, finalH);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    const v = lum < 160 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  cctx.putImageData(imageData, 0, 0);
  return cropped;
}

type PaintInput = {
  width: number;
  scale: number;
  site: SiteSettings;
  receipt: ReturnType<typeof invoiceToReceipt>;
  items: Array<{ name: string; qty: number; unit: number; line: number }>;
  inv: Invoice;
  logoImg?: HTMLImageElement | null;
};

function paintReceipt(
  ctx: CanvasRenderingContext2D,
  input: PaintInput
): number {
  const { width: W, scale: s, site, receipt, items, inv, logoImg } = input;
  const pad = 8 * s;
  let y = 6 * s;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, 8000);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";
  // Page is dir=rtl; keep canvas LTR so box geometry matches the PDF layout.
  ctx.direction = "ltr";

  const fontFa = `"Vazir", "IRANYekanX", Tahoma, sans-serif`;
  const fontEn = `Arial, Helvetica, sans-serif`;

  if (logoImg && logoImg.naturalWidth > 0 && logoImg.naturalHeight > 0) {
    const maxLogoW = W * 0.42;
    const maxLogoH = 52 * s;
    const ratio = Math.min(
      maxLogoW / logoImg.naturalWidth,
      maxLogoH / logoImg.naturalHeight
    );
    const lw = Math.max(1, Math.round(logoImg.naturalWidth * ratio));
    const lh = Math.max(1, Math.round(logoImg.naturalHeight * ratio));
    const lx = Math.round((W - lw) / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(logoImg, lx, y, lw, lh);
    ctx.imageSmoothingEnabled = false;
    y += lh + 10 * s;
  }

  const timeStr = toPersianDigits(receipt.time || "");
  const dateStr = toPersianDigits(receipt.dateJalali || "");
  const invLabel = "شماره فاکتور";
  const invNo = toPersianDigits(String(receipt.receiptNumber || "—"));

  // Match downloaded RTL factor: date/time LEFT, invoice number RIGHT.
  const boxH = 58 * s;
  const maxSide = (W - pad * 2) * 0.38;
  const minSide = 118 * s;

  function measureLines(lines: string[], fontSize: number): number {
    ctx.font = `700 ${fontSize * s}px ${fontFa}`;
    let widest = 0;
    for (const line of lines) {
      widest = Math.max(widest, ctx.measureText(line).width);
    }
    return widest;
  }

  let dateFont = 13;
  let dateTextW = measureLines([timeStr, dateStr], dateFont);
  while (dateFont > 9 && dateTextW + 24 * s > maxSide) {
    dateFont -= 0.5;
    dateTextW = measureLines([timeStr, dateStr], dateFont);
  }
  const dateBoxW = Math.min(
    maxSide,
    Math.max(dateTextW + 24 * s, minSide)
  );

  let invFont = 13;
  let invTextW = measureLines([invLabel, invNo], invFont);
  while (invFont > 9 && invTextW + 24 * s > maxSide) {
    invFont -= 0.5;
    invTextW = measureLines([invLabel, invNo], invFont);
  }
  const invBoxW = Math.min(
    maxSide,
    Math.max(invTextW + 24 * s, minSide)
  );

  const brandW = Math.max(36 * s, W - dateBoxW - invBoxW - pad * 2);
  const dateBoxX = pad;
  const invBoxX = W - pad - invBoxW;

  function strokeBox(x: number, yy: number, w: number, h: number) {
    ctx.lineWidth = Math.max(2, 2.5 * s);
    ctx.strokeStyle = "#000";
    ctx.strokeRect(x + 0.5, yy + 0.5, w - 1, h - 1);
  }

  /** Geometric center — avoids RTL canvas textAlign quirks. */
  function drawCenteredInBox(
    text: string,
    boxX: number,
    boxY: number,
    w: number,
    h: number,
    fontPx: number,
    lineIndex: number,
    lineCount: number
  ) {
    ctx.save();
    ctx.direction = "ltr";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const maxW = Math.max(8, w - 14 * s);
    let px = fontPx * s;
    ctx.font = `700 ${px}px ${fontFa}`;
    let tw = ctx.measureText(text).width;
    while (tw > maxW && px > 9 * s) {
      px -= 0.5;
      ctx.font = `700 ${px}px ${fontFa}`;
      tw = ctx.measureText(text).width;
    }
    const lineGap = h / (lineCount + 1);
    const cy = boxY + lineGap * (lineIndex + 1);
    const cx = boxX + (w - Math.min(tw, maxW)) / 2;
    ctx.fillText(text, cx, cy, maxW);
    ctx.restore();
  }

  // LEFT = date / time
  strokeBox(dateBoxX, y, dateBoxW, boxH);
  drawCenteredInBox(timeStr, dateBoxX, y, dateBoxW, boxH, dateFont, 0, 2);
  drawCenteredInBox(dateStr, dateBoxX, y, dateBoxW, boxH, dateFont, 1, 2);

  // CENTER = brand
  ctx.save();
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${18 * s}px ${fontEn}`;
  const brandX = dateBoxX + dateBoxW + brandW / 2;
  if (site.restaurantNameFa) {
    ctx.fillText(
      site.restaurantNameEn || DEFAULT_CAFE_NAME_EN,
      brandX,
      y + boxH * 0.35,
      brandW - 8 * s
    );
    ctx.font = `700 ${14 * s}px ${fontFa}`;
    ctx.fillText(
      site.restaurantNameFa,
      brandX,
      y + boxH * 0.7,
      brandW - 8 * s
    );
  } else {
    ctx.fillText(
      site.restaurantNameEn || DEFAULT_CAFE_NAME_EN,
      brandX,
      y + boxH / 2,
      brandW - 8 * s
    );
  }
  ctx.restore();

  // RIGHT = invoice number
  strokeBox(invBoxX, y, invBoxW, boxH);
  drawCenteredInBox(invLabel, invBoxX, y, invBoxW, boxH, invFont, 0, 2);
  drawCenteredInBox(invNo, invBoxX, y, invBoxW, boxH, invFont + 1, 1, 2);

  y += boxH + 12 * s;

  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.lineWidth = Math.max(2, 2 * s);
  ctx.strokeStyle = "#000";
  ctx.stroke();
  y += 10 * s;

  // Location on first row; long customer names get a full-width line below.
  ctx.font = `700 ${15 * s}px ${fontFa}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const location = `مکان: ${receipt.location || "—"}`;
  ctx.fillText(location, pad, y, W * 0.45);

  const customerRaw = String(receipt.customer || "").trim() || "—";
  const customerLabel = `مشتری: ${customerRaw}`;
  ctx.textAlign = "right";
  const nameMax = W - pad * 2 - Math.min(ctx.measureText(location).width, W * 0.42) - 16 * s;
  if (
    customerRaw === "—" ||
    ctx.measureText(customerLabel).width <= Math.max(nameMax, W * 0.48)
  ) {
    ctx.fillText(customerLabel, W - pad, y, W * 0.55);
    y += 26 * s;
  } else {
    // Name is long → put it under the meta line, full width.
    y += 24 * s;
    ctx.textAlign = "right";
    ctx.font = `700 ${14 * s}px ${fontFa}`;
    const maxNameW = W - pad * 2;
    // Simple wrap by characters for Persian names
    let line1 = customerLabel;
    let line2 = "";
    if (ctx.measureText(customerLabel).width > maxNameW) {
      const words = customerLabel.split(/\s+/);
      line1 = "";
      line2 = "";
      for (const w of words) {
        const trial = line1 ? `${line1} ${w}` : w;
        if (!line2 && ctx.measureText(trial).width <= maxNameW) {
          line1 = trial;
        } else {
          line2 = line2 ? `${line2} ${w}` : w;
        }
      }
      if (!line1) {
        line1 = customerLabel.slice(0, Math.max(8, Math.floor(customerLabel.length / 2)));
        line2 = customerLabel.slice(line1.length).trim();
      }
    }
    ctx.fillText(line1, W - pad, y, maxNameW);
    y += 22 * s;
    if (line2) {
      ctx.fillText(line2, W - pad, y, maxNameW);
      y += 22 * s;
    }
  }

  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  y += 10 * s;

  const cols = {
    name: Math.floor(W * 0.4),
    unit: Math.floor(W * 0.2),
    qty: Math.floor(W * 0.14),
    total: Math.floor(W * 0.26),
  };
  const headerH = 28 * s;
  ctx.fillStyle = "#000";
  ctx.fillRect(pad, y, W - pad * 2, headerH);
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${14 * s}px ${fontFa}`;
  ctx.textAlign = "right";
  ctx.fillText("نام", W - pad - 6 * s, y + 6 * s);
  ctx.textAlign = "left";
  let x = pad;
  ctx.fillText("فی", x + 6 * s, y + 6 * s);
  x += cols.unit;
  ctx.fillText("تعداد", x + 4 * s, y + 6 * s);
  x += cols.qty;
  ctx.fillText("قیمت کل", x + 4 * s, y + 6 * s);
  y += headerH;

  ctx.fillStyle = "#000";
  const rowH = 28 * s;
  const list = items.length
    ? items
    : [{ name: "—", qty: 0, unit: 0, line: 0 }];
  for (const it of list) {
    ctx.font = `700 ${15 * s}px ${fontFa}`;
    ctx.textAlign = "right";
    ctx.fillText(it.name, W - pad - 6 * s, y + 5 * s, cols.name - 10 * s);
    ctx.font = `700 ${14 * s}px ${fontFa}`;
    ctx.textAlign = "left";
    let cx = pad;
    ctx.fillText(money(it.unit), cx + 6 * s, y + 5 * s);
    cx += cols.unit;
    ctx.fillText(toPersianDigits(it.qty), cx + 4 * s, y + 5 * s);
    cx += cols.qty;
    ctx.fillText(money(it.line), cx + 4 * s, y + 5 * s);
    y += rowH;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();
    ctx.lineWidth = Math.max(2, 2 * s);
  }

  y += 12 * s;
  ctx.font = `700 ${15 * s}px ${fontFa}`;
  const sums: Array<[string, number]> = [
    ["جمع کل", Number(inv.subtotal || 0)],
  ];
  if (inv.discountAmount) sums.push(["تخفیف", Number(inv.discountAmount)]);
  if (inv.tax) sums.push(["مالیات بر ارزش افزوده", Number(inv.tax)]);
  for (const [label, value] of sums) {
    ctx.textAlign = "right";
    ctx.fillText(label, W - pad, y);
    ctx.textAlign = "left";
    ctx.fillText(money(value), pad, y);
    y += 24 * s;
  }

  y += 8 * s;
  const payH = 34 * s;
  ctx.font = `700 ${16 * s}px ${fontFa}`;
  ctx.textAlign = "right";
  ctx.fillText("قابل پرداخت", W - pad, y + 7 * s);
  const payLabel = `${money(Number(inv.total || 0))} تومان`;
  ctx.font = `700 ${15 * s}px ${fontFa}`;
  const payW = Math.min(
    W * 0.55,
    Math.max(ctx.measureText(payLabel).width + 20 * s, 140 * s)
  );
  ctx.fillStyle = "#000";
  ctx.fillRect(pad, y, payW, payH);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(payLabel, pad + payW / 2, y + 8 * s);
  ctx.fillStyle = "#000";
  y += payH + 16 * s;

  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  y += 14 * s;

  ctx.textAlign = "center";
  ctx.font = `700 ${16 * s}px ${fontFa}`;
  const footerMsg =
    String(site.receiptFooterMessage || "").trim() || "به امید دیدار مجدد";
  ctx.fillText(footerMsg, W / 2, y);
  y += 24 * s;
  if (site.restaurantNameFa) {
    ctx.font = `700 ${14 * s}px ${fontFa}`;
    ctx.fillText(site.restaurantNameFa, W / 2, y);
    y += 22 * s;
  }
  if (site.showContactOnReceipt && site.phone) {
    ctx.font = `700 ${14 * s}px ${fontFa}`;
    ctx.fillText(`تلفن: ${toPersianDigits(site.phone)}`, W / 2, y);
    y += 22 * s;
  }
  if (site.showContactOnReceipt && site.address) {
    ctx.font = `700 ${13 * s}px ${fontFa}`;
    ctx.fillText(site.address, W / 2, y);
    y += 22 * s;
  }

  return Math.ceil(y + 2 * s);
}

export async function invoiceToEscPosBase64(
  inv: Invoice,
  settings?: Partial<SiteSettings>
): Promise<string> {
  const canvas = await renderInvoiceReceiptCanvas(inv, settings, {
    width: RECEIPT_IMAGE_WIDTH,
  });
  const bytes = canvasToEscPosJob(canvas, {
    chunkHeight: 100,
    feed: 1,
    feedBeforeCut: 28,
    cut: true,
    threshold: 160,
  });
  return bytesToBase64(bytes);
}

type StationPaintItem = {
  name: string;
  qty: number;
  toppings: string[];
};

type StationPaintInput = {
  width: number;
  scale: number;
  site: SiteSettings;
  receipt: ReceiptData;
  items: StationPaintItem[];
  stationLabel: string;
  logoImg?: HTMLImageElement | null;
};

function paintStationTicket(
  ctx: CanvasRenderingContext2D,
  input: StationPaintInput
): number {
  const { width: W, scale: s, site, receipt, items, stationLabel, logoImg } =
    input;
  const pad = 8 * s;
  let y = 6 * s;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, 8000);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";
  ctx.direction = "ltr";

  const fontFa = `"Vazir", "IRANYekanX", Tahoma, sans-serif`;
  const fontEn = `Arial, Helvetica, sans-serif`;

  if (logoImg && logoImg.naturalWidth > 0 && logoImg.naturalHeight > 0) {
    const maxLogoW = W * 0.42;
    const maxLogoH = 52 * s;
    const ratio = Math.min(
      maxLogoW / logoImg.naturalWidth,
      maxLogoH / logoImg.naturalHeight
    );
    const lw = Math.max(1, Math.round(logoImg.naturalWidth * ratio));
    const lh = Math.max(1, Math.round(logoImg.naturalHeight * ratio));
    const lx = Math.round((W - lw) / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(logoImg, lx, y, lw, lh);
    ctx.imageSmoothingEnabled = false;
    y += lh + 10 * s;
  }

  const timeStr = toPersianDigits(receipt.time || "");
  const dateStr = toPersianDigits(receipt.dateJalali || "");
  const stationEn = stationLabel === "بار" ? "BAR" : "KITCHEN";

  const boxH = 58 * s;
  const maxSide = (W - pad * 2) * 0.38;
  const minSide = 118 * s;

  function measureLines(lines: string[], fontSize: number): number {
    ctx.font = `700 ${fontSize * s}px ${fontFa}`;
    let widest = 0;
    for (const line of lines) {
      widest = Math.max(widest, ctx.measureText(line).width);
    }
    return widest;
  }

  let dateFont = 13;
  let dateTextW = measureLines([timeStr, dateStr], dateFont);
  while (dateFont > 9 && dateTextW + 24 * s > maxSide) {
    dateFont -= 0.5;
    dateTextW = measureLines([timeStr, dateStr], dateFont);
  }
  const dateBoxW = Math.min(
    maxSide,
    Math.max(dateTextW + 24 * s, minSide)
  );

  let stationFont = 13;
  let stationTextW = measureLines([stationLabel, stationEn], stationFont);
  while (stationFont > 9 && stationTextW + 24 * s > maxSide) {
    stationFont -= 0.5;
    stationTextW = measureLines([stationLabel, stationEn], stationFont);
  }
  const stationBoxW = Math.min(
    maxSide,
    Math.max(stationTextW + 24 * s, minSide)
  );

  const brandW = Math.max(36 * s, W - dateBoxW - stationBoxW - pad * 2);
  const dateBoxX = pad;
  const stationBoxX = W - pad - stationBoxW;

  function strokeBox(x: number, yy: number, w: number, h: number) {
    ctx.lineWidth = Math.max(2, 2.5 * s);
    ctx.strokeStyle = "#000";
    ctx.strokeRect(x + 0.5, yy + 0.5, w - 1, h - 1);
  }

  function drawCenteredInBox(
    text: string,
    boxX: number,
    boxY: number,
    w: number,
    h: number,
    fontPx: number,
    lineIndex: number,
    lineCount: number
  ) {
    ctx.save();
    ctx.direction = "ltr";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const maxW = Math.max(8, w - 14 * s);
    let px = fontPx * s;
    ctx.font = `700 ${px}px ${fontFa}`;
    let tw = ctx.measureText(text).width;
    while (tw > maxW && px > 9 * s) {
      px -= 0.5;
      ctx.font = `700 ${px}px ${fontFa}`;
      tw = ctx.measureText(text).width;
    }
    const lineGap = h / (lineCount + 1);
    const cy = boxY + lineGap * (lineIndex + 1);
    const cx = boxX + (w - Math.min(tw, maxW)) / 2;
    ctx.fillText(text, cx, cy, maxW);
    ctx.restore();
  }

  strokeBox(dateBoxX, y, dateBoxW, boxH);
  drawCenteredInBox(timeStr, dateBoxX, y, dateBoxW, boxH, dateFont, 0, 2);
  drawCenteredInBox(dateStr, dateBoxX, y, dateBoxW, boxH, dateFont, 1, 2);

  ctx.save();
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${18 * s}px ${fontEn}`;
  const brandX = dateBoxX + dateBoxW + brandW / 2;
  if (site.restaurantNameFa) {
    ctx.fillText(
      site.restaurantNameEn || DEFAULT_CAFE_NAME_EN,
      brandX,
      y + boxH * 0.35,
      brandW - 8 * s
    );
    ctx.font = `700 ${14 * s}px ${fontFa}`;
    ctx.fillText(
      site.restaurantNameFa,
      brandX,
      y + boxH * 0.7,
      brandW - 8 * s
    );
  } else {
    ctx.fillText(
      site.restaurantNameEn || DEFAULT_CAFE_NAME_EN,
      brandX,
      y + boxH / 2,
      brandW - 8 * s
    );
  }
  ctx.restore();

  // Right box = station (آشپزخانه / بار) — same slot as invoice number on حرارتی
  strokeBox(stationBoxX, y, stationBoxW, boxH);
  drawCenteredInBox(
    stationLabel,
    stationBoxX,
    y,
    stationBoxW,
    boxH,
    stationFont + 1,
    0,
    2
  );
  drawCenteredInBox(
    stationEn,
    stationBoxX,
    y,
    stationBoxW,
    boxH,
    stationFont,
    1,
    2
  );

  y += boxH + 12 * s;

  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.lineWidth = Math.max(2, 2 * s);
  ctx.strokeStyle = "#000";
  ctx.stroke();
  y += 10 * s;

  ctx.font = `700 ${15 * s}px ${fontFa}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const location = `مکان: ${receipt.location || "—"}`;
  ctx.fillText(location, pad, y, W * 0.45);

  const customerRaw = String(receipt.customer || "").trim() || "—";
  const customerLabel = `مشتری: ${customerRaw}`;
  ctx.textAlign = "right";
  const nameMax =
    W -
    pad * 2 -
    Math.min(ctx.measureText(location).width, W * 0.42) -
    16 * s;
  if (
    customerRaw === "—" ||
    ctx.measureText(customerLabel).width <= Math.max(nameMax, W * 0.48)
  ) {
    ctx.fillText(customerLabel, W - pad, y, W * 0.55);
    y += 26 * s;
  } else {
    y += 24 * s;
    ctx.textAlign = "right";
    ctx.font = `700 ${14 * s}px ${fontFa}`;
    const maxNameW = W - pad * 2;
    let line1 = customerLabel;
    let line2 = "";
    if (ctx.measureText(customerLabel).width > maxNameW) {
      const words = customerLabel.split(/\s+/);
      line1 = "";
      line2 = "";
      for (const w of words) {
        const trial = line1 ? `${line1} ${w}` : w;
        if (!line2 && ctx.measureText(trial).width <= maxNameW) {
          line1 = trial;
        } else {
          line2 = line2 ? `${line2} ${w}` : w;
        }
      }
      if (!line1) {
        line1 = customerLabel.slice(
          0,
          Math.max(8, Math.floor(customerLabel.length / 2))
        );
        line2 = customerLabel.slice(line1.length).trim();
      }
    }
    ctx.fillText(line1, W - pad, y, maxNameW);
    y += 22 * s;
    if (line2) {
      ctx.fillText(line2, W - pad, y, maxNameW);
      y += 22 * s;
    }
  }

  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  y += 10 * s;

  // Same table chrome as حرارتی, but only نام + تعداد (no prices)
  const cols = {
    name: Math.floor(W * 0.72),
    qty: Math.floor(W * 0.28),
  };
  const headerH = 28 * s;
  ctx.fillStyle = "#000";
  ctx.fillRect(pad, y, W - pad * 2, headerH);
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${14 * s}px ${fontFa}`;
  ctx.textAlign = "right";
  ctx.fillText("نام", W - pad - 6 * s, y + 6 * s);
  ctx.textAlign = "left";
  ctx.fillText("تعداد", pad + 6 * s, y + 6 * s);
  y += headerH;

  ctx.fillStyle = "#000";
  const list = items.length ? items : [{ name: "—", qty: 0, toppings: [] }];
  for (const it of list) {
    const rowH = 28 * s;
    ctx.font = `700 ${15 * s}px ${fontFa}`;
    ctx.textAlign = "right";
    ctx.fillText(it.name, W - pad - 6 * s, y + 5 * s, cols.name - 10 * s);
    ctx.font = `700 ${16 * s}px ${fontFa}`;
    ctx.textAlign = "left";
    ctx.fillText(toPersianDigits(it.qty), pad + 6 * s, y + 5 * s);
    y += rowH;

    if (it.toppings.length) {
      ctx.font = `700 ${12 * s}px ${fontFa}`;
      ctx.textAlign = "right";
      for (const top of it.toppings) {
        ctx.fillText(`+ ${top}`, W - pad - 6 * s, y + 2 * s, cols.name - 10 * s);
        y += 20 * s;
      }
    }

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();
    ctx.lineWidth = Math.max(2, 2 * s);
  }

  y += 14 * s;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  y += 14 * s;

  ctx.textAlign = "center";
  ctx.font = `700 ${16 * s}px ${fontFa}`;
  const footerMsg = String(receipt.footer || "").trim() || "سفارش جدید";
  ctx.fillText(footerMsg, W / 2, y);
  y += 24 * s;
  if (site.restaurantNameFa) {
    ctx.font = `700 ${14 * s}px ${fontFa}`;
    ctx.fillText(site.restaurantNameFa, W / 2, y);
    y += 22 * s;
  } else if (site.restaurantNameEn) {
    ctx.font = `700 ${14 * s}px ${fontEn}`;
    ctx.fillText(site.restaurantNameEn, W / 2, y);
    y += 22 * s;
  }

  return Math.ceil(y + 2 * s);
}

/**
 * Kitchen / bar ticket using the same canvas layout as حرارتی invoices,
 * without price columns or totals.
 */
export async function renderStationTicketCanvas(
  order: Order,
  items: OrderItem[],
  station: PrintStation,
  settings?: Partial<SiteSettings>,
  opts?: DrawOpts
): Promise<HTMLCanvasElement> {
  const targetW = opts?.width ?? RECEIPT_IMAGE_WIDTH;
  if (typeof document === "undefined") {
    throw new Error("receipt_render_ssr");
  }

  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }

  const site = mergeSiteSettings(settings);
  const receipt = stationTicketReceipt(order, items, station, site);
  const stationLabel = station === "bar" ? "بار" : "آشپزخانه";

  const logoImg =
    site.showLogoOnReceipt && site.logo
      ? await loadImage(assetUrl(site.logo))
      : null;

  const scale = 1.7;
  const W = targetW;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = 8000;
  const ctx = out.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("receipt_canvas");
  ctx.imageSmoothingEnabled = false;

  const contentH = paintStationTicket(ctx, {
    width: W,
    scale,
    site,
    receipt,
    stationLabel,
    logoImg,
    items: items.map((it) => ({
      name: String(it.name || "—"),
      qty: Number(it.count || 1),
      toppings: (it.toppings || [])
        .map((t) => (typeof t === "string" ? t : String(t.name || "")))
        .filter(Boolean),
    })),
  });

  const bottomPad = Math.max(4, Math.round(4 * scale));
  const finalH = Math.max(1, contentH + bottomPad);
  const cropped = document.createElement("canvas");
  cropped.width = W;
  cropped.height = finalH;
  const cctx = cropped.getContext("2d", { alpha: false });
  if (!cctx) throw new Error("receipt_canvas");
  cctx.fillStyle = "#ffffff";
  cctx.fillRect(0, 0, W, finalH);
  cctx.drawImage(out, 0, 0, W, contentH, 0, 0, W, contentH);

  const imageData = cctx.getImageData(0, 0, W, finalH);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    const v = lum < 160 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  cctx.putImageData(imageData, 0, 0);
  return cropped;
}

export async function stationTicketToEscPosBase64(
  order: Order,
  items: OrderItem[],
  station: PrintStation,
  settings?: Partial<SiteSettings>
): Promise<string> {
  const canvas = await renderStationTicketCanvas(
    order,
    items,
    station,
    settings,
    { width: RECEIPT_IMAGE_WIDTH }
  );
  const bytes = canvasToEscPosJob(canvas, {
    chunkHeight: 100,
    feed: 1,
    feedBeforeCut: 28,
    cut: true,
    threshold: 160,
  });
  return bytesToBase64(bytes);
}
