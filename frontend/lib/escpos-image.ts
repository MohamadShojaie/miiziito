/**
 * Standard ESC/POS raster bit-image encoding (GS v 0).
 *
 * Tall images are split into horizontal strips; each strip is one GS v 0
 * command. Width is kept ≤512 dots — many thermal heads print >512 very
 * slowly (legacy path).
 */

export const ESC = 0x1b;
export const GS = 0x1d;
export const LF = 0x0a;

/**
 * Printer bitmap width in dots. 560-ish fills 80mm better; keep multiple of 8.
 * 576 is full 80mm @ ~203dpi.
 */
export const RECEIPT_IMAGE_WIDTH = 576;

/** Max height per GS v 0 fragment. */
export const ESC_POS_IMAGE_CHUNK_HEIGHT = 100;

export type MonoBitmap = {
  width: number;
  height: number;
  /** Row-major, 1 bit per pixel, MSB leftmost, packed to ceil(width/8) bytes/row */
  rows: Uint8Array[];
};

function alignWidth(width: number): number {
  return Math.max(8, Math.ceil(Math.max(1, width) / 8) * 8);
}

/** Hard 1-bit threshold — no gray (smaller / faster / cleaner on thermal). */
export function rgbaToMonoBitmap(
  imageData: ImageData,
  threshold = 160
): MonoBitmap {
  const { width, height, data } = imageData;
  const rowBytes = Math.ceil(width / 8);
  const rows: Uint8Array[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = new Uint8Array(rowBytes);
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      const lum =
        a < 16
          ? 255
          : (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      if (lum < threshold) {
        row[x >> 3] |= 0x80 >> (x & 7);
      }
    }
    rows.push(row);
  }
  return { width, height, rows };
}

export function padMonoBitmapWidth(bitmap: MonoBitmap): MonoBitmap {
  const width = alignWidth(bitmap.width);
  if (width === bitmap.width) return bitmap;
  const rowBytes = width / 8;
  const rows = bitmap.rows.map((src) => {
    const row = new Uint8Array(rowBytes);
    row.set(src.subarray(0, Math.min(src.length, rowBytes)));
    return row;
  });
  return { width, height: bitmap.height, rows };
}

/** Drop trailing all-white rows (keeps a small safety pad). */
export function trimMonoBitmapBottom(
  bitmap: MonoBitmap,
  keepPad = 8
): MonoBitmap {
  let last = bitmap.height - 1;
  while (last >= 0) {
    const row = bitmap.rows[last];
    let dark = false;
    for (let i = 0; i < row.length; i += 1) {
      if (row[i]) {
        dark = true;
        break;
      }
    }
    if (dark) break;
    last -= 1;
  }
  const height = Math.max(1, last + 1 + keepPad);
  if (height >= bitmap.height) return bitmap;
  return {
    width: bitmap.width,
    height,
    rows: bitmap.rows.slice(0, height),
  };
}

export function splitMonoBitmap(
  bitmap: MonoBitmap,
  chunkHeight = ESC_POS_IMAGE_CHUNK_HEIGHT
): MonoBitmap[] {
  const h = Math.max(1, Math.floor(chunkHeight));
  const out: MonoBitmap[] = [];
  for (let y = 0; y < bitmap.height; y += h) {
    const sliceH = Math.min(h, bitmap.height - y);
    out.push({
      width: bitmap.width,
      height: sliceH,
      rows: bitmap.rows.slice(y, y + sliceH),
    });
  }
  return out.length ? out : [{ width: bitmap.width, height: 0, rows: [] }];
}

/**
 * GS v 0 — Print raster bit image
 * 1D 76 30 m xL xH yL yH [data]
 * m=0 normal density (fastest / most compatible)
 */
export function monoBitmapToGsV0(bitmap: MonoBitmap): Uint8Array {
  const widthBytes = Math.ceil(bitmap.width / 8);
  const height = bitmap.height;
  const header = new Uint8Array([
    GS,
    0x76,
    0x30,
    0x00,
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
  ]);
  const data = new Uint8Array(widthBytes * height);
  for (let y = 0; y < height; y += 1) {
    const row = bitmap.rows[y] || new Uint8Array(widthBytes);
    data.set(row.subarray(0, widthBytes), y * widthBytes);
  }
  const out = new Uint8Array(header.length + data.length);
  out.set(header, 0);
  out.set(data, header.length);
  return out;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function escPosInit(): Uint8Array {
  return new Uint8Array([ESC, 0x40]);
}

export function escPosAlignCenter(): Uint8Array {
  return new Uint8Array([ESC, 0x61, 1]);
}

export function escPosFeed(lines = 3): Uint8Array {
  return new Uint8Array([ESC, 0x64, Math.max(0, Math.min(255, lines))]);
}

/** GS V 66 n — feed n units then partial cut (keeps footer past the blade). */
export function escPosFeedAndCut(feedUnits = 80): Uint8Array {
  return new Uint8Array([
    GS,
    0x56,
    0x42,
    Math.max(0, Math.min(255, feedUnits)),
  ]);
}

export function escPosCut(partial = true): Uint8Array {
  return new Uint8Array([GS, 0x56, partial ? 1 : 0]);
}

export function monoBitmapToEscPosJob(
  bitmap: MonoBitmap,
  opts?: {
    chunkHeight?: number;
    feed?: number;
    cut?: boolean;
    feedBeforeCut?: number;
  }
): Uint8Array {
  const padded = padMonoBitmapWidth(trimMonoBitmapBottom(bitmap, 2));
  const chunks = splitMonoBitmap(
    padded,
    opts?.chunkHeight ?? ESC_POS_IMAGE_CHUNK_HEIGHT
  );
  const parts: Uint8Array[] = [escPosInit(), escPosAlignCenter()];
  for (const chunk of chunks) {
    if (chunk.height <= 0) continue;
    parts.push(monoBitmapToGsV0(chunk));
  }
  parts.push(escPosFeed(opts?.feed ?? 1));
  if (opts?.cut !== false) {
    parts.push(escPosFeedAndCut(opts?.feedBeforeCut ?? 28));
  }
  return concatBytes(parts);
}

export function canvasToMonoBitmap(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  threshold = 160
): MonoBitmap {
  const ctx =
    "getContext" in canvas
      ? (canvas.getContext("2d") as
          | CanvasRenderingContext2D
          | OffscreenCanvasRenderingContext2D
          | null)
      : null;
  if (!ctx) {
    return { width: 0, height: 0, rows: [] };
  }
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  return rgbaToMonoBitmap(imageData, threshold);
}

export function canvasToEscPosJob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts?: {
    chunkHeight?: number;
    feed?: number;
    cut?: boolean;
    threshold?: number;
    feedBeforeCut?: number;
  }
): Uint8Array {
  const mono = canvasToMonoBitmap(canvas, opts?.threshold ?? 160);
  return monoBitmapToEscPosJob(mono, opts);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length))
    );
  }
  return btoa(binary);
}
