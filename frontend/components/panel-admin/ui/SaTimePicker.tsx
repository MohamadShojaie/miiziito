"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toPersianDigits } from "@/lib/format";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseTime(value: string): { h: number; m: number } {
  const [hs, ms] = (value || "").split(":");
  const h = Math.min(23, Math.max(0, Number(hs) || 0));
  const m = Math.min(59, Math.max(0, Number(ms) || 0));
  return { h, m };
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

export function SaTimePicker({
  label,
  value,
  placeholder = "انتخاب ساعت",
  disabled,
  onChange,
}: {
  label?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (time: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parseTime(value), [value]);
  const [draftH, setDraftH] = useState(parsed.h);
  const [draftM, setDraftM] = useState(parsed.m);

  useEffect(() => {
    if (!open) return;
    const { h, m } = parseTime(value);
    setDraftH(h);
    setDraftM(m);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function apply() {
    onChange(`${pad2(draftH)}:${pad2(draftM)}`);
    setOpen(false);
  }

  const display = value ? toPersianDigits(value) : placeholder;

  return (
    <div ref={rootRef} className={`sa-time-picker${open ? " is-open" : ""}`}>
      {label ? <span className="sa-label">{label}</span> : null}
      <button
        type="button"
        className="sa-picker-trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className="sa-picker-trigger-icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.7" />
            <path d="M12 8v4.5l3 1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className={`sa-picker-trigger-label${value ? "" : " is-placeholder"}`}>{display}</span>
        <span className="sa-picker-trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="sa-time-picker-panel" role="dialog" aria-label="انتخاب ساعت">
          <div className="sa-time-picker-columns">
            <div className="sa-time-picker-col" role="listbox" aria-label="ساعت">
              <div className="sa-time-picker-col-head">ساعت</div>
              <div className="sa-time-picker-col-body">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    role="option"
                    aria-selected={draftH === h}
                    className={`sa-time-picker-option${draftH === h ? " is-active" : ""}`}
                    onClick={() => setDraftH(h)}
                  >
                    {toPersianDigits(pad2(h))}
                  </button>
                ))}
              </div>
            </div>
            <div className="sa-time-picker-col" role="listbox" aria-label="دقیقه">
              <div className="sa-time-picker-col-head">دقیقه</div>
              <div className="sa-time-picker-col-body">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="option"
                    aria-selected={draftM === m}
                    className={`sa-time-picker-option${draftM === m ? " is-active" : ""}`}
                    onClick={() => setDraftM(m)}
                  >
                    {toPersianDigits(pad2(m))}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="sa-time-picker-preview" aria-live="polite">
            {toPersianDigits(`${pad2(draftH)}:${pad2(draftM)}`)}
          </div>
          <footer className="sa-picker-actions">
            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setOpen(false)}>
              انصراف
            </button>
            <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" onClick={apply}>
              تأیید
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
