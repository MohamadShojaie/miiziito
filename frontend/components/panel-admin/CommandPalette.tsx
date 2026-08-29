"use client";

import { useEffect, useMemo, useState } from "react";
import { saFetch } from "@/lib/super-admin/api";

type Props = {
  open: boolean;
  onClose: () => void;
  onNavigate: (href: string) => void;
};

const COMMANDS = [
  { label: "ایجاد کافه", href: "/panel-admin/cafes/", hint: "مشتریان" },
  { label: "جستجوی کافه", href: "/panel-admin/cafes/", hint: "مشتریان" },
  { label: "باز کردن پرداخت‌ها", href: "/panel-admin/payments/", hint: "پرداخت‌ها" },
  { label: "باز کردن اشتراک‌ها", href: "/panel-admin/subscriptions/", hint: "اشتراک‌ها" },
  { label: "ایجاد پلن", href: "/panel-admin/plans/", hint: "پلن‌ها" },
  { label: "ارسال اعلان", href: "/panel-admin/notifications/", hint: "عملیات" },
  { label: "سلامت سیستم", href: "/panel-admin/system/health/", hint: "سیستم" },
  { label: "داشبورد", href: "/panel-admin/", hint: "نمای کلی" },
  { label: "گزارش فعالیت", href: "/panel-admin/audit-logs/", hint: "سیستم" },
];

const KIND_FA: Record<string, string> = {
  command: "دستور",
  cafes: "کافه",
  payments: "پرداخت",
  subscriptions: "اشتراک",
  tickets: "تیکت",
};

export function CommandPalette({ open, onClose, onNavigate }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [groups, setGroups] = useState<{ type: string; items: { id: string; name?: string; subject?: string; referenceNumber?: string }[] }[]>([]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setActive(0);
      setGroups([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setGroups([]);
      return;
    }
    const t = setTimeout(() => {
      saFetch<{ groups: typeof groups }>("sa-search", { query: { q: q.trim() } })
        .then((r) => setGroups(r.groups || []))
        .catch(() => setGroups([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return COMMANDS;
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(needle) || c.label.includes(q.trim()));
  }, [q]);

  const flatResults = useMemo(() => {
    const rows: { kind: string; label: string; href: string; hint?: string }[] = [];
    for (const c of filtered) rows.push({ kind: "command", label: c.label, href: c.href, hint: c.hint });
    for (const g of groups) {
      for (const item of g.items) {
        const label = item.name || item.subject || item.referenceNumber || item.id;
        let href = "/panel-admin/";
        if (g.type === "cafes") href = `/panel-admin/cafes/${item.id}/`;
        else if (g.type === "payments") href = `/panel-admin/payments/${item.id}/`;
        else if (g.type === "subscriptions") href = `/panel-admin/subscriptions/${item.id}/`;
        else if (g.type === "tickets") href = `/panel-admin/support/${item.id}/`;
        rows.push({ kind: g.type, label, href, hint: item.id });
      }
    }
    return rows;
  }, [filtered, groups]);

  useEffect(() => {
    setActive(0);
  }, [flatResults.length]);

  if (!open) return null;

  function go(href: string) {
    onNavigate(href);
    onClose();
  }

  return (
    <div className="sa-overlay" onClick={onClose} role="presentation">
      <div className="sa-palette" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <input
          autoFocus
          placeholder="جستجو یا اجرای دستور…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, flatResults.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            }
            if (e.key === "Enter" && flatResults[active]) go(flatResults[active].href);
          }}
        />
        <div className="sa-palette-list">
          {!flatResults.length ? (
            <div style={{ padding: 16, color: "var(--sa-text-muted)", fontSize: "0.9rem" }}>نتیجه‌ای نیست</div>
          ) : (
            flatResults.map((row, i) => (
              <button
                key={row.kind + row.href + row.label + i}
                type="button"
                className={`sa-palette-item ${i === active ? "is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(row.href)}
              >
                <span>{row.label}</span>
                <small>
                  {KIND_FA[row.kind] || row.kind} {row.hint ? `· ${row.hint}` : ""}
                </small>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
