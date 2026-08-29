"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { toPersianDigits } from "@/lib/format";
import {
  PERSIAN_MONTHS,
  PERSIAN_WEEKDAYS,
  compareIso,
  formatJalaliIso,
  formatJalaliRange,
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

const PRESETS = [
  { id: "today", label: "امروز", days: 0 },
  { id: "yesterday", label: "دیروز", days: 1 },
  { id: "week", label: "۷ روز", days: 6 },
  { id: "month", label: "۳۰ روز", days: 29 },
] as const;

export function DateRangePicker({
  from,
  to,
  onChange,
  autoOpen,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  autoOpen?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const todayIso = toIsoDate(startOfDayMs());
  const todayJ = gregorianToJalali(new Date());

  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ jy: todayJ.jy, jm: todayJ.jm });
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [hoverIso, setHoverIso] = useState("");
  const [pickingEnd, setPickingEnd] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    if (!open) return;
    setDraftFrom(from);
    setDraftTo(to);
    setPickingEnd(false);
    setHoverIso("");
    const anchor = from || to || todayIso;
    const j = gregorianToJalali(new Date(isoToMs(anchor)));
    setView({ jy: j.jy, jm: j.jm });
  }, [open, from, to, todayIso]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
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

  useEffect(() => {
    if (!open) return;
    function place() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(280, window.innerWidth - 24);
      const rtl = document.documentElement.dir === "rtl";
      let left = rtl ? r.right - width : r.left;
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
      const estimatedH = 360;
      const below = r.bottom + 8;
      const top =
        below + estimatedH > window.innerHeight - 12
          ? Math.max(12, r.top - estimatedH - 8)
          : below;
      setPanelStyle({
        position: "fixed",
        top,
        left,
        width,
        zIndex: 560,
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const grid = useMemo(
    () => buildMonthGrid(view.jy, view.jm),
    [view.jy, view.jm]
  );

  const rangeStart = draftFrom && draftTo ? (compareIso(draftFrom, draftTo) <= 0 ? draftFrom : draftTo) : draftFrom;
  const rangeEnd = draftFrom && draftTo ? (compareIso(draftFrom, draftTo) <= 0 ? draftTo : draftFrom) : draftTo;

  function inRange(iso: string) {
    if (!rangeStart) return false;
    const end = rangeEnd || (pickingEnd && hoverIso ? hoverIso : "");
    if (!end) return iso === rangeStart;
    const start = compareIso(rangeStart, end) <= 0 ? rangeStart : end;
    const finish = compareIso(rangeStart, end) <= 0 ? end : rangeStart;
    return compareIso(iso, start) >= 0 && compareIso(iso, finish) <= 0;
  }

  function isRangeEdge(iso: string) {
    return iso === rangeStart || iso === rangeEnd;
  }

  function pickDay(iso: string) {
    if (!pickingEnd || !draftFrom) {
      setDraftFrom(iso);
      setDraftTo("");
      setPickingEnd(true);
      return;
    }
    if (iso === draftFrom) {
      setDraftTo(iso);
      setPickingEnd(false);
      return;
    }
    const start = compareIso(iso, draftFrom) <= 0 ? iso : draftFrom;
    const end = compareIso(iso, draftFrom) <= 0 ? draftFrom : iso;
    setDraftFrom(start);
    setDraftTo(end);
    setPickingEnd(false);
  }

  function applyPreset(daysBack: number) {
    const end = startOfDayMs();
    const start = end - daysBack * 86400000;
    setDraftFrom(toIsoDate(start));
    setDraftTo(toIsoDate(end));
    setPickingEnd(false);
    const j = gregorianToJalali(new Date(start));
    setView({ jy: j.jy, jm: j.jm });
  }

  function apply() {
    const f = draftFrom || draftTo;
    const t = draftTo || draftFrom;
    if (!f) return;
    const start = t && compareIso(f, t) <= 0 ? f : t || f;
    const end = t && compareIso(f, t) <= 0 ? t : f;
    onChange(start, end);
    setOpen(false);
  }

  function clearDraft() {
    setDraftFrom("");
    setDraftTo("");
    setPickingEnd(false);
    setHoverIso("");
  }

  const monthLabel = `${PERSIAN_MONTHS[view.jm - 1]} ${toPersianDigits(view.jy)}`;

  return (
    <div
      ref={rootRef}
      className={`cp-date-picker${open ? " is-open" : ""}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="cp-date-picker-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
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
          {formatJalaliRange(from, to)}
        </span>
        <span className="cp-date-picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className="cp-date-picker-panel is-ported"
              role="dialog"
              aria-label="انتخاب بازه تاریخ"
              style={panelStyle}
            >
          <div className="cp-date-picker-presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="cp-date-picker-preset"
                onClick={() => applyPreset(p.days)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="cp-date-picker-nav">
            <button
              type="button"
              className="cp-date-picker-nav-btn"
              aria-label="ماه قبل"
              onClick={() => setView((v) => shiftMonth(v.jy, v.jm, -1))}
            >
              ‹
            </button>
            <span className="cp-date-picker-month">{monthLabel}</span>
            <button
              type="button"
              className="cp-date-picker-nav-btn"
              aria-label="ماه بعد"
              onClick={() => setView((v) => shiftMonth(v.jy, v.jm, 1))}
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
              const selected = isRangeEdge(cell.iso);
              const ranged = inRange(cell.iso);
              const isToday = cell.iso === todayIso;
              return (
                <button
                  key={idx}
                  type="button"
                  className={[
                    "cp-date-picker-day",
                    !cell.inMonth ? "is-outside" : "",
                    ranged ? "is-in-range" : "",
                    selected ? "is-selected" : "",
                    isToday ? "is-today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => pickDay(cell.iso)}
                  onMouseEnter={() => {
                    if (pickingEnd && draftFrom) setHoverIso(cell.iso);
                  }}
                  onMouseLeave={() => setHoverIso("")}
                >
                  {toPersianDigits(cell.jd)}
                </button>
              );
            })}
          </div>

          <div className="cp-date-picker-summary">
            <div className="cp-date-picker-range-labels">
              <span>
                <small>از</small>
                <strong>{formatJalaliIso(draftFrom || draftTo, true)}</strong>
              </span>
              <span className="cp-date-picker-range-sep" aria-hidden="true">
                →
              </span>
              <span>
                <small>تا</small>
                <strong>{formatJalaliIso(draftTo || draftFrom, true)}</strong>
              </span>
            </div>
            <p className="cp-date-picker-hint" aria-live="polite">
              {pickingEnd && draftFrom && !draftTo
                ? "روز پایان را انتخاب کنید"
                : "شروع و پایان بازه"}
            </p>
          </div>

          <footer className="cp-date-picker-actions">
            <button
              type="button"
              className="cp-btn cp-btn--ghost cp-date-picker-clear"
              onClick={clearDraft}
            >
              پاک کردن
            </button>
            <button
              type="button"
              className="cp-date-picker-apply"
              disabled={!draftFrom && !draftTo}
              onClick={apply}
            >
              اعمال بازه
            </button>
          </footer>
        </div>,
            document.body
          )
        : null}
    </div>
  );
}
