"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toPersianDigits } from "@/lib/format";
import { buildTableMenuUrl } from "@/lib/table-session";

export function TableQrPanel({ table }: { table: string }) {
  const [dataUrl, setDataUrl] = useState("");
  const [menuUrl, setMenuUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = buildTableMenuUrl(table);
    setMenuUrl(url);
    setDataUrl("");
    setError("");
    if (!url) return;
    (async () => {
      try {
        const png = await QRCode.toDataURL(url, {
          width: 512,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#1a1c16", light: "#ffffff" },
        });
        if (!cancelled) setDataUrl(png);
      } catch {
        if (!cancelled) setError("ساخت QR ناموفق بود");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [table]);

  function download() {
    if (!dataUrl) return;
    setBusy(true);
    try {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `table-${table}-qr.png`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusy(false);
    }
  }

  function printQr() {
    if (!dataUrl) return;
    const title = `میز ${toPersianDigits(table)}`;
    const w = window.open("", "_blank", "noopener,noreferrer,width=480,height=640");
    if (!w) return;
    w.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"/><title>${title}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Tahoma,sans-serif;color:#1a1c16;background:#fff}
  .card{text-align:center;padding:24px}
  img{width:280px;height:280px;display:block;margin:0 auto 16px}
  h1{font-size:28px;margin:0 0 8px}
  p{margin:0;font-size:14px;opacity:.7}
</style></head><body>
<div class="card">
  <img src="${dataUrl}" alt="QR ${title}" />
  <h1>${title}</h1>
  <p>اسکن کنید و سفارش دهید</p>
</div>
<script>window.onload=function(){window.focus();window.print();}</script>
</body></html>`);
    w.document.close();
  }

  return (
    <section className="tables-tile-qr">
      <span className="table-glass-label">کد QR میز</span>
      <p className="tables-tile-qr-hint">
        این کد را دانلود کنید و روی میز بچسبانید. مهمان با اسکن مستقیم وارد منو
        می‌شود و شماره میز را وارد نمی‌کند.
      </p>
      <div className="tables-tile-qr-body">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="tables-tile-qr-img"
            src={dataUrl}
            alt={`QR میز ${toPersianDigits(table)}`}
            width={168}
            height={168}
          />
        ) : (
          <div className="tables-tile-qr-placeholder" aria-hidden="true">
            {error || "…"}
          </div>
        )}
        <div className="tables-tile-qr-meta">
          <p className="tables-tile-qr-url" title={menuUrl}>
            {menuUrl || "—"}
          </p>
          <div className="tables-tile-qr-actions">
            <button
              type="button"
              className="cp-btn"
              disabled={!dataUrl || busy}
              onClick={download}
            >
              دانلود PNG
            </button>
            <button
              type="button"
              className="cp-btn cp-btn--ghost"
              disabled={!dataUrl}
              onClick={printQr}
            >
              چاپ
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
