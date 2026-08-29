"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Customer, Invoice } from "@/lib/types";
import {
  buildCrmProfiles,
  customerTierLabel,
  type CrmProfile,
} from "@/lib/crm";
import { apiJson, cashierHeaders } from "@/lib/api";
import { toPersianDigits } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";

export type CustomerPick = {
  id: string;
  name: string;
  phone?: string;
  tier?: string;
  visits?: number;
};

type Props = {
  value: CustomerPick | null;
  invoices?: Invoice[];
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  label?: string;
  placeholder?: string;
  allowWalkIn?: boolean;
  walkInName?: string;
  onWalkInNameChange?: (name: string) => void;
  onChange: (customer: CustomerPick | null) => void;
  /** Hide label / selected meta — for dense rows like guest split. */
  compact?: boolean;
  inputId?: string;
};

const LIST_LIMIT = 40;

function normalizeSearch(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function profileRecency(p: CrmProfile) {
  return Math.max(
    Number(p.createdAt || 0),
    Number(p.updatedAt || 0),
    Number(p.lastVisitAt || 0)
  );
}

export function CustomerPicker({
  value,
  invoices = [],
  disabled,
  required,
  invalid,
  label = "مشتری",
  placeholder = "جستجو با نام یا موبایل…",
  allowWalkIn = false,
  walkInName = "",
  onWalkInNameChange,
  onChange,
  compact = false,
  inputId = "customer-picker-input",
}: Props) {
  const { showToast } = useToast();
  const [registry, setRegistry] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const loadSeq = useRef(0);

  const loadRegistry = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const data = await apiJson<{ customers?: Customer[] }>("/api/customers", {
        headers: cashierHeaders(),
      });
      if (seq !== loadSeq.current) return;
      setRegistry(Array.isArray(data.customers) ? data.customers : []);
    } catch {
      /* keep last known list */
    }
  }, []);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  useEffect(() => {
    if (open) loadRegistry();
  }, [open, loadRegistry]);

  const profiles = useMemo(
    () => buildCrmProfiles(registry, invoices),
    [registry, invoices]
  );

  const display = value
    ? value.name
    : allowWalkIn
      ? walkInName
      : query;

  const searchNeedle = normalizeSearch(value ? query : display);
  /** In dense guest rows, only suggest after typing — avoid dumping the full list on focus. */
  const menuReady = !compact || searchNeedle.length > 0;

  const matches = useMemo(() => {
    const needle = searchNeedle;
    let rows: CrmProfile[] = profiles.slice();
    if (needle) {
      rows = rows.filter((p) => {
        const hay = normalizeSearch(`${p.name} ${p.phone || ""}`);
        return hay.includes(needle);
      });
    }
    rows.sort((a, b) => {
      if (needle) {
        const an = a.name.toLowerCase();
        const bn = b.name.toLowerCase();
        if (an.startsWith(needle) !== bn.startsWith(needle)) {
          return an.startsWith(needle) ? -1 : 1;
        }
      }
      const rec = profileRecency(b) - profileRecency(a);
      if (rec !== 0) return rec;
      return a.name.localeCompare(b.name, "fa");
    });
    return rows.slice(0, compact ? 8 : LIST_LIMIT);
  }, [profiles, searchNeedle, compact]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(profile: CrmProfile) {
    onChange({
      id: profile.id,
      name: profile.name,
      phone: profile.phone,
      tier: profile.tier,
      visits: profile.visits,
    });
    // Do not clear walk-in here — parents that share name state (guest rows)
    // would wipe the selection in the same tick.
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setQuery("");
    onWalkInNameChange?.("");
  }

  async function createQuick(e: React.FormEvent) {
    e.preventDefault();
    const name = quickName.trim();
    if (!name) {
      showToast("نام مشتری الزامی است");
      return;
    }
    setBusy(true);
    try {
      const data = await apiJson<{
        customer?: Customer;
        customers?: Customer[];
      }>("/api/customers", {
        method: "POST",
        headers: cashierHeaders(),
        body: JSON.stringify({
          action: "add",
          name,
          phone: quickPhone.trim(),
        }),
      });
      const next = Array.isArray(data.customers) ? data.customers : [];
      setRegistry(next);
      const created =
        data.customer ||
        next.find(
          (c) => c.name === name && (c.phone || "") === quickPhone.trim()
        );
      if (created) {
        onChange({
          id: created.id,
          name: created.name,
          phone: created.phone,
          tier: created.tier,
          visits: 0,
        });
      }
      setQuickOpen(false);
      setQuickName("");
      setQuickPhone("");
      setOpen(false);
      showToast("مشتری اضافه شد");
    } catch {
      showToast("ثبت مشتری ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`customer-picker${compact ? " is-compact" : ""}`} ref={rootRef}>
      {!compact ? (
        <label className="checkout-field-label" htmlFor={inputId}>
          {label}
          {required ? " *" : ""}
        </label>
      ) : null}
      <div className="customer-picker-row">
        <input
          id={inputId}
          type="search"
          className={`checkout-input${invalid ? " is-invalid" : ""}${compact ? " checkout-guest-name" : ""}`}
          placeholder={placeholder}
          value={value ? value.name : allowWalkIn ? walkInName : query}
          disabled={disabled || busy}
          required={required}
          aria-label={compact ? label : undefined}
          aria-required={required || undefined}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const v = e.target.value;
            if (value) onChange(null);
            if (allowWalkIn) onWalkInNameChange?.(v);
            else setQuery(v);
            setOpen(true);
          }}
        />
        {value ? (
          <button
            type="button"
            className="customer-picker-clear"
            disabled={disabled || busy}
            onClick={clear}
            aria-label="حذف مشتری"
          >
            ×
          </button>
        ) : null}
      </div>

      {value && !compact ? (
        <p className="customer-picker-selected">
          <span className={`crm-tier is-${value.tier || "standard"}`}>
            {customerTierLabel(value.tier)}
          </span>
          {typeof value.visits === "number" ? (
            <em>{toPersianDigits(value.visits)} مراجعه</em>
          ) : null}
          {value.phone ? (
            <span className="cp-num" dir="ltr">
              {value.phone}
            </span>
          ) : null}
        </p>
      ) : null}

      {open && !value && menuReady ? (
        <ul
          className="checkout-autocomplete-menu customer-picker-menu"
          role="listbox"
        >
          {matches.length === 0 ? (
            <li className="customer-picker-empty">مشتری‌ای پیدا نشد</li>
          ) : (
            matches.map((p) => (
              <li key={p.id}>
                <button type="button" role="option" onClick={() => pick(p)}>
                  <span>
                    <strong>{p.name}</strong>
                    {compact ? (
                      p.phone ? (
                        <small dir="ltr">{p.phone}</small>
                      ) : null
                    ) : (
                      <small>
                        {customerTierLabel(p.tier)} ·{" "}
                        {toPersianDigits(p.visits)} مراجعه
                      </small>
                    )}
                  </span>
                  {!compact && p.phone ? (
                    <small dir="ltr">{p.phone}</small>
                  ) : null}
                </button>
              </li>
            ))
          )}
          <li>
            <button
              type="button"
              className="customer-picker-add"
              onClick={() => {
                setQuickName(allowWalkIn ? walkInName.trim() : query.trim());
                setQuickPhone("");
                setQuickOpen(true);
                setOpen(false);
              }}
            >
              + افزودن مشتری جدید
            </button>
          </li>
        </ul>
      ) : null}

      {quickOpen ? (
        <form className="customer-picker-quick" onSubmit={createQuick}>
          <strong>مشتری جدید</strong>
          <input
            type="text"
            className="checkout-input"
            placeholder="نام *"
            value={quickName}
            disabled={busy}
            required
            onChange={(e) => setQuickName(e.target.value)}
          />
          <input
            type="tel"
            dir="ltr"
            className="checkout-input"
            placeholder="موبایل"
            value={quickPhone}
            disabled={busy}
            onChange={(e) => setQuickPhone(e.target.value)}
          />
          <div className="customer-picker-quick-actions">
            <button
              type="button"
              className="cp-btn cp-btn--ghost"
              disabled={busy}
              onClick={() => setQuickOpen(false)}
            >
              انصراف
            </button>
            <button
              type="submit"
              className={`cp-btn cp-btn--primary${busy ? " is-loading" : ""}`}
              disabled={busy}
            >
              ذخیره
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
