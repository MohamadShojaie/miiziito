"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toPersianDigits } from "@/lib/format";
import {
  PERSIAN_MONTHS,
  PERSIAN_WEEKDAYS,
  formatJalaliIso,
  gregorianToJalali,
  isoToMs,
  jalaliMonthLength,
  jalaliToGregorian,
  jalaliWeekdayIndex,
  startOfDayMs,
  toIsoDate,
} from "@/lib/jalali";

type DayCell = {
  iso: string;
  jd: number;
  inMonth: boolean;
};

function buildMonthGrid(jy: number, jm: number): DayCell[] {
  const first = jalaliToGregorian(jy, jm, 1);
  const startPad = jalaliWeekdayIndex(first);
  const len = jalaliMonthLength(jy, jm);
  const cells: DayCell[] = [];

  if (startPad > 0) {
    let py = jy;
    let pm = jm - 1;
    if (pm < 1) {
      pm = 12;
      py -= 1;
    }
    const prevLen = jalaliMonthLength(py, pm);
    for (let i = startPad - 1; i >= 0; i -= 1) {
      const jd = prevLen - i;
      const iso = toIsoDate(jalaliToGregorian(py, pm, jd).getTime());
      cells.push({ iso, jd, inMonth: false });
    }
  }

  for (let jd = 1; jd <= len; jd += 1) {
    const iso = toIsoDate(jalaliToGregorian(jy, jm, jd).getTime());
    cells.push({ iso, jd, inMonth: true });
  }

  while (cells.length % 7 !== 0) {
    let ny = jy;
    let nm = jm + 1;
    if (nm > 12) {
      nm = 1;
      ny += 1;
    }
    const jd = cells.length - startPad - len + 1;
    const iso = toIsoDate(jalaliToGregorian(ny, nm, jd).getTime());
    cells.push({ iso, jd, inMonth: false });
  }

  return cells;
}

function shiftMonth(jy: number, jm: number, delta: number) {
  let m = jm + delta;
  let y = jy;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { jy: y, jm: m };
}

export function JalaliDatePicker({
  label,
  hint,
  value,
  placeholder = "انتخاب تاریخ",
  disabled,
  minDate,
  maxDate,
  spanPastYears = 8,
  spanFutureYears = 8,
  defaultViewYearsAgo = 0,
  onChange,
}: {
  label?: string;
  hint?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  spanPastYears?: number;
  spanFutureYears?: number;
  defaultViewYearsAgo?: number;
  onChange: (iso: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const yearId = useId();
  const todayIso = toIsoDate(startOfDayMs());
  const todayJ = gregorianToJalali(new Date());

  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ jy: todayJ.jy, jm: todayJ.jm });
  const [draft, setDraft] = useState(value);

  const yearOptions = useMemo(() => {
    const maxJ = maxDate
      ? gregorianToJalali(new Date(isoToMs(maxDate)))
      : { jy: todayJ.jy + spanFutureYears };
    const minJ = minDate
      ? gregorianToJalali(new Date(isoToMs(minDate)))
      : { jy: todayJ.jy - spanPastYears };
    let maxY = Math.max(maxJ.jy, minJ.jy);
    let minY = Math.min(maxJ.jy, minJ.jy);
    if (value) {
      const vj = gregorianToJalali(new Date(isoToMs(value)));
      if (vj.jy) {
        maxY = Math.max(maxY, vj.jy);
        minY = Math.min(minY, vj.jy);
      }
    }
    const years: number[] = [];
    for (let y = maxY; y >= minY; y -= 1) years.push(y);
    return years;
  }, [maxDate, minDate, spanFutureYears, spanPastYears, todayJ.jy, value]);

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    let anchor = value;
    if (!anchor && defaultViewYearsAgo > 0) {
      const past = new Date();
      past.setFullYear(past.getFullYear() - defaultViewYearsAgo);
      anchor = toIsoDate(startOfDayMs(past));
    }
    const j = gregorianToJalali(new Date(isoToMs(anchor || todayIso)));
    setView({ jy: j.jy, jm: j.jm });
  }, [open, value, todayIso, defaultViewYearsAgo]);

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

  const grid = useMemo(
    () => buildMonthGrid(view.jy, view.jm),
    [view.jy, view.jm]
  );

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  function clear() {
    setDraft("");
    onChange("");
    setOpen(false);
  }

  function isDisabledDay(iso: string) {
    if (minDate && iso < minDate) return true;
    if (maxDate && iso > maxDate) return true;
    return false;
  }

  return (
    <div ref={rootRef} className={`cp-date-picker${open ? " is-open" : ""}`}>
      {label ? (
        <span className="checkout-field-label">
          {label}
          {hint ? <small className="cp-date-picker-optional">{hint}</small> : null}
        </span>
      ) : null}
      <button
        type="button"
        className="cp-date-picker-trigger cp-date-picker-trigger--block"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className="cp-date-picker-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <rect
              x="3"
              y="5"
              width="18"
              height="16"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M3 10h18M8 3v4M16 3v4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="cp-date-picker-label">
          {value ? formatJalaliIso(value) : placeholder}
        </span>
        <span className="cp-date-picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div
          className="cp-date-picker-panel cp-date-picker-panel--single"
          role="dialog"
          aria-label="انتخاب تاریخ"
        >
          <div className="cp-date-picker-nav">
            <button
              type="button"
              className="cp-date-picker-nav-btn"
              aria-label="ماه قبل"
              onClick={() =>
                setView((v) => {
                  const next = shiftMonth(v.jy, v.jm, -1);
                  const minY = yearOptions[yearOptions.length - 1];
                  if (minY && next.jy < minY) return v;
                  return next;
                })
              }
            >
              ‹
            </button>
            <div className="cp-date-picker-month-wrap">
              <span className="cp-date-picker-month">{PERSIAN_MONTHS[view.jm - 1]}</span>
              <label className="sr-only" htmlFor={yearId}>
                سال
              </label>
              <select
                id={yearId}
                className="cp-date-picker-year"
                value={view.jy}
                onChange={(e) =>
                  setView((v) => ({ ...v, jy: Number(e.target.value) }))
                }
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {toPersianDigits(y)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="cp-date-picker-nav-btn"
              aria-label="ماه بعد"
              onClick={() =>
                setView((v) => {
                  const next = shiftMonth(v.jy, v.jm, 1);
                  const maxY = yearOptions[0];
                  if (maxY && next.jy > maxY) return v;
                  return next;
                })
              }
            >
              ›
            </button>
          </div>

          <div className="cp-date-picker-weekdays">
            {PERSIAN_WEEKDAYS.map((d) => (
              <span key={d} className="cp-date-picker-weekday">
                {d}
              </span>
            ))}
          </div>

          <div className="cp-date-picker-grid">
            {grid.map((cell, idx) => {
              const selected = cell.iso === draft;
              const isToday = cell.iso === todayIso;
              const blocked = isDisabledDay(cell.iso);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={blocked}
                  className={[
                    "cp-date-picker-day",
                    !cell.inMonth ? "is-outside" : "",
                    selected ? "is-selected" : "",
                    isToday ? "is-today" : "",
                    blocked ? "is-disabled" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => !blocked && setDraft(cell.iso)}
                >
                  {toPersianDigits(cell.jd)}
                </button>
              );
            })}
          </div>

          <div className="cp-date-picker-summary">
            <p className="cp-date-picker-hint" aria-live="polite">
              {draft ? formatJalaliIso(draft) : "روز را انتخاب کنید"}
            </p>
          </div>

          <footer className="cp-date-picker-actions">
            <button
              type="button"
              className="cp-btn cp-btn--ghost cp-date-picker-clear"
              onClick={clear}
            >
              پاک کردن
            </button>
            <button
              type="button"
              className="cp-date-picker-apply"
              disabled={!draft}
              onClick={apply}
            >
              تأیید
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
