"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useCart } from "@/components/CartProvider";
import { useToast } from "@/components/ToastProvider";
import {
  apiJson,
  loadQueue,
  saveQueue,
  menuHeaders,
} from "@/lib/api";
import { formatPriceAsNumber, toPersianDigits } from "@/lib/format";
import { startOfDayMs, toIsoDate } from "@/lib/jalali";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import {
  DEFAULT_TABLE_REGIONS,
  tablesFromRegions,
  type TablesPayload,
} from "@/lib/types";
import { sanitizeTable } from "@/lib/table-session";

function useSelectableTables(
  open: boolean,
  mode: "order" | "reserve" = "order"
) {
  const [regions, setRegions] = useState(DEFAULT_TABLE_REGIONS);
  const [states, setStates] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<TablesPayload>("/api/tables", {
          method: "GET",
          auth: false,
          headers: menuHeaders(),
        });
        if (cancelled) return;
        if (data.regions?.length) setRegions(data.regions);
        if (data.tables && typeof data.tables === "object") {
          setStates(data.tables);
        }
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const tables = useMemo(() => {
    return tablesFromRegions(regions).filter((n) => {
      const st = states[String(n)];
      if (st === "disabled") return false;
      // Future bookings allowed on currently-full tables; only block active reserved hold
      if (mode === "reserve" && st === "reserved") return false;
      if (mode === "order" && (st === "full" || st === "reserved")) return false;
      return true;
    });
  }, [regions, states, mode]);

  const known = useMemo(() => {
    const all = tablesFromRegions(regions).filter(
      (n) => states[String(n)] !== "disabled"
    );
    return new Set((mode === "reserve" ? all : tables).map(String));
  }, [regions, states, mode, tables]);

  return { tables, known, regions, states };
}

function TablePicker({
  tables,
  value,
  onChange,
  id,
}: {
  tables: number[];
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  return (
    <div
      id={id}
      className="drawer-table-chips pos-table-chips is-grid"
      role="group"
      aria-label="انتخاب میز"
    >
      {tables.map((n) => {
        const key = String(n);
        return (
          <button
            key={key}
            type="button"
            className={`pos-table-chip${value === key ? " is-active" : ""}`}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            {toPersianDigits(n)}
          </button>
        );
      })}
    </div>
  );
}

function ReserveTablePicker({
  tables,
  value,
  onChange,
}: {
  tables: number[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (!tables.length) {
    return (
      <p className="reserve-pick-empty">میز قابل رزروی در دسترس نیست</p>
    );
  }

  return (
    <div className="reserve-table-grid" role="listbox" aria-label="میزها">
      {tables.map((n) => {
        const key = String(n);
        return (
          <button
            key={key}
            type="button"
            role="option"
            aria-selected={value === key}
            className={`reserve-table-btn${value === key ? " is-active" : ""}`}
            onClick={() => onChange(key)}
          >
            {toPersianDigits(n)}
          </button>
        );
      })}
    </div>
  );
}

function LockedTableBadge({
  table,
  className = "drawer-table-locked",
}: {
  table: string;
  className?: string;
}) {
  const isModal = className.startsWith("modal");
  return (
    <div className={className} role="status">
      <span
        className={
          isModal ? "modal-table-locked-label" : "drawer-table-locked-label"
        }
      >
        میز شما
      </span>
      <strong
        className={
          isModal ? "modal-table-locked-value" : "drawer-table-locked-value"
        }
      >
        {toPersianDigits(table)}
      </strong>
    </div>
  );
}

function availableReserveTimes(
  options: string[],
  date: string,
  todayIso: string
): string[] {
  if (!date || date !== todayIso) return options;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return options.filter((t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m > mins;
  });
}

function ReserveTimePicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (time: string) => void;
}) {
  if (!options.length) {
    return (
      <p className="reserve-pick-empty">برای این روز ساعت آزادی نیست</p>
    );
  }

  return (
    <div className="reserve-time-list" role="listbox" aria-label="ساعت رزرو">
      {options.map((t) => (
        <button
          key={t}
          type="button"
          role="option"
          aria-selected={value === t}
          className={`reserve-time-btn${value === t ? " is-active" : ""}`}
          onClick={() => onChange(t)}
        >
          {toPersianDigits(t)}
        </button>
      ))}
    </div>
  );
}

function ReservePickSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="modal-overlay cp-modal-overlay reserve-pick-overlay is-open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-card cp-modal modal-card--reserve-pick"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          type="button"
          className="modal-close"
          aria-label="بستن"
          onClick={onClose}
        >
          ×
        </button>
        <h2 className="modal-title">{title}</h2>
        <div className="reserve-pick-sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function CartDrawer({
  open,
  onClose,
  lockedTable = "",
}: {
  open: boolean;
  onClose: () => void;
  /** When set (from QR scan), table is fixed and picker is hidden. */
  lockedTable?: string;
}) {
  const { lines, setCount, clear, total } = useCart();
  const { showToast } = useToast();
  const { tables, known } = useSelectableTables(open);
  const [table, setTable] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [feedback, setFeedback] = useState("");

  const locked = sanitizeTable(lockedTable);

  useEffect(() => {
    if (!open) return;
    if (locked) {
      setTable(locked);
      setFeedback("");
    }
  }, [open, locked]);

  function resolveTable(): string | null {
    const t = sanitizeTable(locked || table);
    if (!t) {
      setFeedback("شماره میز را انتخاب کنید");
      return null;
    }
    if (known.size > 0 && !known.has(t)) {
      setFeedback("این شماره میز وجود ندارد");
      return null;
    }
    setFeedback("");
    return t;
  }

  async function submit() {
    const t = resolveTable();
    if (!t) return;
    if (!lines.length) {
      setFeedback("سبد خالی است");
      return;
    }
    const payload = {
      type: "food",
      table: t,
      items: lines.map((l) => ({
        id: l.id,
        name: l.name,
        price:
          l.unit + (l.toppings || []).reduce((s, x) => s + x.price, 0),
        count: l.count,
        toppings: l.toppings || [],
      })),
      total,
    };
    setBusy(true);
    try {
      await apiJson("/api/orders", {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/json", ...menuHeaders() },
        body: JSON.stringify(payload),
      });
      clear();
      if (!locked) setTable("");
      onClose();
      setConfirmText(`سفارش میز ${toPersianDigits(t)} ثبت شد.`);
      setConfirmOpen(true);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "table_unknown" || code === "table_disabled") {
        setFeedback(
          code === "table_disabled"
            ? "این میز غیرفعال است"
            : "این شماره میز وجود ندارد"
        );
        return;
      }
      const q = loadQueue();
      q.push(payload);
      saveQueue(q);
      clear();
      if (!locked) setTable("");
      onClose();
      setConfirmText(
        `سفارش میز ${toPersianDigits(t)} ذخیره شد و به‌محض وصل شدن اینترنت ارسال می‌شود.`
      );
      setConfirmOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function waiterOnly() {
    const t = resolveTable();
    if (!t) return;
    setBusy(true);
    try {
      await apiJson("/api/orders", {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/json", ...menuHeaders() },
        body: JSON.stringify({ type: "waiter", table: t }),
      });
      showToast("گارسون صدا زده شد");
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "table_unknown" || code === "table_disabled") {
        setFeedback(
          code === "table_disabled"
            ? "این میز غیرفعال است"
            : "این شماره میز وجود ندارد"
        );
      } else {
        setFeedback("ارسال ناموفق بود");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className={`drawer-overlay cp-drawer-overlay${open ? " is-open" : ""}`}
        aria-hidden={!open}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <aside className="drawer cp-drawer" role="dialog" aria-labelledby="drawer-title">
          <div className="drawer-header">
            <h2 id="drawer-title" className="drawer-title">
              لیست سفارش
            </h2>
            <button
              type="button"
              className="drawer-close"
              aria-label="بستن"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <p
            className={`drawer-empty${lines.length ? "" : " is-visible"}`}
            hidden={!!lines.length}
          >
            هنوز چیزی اضافه نکرده‌اید.
          </p>
          <ul className="drawer-list">
            {lines.map((l) => (
              <li key={l.key} className="drawer-item" data-item-id={l.id}>
                <div className="drawer-item-info">
                  <span className="drawer-item-name">{l.name}</span>
                  <span className="drawer-item-price">
                    {formatPriceAsNumber(
                      (l.unit +
                        (l.toppings || []).reduce((s, t) => s + t.price, 0)) *
                        l.count
                    )}
                  </span>
                </div>
                <div className="drawer-item-controls">
                  <button
                    type="button"
                    className="drawer-item-btn drawer-item-minus"
                    aria-label="کم کردن"
                    onClick={() => setCount(l.key, l.count - 1)}
                  >
                    −
                  </button>
                  <span className="drawer-item-qty">
                    {toPersianDigits(l.count)}
                  </span>
                  <button
                    type="button"
                    className="drawer-item-btn drawer-item-plus"
                    aria-label="زیاد کردن"
                    onClick={() => setCount(l.key, l.count + 1)}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="drawer-item-remove"
                  aria-label="حذف"
                  onClick={() => setCount(l.key, 0)}
                >
                  حذف
                </button>
              </li>
            ))}
          </ul>
          <div className="drawer-footer" hidden={!lines.length}>
            <div className="drawer-total-row">
              <span className="drawer-total-label">جمع</span>
              <span className="drawer-total-value">
                {formatPriceAsNumber(total)}
              </span>
            </div>
            <div className="drawer-order-form">
              {locked ? (
                <LockedTableBadge table={locked} />
              ) : (
                <>
                  <label
                    className="drawer-table-label"
                    htmlFor="table-number-pick"
                  >
                    شماره میز
                  </label>
                  <TablePicker
                    id="table-number-pick"
                    tables={tables}
                    value={table}
                    onChange={(v) => {
                      setTable(v);
                      setFeedback("");
                    }}
                  />
                </>
              )}
              <button
                type="button"
                className="drawer-submit-btn cp-btn cp-btn--primary"
                disabled={busy}
                onClick={submit}
              >
                ثبت سفارش
              </button>
              <button
                type="button"
                className="drawer-waiter-btn cp-btn cp-btn--ghost"
                disabled={busy}
                onClick={waiterOnly}
              >
                فقط صدازدن گارسون
              </button>
              <p
                className={`order-feedback${feedback ? " is-error" : ""}`}
                hidden={!feedback}
              >
                {feedback}
              </p>
            </div>
          </div>
        </aside>
      </div>

      <div
        className={`modal-overlay cp-modal-overlay${confirmOpen ? " is-open" : ""}`}
        hidden={!confirmOpen}
      >
        <div className="modal-card cp-modal" role="dialog">
          <h2 className="modal-title">ثبت شد</h2>
          <p className="modal-hint">{confirmText}</p>
          <button
            type="button"
            className="modal-submit cp-btn cp-btn--primary cp-btn--block"
            onClick={() => setConfirmOpen(false)}
          >
            باشه
          </button>
        </div>
      </div>
    </>
  );
}

export function WaiterModal({
  open,
  onClose,
  lockedTable = "",
}: {
  open: boolean;
  onClose: () => void;
  lockedTable?: string;
}) {
  const { showToast } = useToast();
  const { tables, known } = useSelectableTables(open);
  const [table, setTable] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = sanitizeTable(lockedTable);

  useEffect(() => {
    if (!open) return;
    if (locked) {
      setTable(locked);
      setError("");
    }
  }, [open, locked]);

  async function submit() {
    const t = sanitizeTable(locked || table);
    if (!t) {
      setError("شماره میز را انتخاب کنید");
      return;
    }
    if (known.size > 0 && !known.has(t)) {
      setError("این شماره میز وجود ندارد");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await apiJson("/api/orders", {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/json", ...menuHeaders() },
        body: JSON.stringify({ type: "waiter", table: t }),
      });
      showToast("گارسون صدا زده شد");
      if (!locked) setTable("");
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "table_unknown") {
        setError("این شماره میز وجود ندارد");
      } else if (code === "table_disabled") {
        setError("این میز غیرفعال است");
      } else {
        setError("ارسال ناموفق بود");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`modal-overlay cp-modal-overlay${open ? " is-open" : ""}`}
      hidden={!open}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card cp-modal" role="dialog">
        <button
          type="button"
          className="modal-close"
          aria-label="بستن"
          onClick={onClose}
        >
          ×
        </button>
        <h2 className="modal-title">صدازدن گارسون</h2>
        {locked ? (
          <>
            <p className="modal-hint">درخواست برای میز شما ارسال می‌شود</p>
            <LockedTableBadge table={locked} className="modal-table-locked" />
          </>
        ) : (
          <>
            <p className="modal-hint">میز خود را انتخاب کنید</p>
            <TablePicker
              tables={tables}
              value={table}
              onChange={(v) => {
                setTable(v);
                setError("");
              }}
            />
          </>
        )}
        <p className="modal-error" hidden={!error}>
          {error}
        </p>
        <button
          type="button"
          className="modal-submit cp-btn cp-btn--primary cp-btn--block"
          disabled={busy}
          onClick={submit}
        >
          ارسال درخواست
        </button>
      </div>
    </div>
  );
}

export function ReserveModal({
  open,
  onClose,
  lockedTable = "",
}: {
  open: boolean;
  onClose: () => void;
  lockedTable?: string;
}) {
  const { showToast } = useToast();
  const { tables, known } = useSelectableTables(open, "reserve");
  const [table, setTable] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [guests, setGuests] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pick, setPick] = useState<"table" | "time" | null>(null);
  const locked = sanitizeTable(lockedTable);
  const todayIso = toIsoDate(startOfDayMs());

  const timeOptions = useMemo(() => {
    const opts: string[] = [];
    for (let h = 8; h <= 23; h += 1) {
      for (const m of [0, 30]) {
        if (h === 23 && m === 30) continue;
        opts.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return opts;
  }, []);

  const openTimes = useMemo(
    () => availableReserveTimes(timeOptions, date, todayIso),
    [timeOptions, date, todayIso]
  );

  useEffect(() => {
    if (!open) {
      setPick(null);
      return;
    }
    if (locked) {
      setTable(locked);
    }
    setError("");
    setDate(todayIso);
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const next = timeOptions.find((t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m > mins + 15;
    });
    setTime(next || timeOptions[0] || "18:00");
  }, [open, locked, todayIso, timeOptions]);

  useEffect(() => {
    if (!time || openTimes.includes(time)) return;
    if (openTimes[0]) setTime(openTimes[0]);
  }, [openTimes, time]);

  async function submit() {
    const t = sanitizeTable(locked || table);
    if (!t) {
      setError("شماره میز را انتخاب کنید");
      return;
    }
    if (known.size > 0 && !known.has(t)) {
      setError("این شماره میز وجود ندارد یا قابل رزرو نیست");
      return;
    }
    if (!date || date < todayIso) {
      setError("تاریخ رزرو را انتخاب کنید");
      return;
    }
    if (!time) {
      setError("ساعت رزرو را انتخاب کنید");
      return;
    }
    if (date === todayIso) {
      const [hh, mm] = time.split(":").map(Number);
      const now = new Date();
      if (hh * 60 + mm <= now.getHours() * 60 + now.getMinutes()) {
        setError("ساعت رزرو باید بعد از الان باشد");
        return;
      }
    }
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError("نام را وارد کنید");
      return;
    }
    const phoneDigits = phone.replace(/[^\d۰-۹]/g, "").replace(
      /[۰-۹]/g,
      (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    );
    if (phoneDigits.length < 8) {
      setError("شماره تماس معتبر وارد کنید");
      return;
    }
    const guestCount = guests
      ? Number(
          guests
            .replace(/[^\d۰-۹]/g, "")
            .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
        )
      : 0;
    setError("");
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        table: t,
        name: trimmedName,
        phone: phoneDigits,
        date,
        time,
      };
      if (guestCount > 0) body.guests = guestCount;
      await apiJson("/api/reservations", {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/json", ...menuHeaders() },
        body: JSON.stringify(body),
      });
      showToast("درخواست رزرو ارسال شد");
      if (!locked) setTable("");
      setName("");
      setPhone("");
      setGuests("");
      setDate(todayIso);
      setTime("");
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "table_unknown") {
        setError("این شماره میز وجود ندارد");
      } else if (code === "table_disabled") {
        setError("این میز غیرفعال است");
      } else if (code === "table_unavailable" || code === "table_reserved") {
        setError("این میز الان قابل رزرو نیست");
      } else if (code === "date_required" || code === "date_invalid") {
        setError("تاریخ رزرو معتبر انتخاب کنید");
      } else if (
        code === "time_required" ||
        code === "time_invalid" ||
        code === "time_past"
      ) {
        setError("ساعت رزرو معتبر انتخاب کنید");
      } else if (code === "name_required") {
        setError("نام را وارد کنید");
      } else if (code === "phone_required") {
        setError("شماره تماس معتبر وارد کنید");
      } else if (code === "unknown_route" || code === "Failed to fetch") {
        setError("ارتباط با سرور برقرار نشد — صفحه را تازه کنید");
      } else {
        setError("ارسال ناموفق بود");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className={`modal-overlay cp-modal-overlay${open ? " is-open" : ""}`}
        hidden={!open}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="modal-card cp-modal modal-card--reserve" role="dialog">
          <button
            type="button"
            className="modal-close"
            aria-label="بستن"
            onClick={onClose}
          >
            ×
          </button>
          <header className="reserve-modal-head">
            <h2 className="modal-title">رزرو میز</h2>
            <p className="modal-hint">
              {locked
                ? "تاریخ، ساعت و مشخصات خود را وارد کنید"
                : "میز، تاریخ، ساعت و مشخصات را وارد کنید"}
            </p>
          </header>

          <div className="reserve-modal-body">
            {locked ? (
              <LockedTableBadge table={locked} className="modal-table-locked" />
            ) : (
              <div className="modal-field">
                <span className="modal-field-label">میز</span>
                <button
                  type="button"
                  className={`reserve-field-trigger${table ? "" : " is-empty"}`}
                  onClick={() => setPick("table")}
                >
                  <span className="cp-num">
                    {table ? toPersianDigits(table) : "انتخاب میز"}
                  </span>
                  <span className="reserve-field-trigger-hint" aria-hidden>
                    ▾
                  </span>
                </button>
              </div>
            )}

            <div className="reserve-when">
              <div className="modal-field reserve-when-date">
                <JalaliDatePicker
                  label="تاریخ"
                  value={date}
                  minDate={todayIso}
                  spanPastYears={0}
                  spanFutureYears={1}
                  onChange={(iso) => {
                    setDate(iso);
                    setError("");
                  }}
                />
              </div>
              <div className="modal-field reserve-when-time">
                <span className="modal-field-label">ساعت</span>
                <button
                  type="button"
                  className={`reserve-field-trigger${time ? "" : " is-empty"}`}
                  onClick={() => setPick("time")}
                >
                  <span className="cp-num">
                    {time ? toPersianDigits(time) : "انتخاب ساعت"}
                  </span>
                  <span className="reserve-field-trigger-hint" aria-hidden>
                    ▾
                  </span>
                </button>
              </div>
            </div>

            <label className="modal-field">
              <span className="modal-field-label">نام</span>
              <input
                type="text"
                className="checkout-input"
                value={name}
                autoComplete="name"
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                placeholder="نام و نام خانوادگی"
              />
            </label>
            <label className="modal-field">
              <span className="modal-field-label">شماره تماس</span>
              <input
                type="tel"
                className="checkout-input cp-num"
                inputMode="tel"
                value={phone}
                autoComplete="tel"
                onChange={(e) => {
                  setPhone(e.target.value);
                  setError("");
                }}
                placeholder="۰۹۱۲…"
              />
            </label>
            <label className="modal-field">
              <span className="modal-field-label">تعداد نفرات (اختیاری)</span>
              <input
                type="text"
                className="checkout-input cp-num"
                inputMode="numeric"
                value={guests}
                onChange={(e) => {
                  setGuests(
                    e.target.value
                      .replace(/[^\d۰-۹]/g, "")
                      .slice(0, 2)
                  );
                  setError("");
                }}
                placeholder="مثلاً ۴"
              />
            </label>
            <p className="modal-error" hidden={!error}>
              {error}
            </p>
          </div>

          <footer className="reserve-modal-foot">
            <button
              type="button"
              className="modal-submit cp-btn cp-btn--primary cp-btn--block"
              disabled={busy}
              onClick={submit}
            >
              ارسال درخواست رزرو
            </button>
          </footer>
        </div>
      </div>

      <ReservePickSheet
        open={open && pick === "table"}
        title="انتخاب میز"
        onClose={() => setPick(null)}
      >
        <ReserveTablePicker
          tables={tables}
          value={table}
          onChange={(v) => {
            setTable(v);
            setError("");
            setPick(null);
          }}
        />
      </ReservePickSheet>

      <ReservePickSheet
        open={open && pick === "time"}
        title="انتخاب ساعت"
        onClose={() => setPick(null)}
      >
        <ReserveTimePicker
          value={time}
          options={openTimes}
          onChange={(t) => {
            setTime(t);
            setError("");
            setPick(null);
          }}
        />
      </ReservePickSheet>
    </>
  );
}
