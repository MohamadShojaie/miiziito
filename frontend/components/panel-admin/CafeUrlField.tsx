"use client";

import { useState } from "react";
import {
  cafeCashierUrl,
  cafeMenuUrl,
} from "@/lib/super-admin/tenant-urls";

export function CafeUrlField({
  slug,
  kind,
}: {
  slug?: string;
  kind: "menu" | "cashier";
}) {
  const [copied, setCopied] = useState(false);

  if (!slug) {
    return <span style={{ color: "var(--sa-text-faint)" }}>—</span>;
  }

  const href = kind === "menu" ? cafeMenuUrl(slug) : cafeCashierUrl(slug);
  const openLabel = kind === "menu" ? "باز کردن منو" : "باز کردن صندوق";

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="sa-url-actions">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="sa-btn sa-btn-ghost sa-btn-sm"
      >
        {openLabel}
      </a>
      <button
        type="button"
        className="sa-btn sa-btn-ghost sa-btn-sm"
        onClick={copyUrl}
        title={href}
      >
        {copied ? "کپی شد" : "کپی لینک"}
      </button>
    </div>
  );
}
