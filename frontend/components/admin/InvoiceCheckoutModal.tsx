"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Coupon, Invoice, Order } from "@/lib/types";
import { PAY_METHOD_LABEL } from "@/lib/types";
import { apiJson, cashierHeaders } from "@/lib/api";
import { validateCoupon, normalizeCouponCode } from "@/lib/coupons";
import {
  formatOrderTime,
  formatPriceAsNumber,
  toPersianDigits,
} from "@/lib/format";
import {
  CustomerPicker,
  type CustomerPick,
} from "@/components/admin/CustomerPicker";
import { CardPaymentModal } from "@/components/admin/CardPaymentModal";
import { GuestInvoicePayModal } from "@/components/admin/GuestInvoicePayModal";
import {
  defaultTerminal,
  listPaymentTerminals,
  type PaymentTerminal,
} from "@/lib/payment";

export type PaymentLine = {
  method: "cash" | "card";
  amount: number;
  paymentId?: string;
  referenceNumber?: string;
  terminalId?: string;
  providerTransactionId?: string;
};

export type GuestSplit = {
  name: string;
  amount: number;
  method: "cash" | "card";
  customerId?: string;
  paymentId?: string;
  referenceNumber?: string;
  terminalId?: string;
  providerTransactionId?: string;
};

export type CheckoutPayload = {
  unpaid: boolean;
  payments: PaymentLine[];
  /** When set, backend creates one invoice per guest instead of a single shared invoice. */
  guestSplits?: GuestSplit[];
  customerId?: string;
  customerName: string;
  customerPhone: string;
  discountType: "" | "percent" | "fixed";
  discountValue: number;
  couponCode?: string;
  tax: number;
  total: number;
};

type PayMode = "single" | "methods" | "guests";
type GuestLine = {
  id: string;
  name: string;
  customerId?: string;
  amount: string;
  method: "cash" | "card";
};

const PAY_METHODS = ["cash", "card"] as const;

const DISCOUNT_OPTIONS = [
  ["", "بدون تخفیف"],
  ["percent", "درصد"],
  ["fixed", "مبلغ ثابت"],
] as const;

const TAX_OPTIONS = [
  ["percent", "درصد"],
  ["fixed", "مبلغ ثابت"],
] as const;

function calcTotals(
  subtotal: number,
  discountType: "" | "percent" | "fixed",
  discountValue: number,
  taxMode: "percent" | "fixed",
  taxValue: number
) {
  let discountAmount = 0;
  if (discountType === "percent") {
    const pct = Math.min(100, Math.max(0, discountValue));
    discountAmount = Math.round((subtotal * pct) / 100);
  } else if (discountType === "fixed") {
    discountAmount = Math.min(subtotal, Math.round(Math.max(0, discountValue)));
  }
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  let taxAmount = 0;
  if (taxMode === "percent") {
    taxAmount = Math.round((afterDiscount * Math.max(0, taxValue)) / 100);
  } else {
    taxAmount = Math.round(Math.max(0, taxValue));
  }
  return { discountAmount, taxAmount, total: afterDiscount + taxAmount };
}

function paymentsLabel(payments: PaymentLine[]): string {
  if (!payments.length) return "";
  const methods = new Set(payments.map((p) => p.method));
  if (methods.size > 1) return PAY_METHOD_LABEL.mixed;
  return PAY_METHOD_LABEL[payments[0].method];
}

function aggregatePayments(lines: PaymentLine[]): PaymentLine[] {
  let cash = 0;
  let card = 0;
  lines.forEach((l) => {
    if (l.method === "cash") cash += l.amount;
    else card += l.amount;
  });
  const out: PaymentLine[] = [];
  if (cash > 0) out.push({ method: "cash", amount: cash });
  if (card > 0) out.push({ method: "card", amount: card });
  return out;
}

function initGuestLines(total: number, count = 2): GuestLine[] {
  const n = Math.max(1, count);
  const base = Math.floor(total / n);
  const remainder = total - base * (n - 1);
  return Array.from({ length: n }, (_, i) => ({
    id: `guest-${Date.now()}-${i}`,
    name: "",
    customerId: "",
    amount: String(i === n - 1 ? remainder : base),
    method: "cash" as const,
  }));
}

function AmountField({
  value,
  onChange,
  disabled,
  step = 1000,
  placeholder = "۰",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  step?: number;
  placeholder?: string;
}) {
  const num = Math.max(0, Math.round(Number(value) || 0));

  function bump(delta: number) {
    onChange(String(Math.max(0, num + delta)));
  }

  return (
    <div className="checkout-amount">
      <button
        type="button"
        className="checkout-amount-btn"
        disabled={disabled}
        aria-label="کاهش"
        onClick={() => bump(-step)}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        className="checkout-amount-input cp-num"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      />
      <button
        type="button"
        className="checkout-amount-btn"
        disabled={disabled}
        aria-label="افزایش"
        onClick={() => bump(step)}
      >
        +
      </button>
    </div>
  );
}

function CheckoutDropdown({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find(([v]) => v === value)?.[1] || options[0][1];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={`checkout-dd${open ? " is-open" : ""}`} ref={rootRef}>
      <span className="checkout-field-label">{label}</span>
      <button
        type="button"
        className="checkout-dd-toggle"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="checkout-dd-menu" role="listbox">
          {options.map(([v, text]) => (
            <button
              key={v || "none"}
              type="button"
              role="option"
              className={value === v ? "is-active" : undefined}
              onClick={() => {
                onChange(v);
                setOpen(false);
              }}
            >
              {text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function InvoiceCheckoutModal({
  open,
  order,
  invoices = [],
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  order: Order | null;
  invoices?: Invoice[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: (payload: CheckoutPayload) => void;
}) {
  const subtotal = order?.total || 0;

  const [unpaid, setUnpaid] = useState(false);
  const [payMode, setPayMode] = useState<PayMode>("single");
  const [payMethod, setPayMethod] =
    useState<(typeof PAY_METHODS)[number]>("cash");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [guestLines, setGuestLines] = useState<GuestLine[]>([]);
  const [pickedCustomer, setPickedCustomer] = useState<CustomerPick | null>(
    null
  );
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [couponMsg, setCouponMsg] = useState("");
  const [discountType, setDiscountType] = useState<"" | "percent" | "fixed">(
    ""
  );
  const [discountValue, setDiscountValue] = useState("");
  const [taxMode, setTaxMode] = useState<"percent" | "fixed">("percent");
  const [taxValue, setTaxValue] = useState("9");
  const [mounted, setMounted] = useState(false);
  const [terminals, setTerminals] = useState<PaymentTerminal[]>([]);
  const [cardPayOpen, setCardPayOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<CheckoutPayload | null>(
    null
  );
  /** Sequential per-guest payment confirmation (index into guestSplits). */
  const [guestPayIndex, setGuestPayIndex] = useState<number | null>(null);
  const [guestPayDraft, setGuestPayDraft] = useState<CheckoutPayload | null>(
    null
  );
  const [guestCardOpen, setGuestCardOpen] = useState(false);
  const guestPayDraftRef = useRef<CheckoutPayload | null>(null);
  const guestPayIndexRef = useRef<number | null>(null);

  useEffect(() => {
    guestPayDraftRef.current = guestPayDraft;
  }, [guestPayDraft]);
  useEffect(() => {
    guestPayIndexRef.current = guestPayIndex;
  }, [guestPayIndex]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    apiJson<{ coupons?: Coupon[] }>("/api/coupons", {
      headers: cashierHeaders(),
    })
      .then((data) =>
        setCoupons(Array.isArray(data.coupons) ? data.coupons : [])
      )
      .catch(() => {});
    listPaymentTerminals()
      .then(setTerminals)
      .catch(() => setTerminals([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setUnpaid(false);
    setPayMode("single");
    setPayMethod("cash");
    setCashAmount("");
    setCardAmount("");
    setGuestLines([]);
    if (order?.customerId) {
      setPickedCustomer({
        id: order.customerId,
        name: order.customerName || "",
        phone: order.customerPhone,
      });
      setCustomerName(order.customerName || "");
      setCustomerPhone(order.customerPhone || "");
    } else {
      setPickedCustomer(null);
      setCustomerName(order?.customerName || "");
      setCustomerPhone(order?.customerPhone || "");
    }
    setCouponCode("");
    setAppliedCouponCode("");
    setCouponMsg("");
    setDiscountType("");
    setDiscountValue("");
    setTaxMode("percent");
    setTaxValue("9");
    setCardPayOpen(false);
    setPendingPayload(null);
    setGuestPayIndex(null);
    setGuestPayDraft(null);
    setGuestCardOpen(false);
    guestPayDraftRef.current = null;
    guestPayIndexRef.current = null;
  }, [open, order?.id]);

  const parsedDiscount = Math.max(0, Number(discountValue) || 0);
  const parsedTax = Math.max(0, Number(taxValue) || 0);

  const totals = useMemo(
    () =>
      calcTotals(subtotal, discountType, parsedDiscount, taxMode, parsedTax),
    [subtotal, discountType, parsedDiscount, taxMode, parsedTax]
  );

  useEffect(() => {
    if (!open || unpaid || payMode !== "methods") return;
    const card = Math.max(0, Math.round(Number(cardAmount) || 0));
    setCashAmount(String(Math.max(0, totals.total - card)));
  }, [totals.total, open, unpaid, payMode, cardAmount]);

  const parsedCash = Math.max(0, Math.round(Number(cashAmount) || 0));
  const parsedCard = Math.max(0, Math.round(Number(cardAmount) || 0));

  const guestPaidSum = guestLines.reduce(
    (s, g) => s + Math.max(0, Math.round(Number(g.amount) || 0)),
    0
  );

  const payments: PaymentLine[] = useMemo(() => {
    if (unpaid) return [];
    if (payMode === "single") {
      return [{ method: payMethod, amount: totals.total }];
    }
    if (payMode === "methods") {
      return aggregatePayments([
        ...(parsedCash > 0 ? [{ method: "cash" as const, amount: parsedCash }] : []),
        ...(parsedCard > 0 ? [{ method: "card" as const, amount: parsedCard }] : []),
      ]);
    }
    return aggregatePayments(
      guestLines
        .map((g) => ({
          method: g.method,
          amount: Math.max(0, Math.round(Number(g.amount) || 0)),
        }))
        .filter((g) => g.amount > 0)
    );
  }, [
    unpaid,
    payMode,
    payMethod,
    totals.total,
    parsedCash,
    parsedCard,
    guestLines,
  ]);

  const paidSum = payments.reduce((s, p) => s + p.amount, 0);
  const payRemaining =
    payMode === "guests" ? totals.total - guestPaidSum : totals.total - paidSum;
  const payMismatch = !unpaid && payRemaining !== 0;
  const nameMissing = unpaid && !customerName.trim();

  function applyCoupon() {
    const result = validateCoupon(coupons, couponCode);
    if (!result.valid) {
      setCouponMsg(result.error);
      setAppliedCouponCode("");
      return;
    }
    setDiscountType(result.coupon.discountType);
    setDiscountValue(String(result.coupon.discountValue));
    setAppliedCouponCode(normalizeCouponCode(couponCode));
    setCouponMsg(
      result.coupon.label
        ? `کد اعمال شد — ${result.coupon.label}`
        : "کد اعمال شد"
    );
  }

  function switchPayMode(mode: PayMode) {
    setPayMode(mode);
    if (mode === "guests") {
      setUnpaid(false);
    }
    if (mode === "methods") {
      setCashAmount(String(totals.total));
      setCardAmount("0");
    }
    if (mode === "guests" && guestLines.length === 0) {
      setGuestLines(initGuestLines(totals.total, 2));
    }
  }

  function splitGuestsEvenly() {
    setGuestLines(initGuestLines(totals.total, Math.max(1, guestLines.length)));
  }

  function addGuest() {
    setGuestLines((rows) => [
      ...rows,
      {
        id: `guest-${Date.now()}`,
        name: "",
        customerId: "",
        amount: "0",
        method: "cash",
      },
    ]);
  }

  function updateGuest(id: string, patch: Partial<GuestLine>) {
    setGuestLines((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  function removeGuest(id: string) {
    setGuestLines((rows) =>
      rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)
    );
  }

  const activeTerminal = useMemo(
    () => defaultTerminal(terminals),
    [terminals]
  );
  const cardPortion = payments
    .filter((p) => p.method === "card")
    .reduce((s, p) => s + p.amount, 0);
  const useTerminalCard =
    !unpaid &&
    payMode !== "guests" &&
    cardPortion > 0 &&
    !!activeTerminal;

  function submitLabel() {
    if (busy) return "در حال ثبت…";
    if (payMode === "guests" && !unpaid) {
      return `ادامه پرداخت ${toPersianDigits(guestLines.length)} نفر`;
    }
    if (unpaid) return "ثبت فاکتور بدهکار";
    if (useTerminalCard) return "پرداخت با کارت";
    return `ثبت و پرداخت (${paymentsLabel(payments)})`;
  }

  function buildPayload(): CheckoutPayload {
    const payload: CheckoutPayload = {
      unpaid,
      payments,
      customerId: pickedCustomer?.id || "",
      customerName: customerName.trim(),
      customerPhone: (pickedCustomer?.phone || customerPhone).trim(),
      discountType,
      discountValue: parsedDiscount,
      couponCode: appliedCouponCode || undefined,
      tax: totals.taxAmount,
      total: totals.total,
    };
    if (payMode === "guests" && !unpaid) {
      payload.guestSplits = guestLines.map((g, i) => ({
        name: g.name.trim() || `نفر ${i + 1}`,
        amount: Math.max(0, Math.round(Number(g.amount) || 0)),
        method: g.method,
        customerId: g.customerId || undefined,
      }));
      payload.payments = payload.guestSplits.map((g) => ({
        method: g.method,
        amount: g.amount,
      }));
    }
    return payload;
  }

  function finalizeGuestPayload(draft: CheckoutPayload) {
    const splits = (draft.guestSplits || []).map((g, i) => ({
      name: (g.name || "").trim() || `نفر ${i + 1}`,
      amount: Math.max(0, Math.round(Number(g.amount) || 0)),
      method: g.method === "card" ? ("card" as const) : ("cash" as const),
      customerId: g.customerId || undefined,
      paymentId: g.paymentId,
      referenceNumber: g.referenceNumber,
      terminalId: g.terminalId,
      providerTransactionId: g.providerTransactionId,
    }));
    if (splits.length < 1) return;
    onConfirm({
      ...draft,
      unpaid: false,
      guestSplits: splits,
      payments: splits.map((g) => ({
        method: g.method,
        amount: g.amount,
        paymentId: g.paymentId,
        referenceNumber: g.referenceNumber,
        terminalId: g.terminalId,
        providerTransactionId: g.providerTransactionId,
      })),
    });
    setGuestPayIndex(null);
    setGuestPayDraft(null);
    setGuestCardOpen(false);
  }

  function advanceGuestPay(
    draft: CheckoutPayload,
    index: number,
    patch?: Partial<GuestSplit>
  ) {
    const splits = [...(draft.guestSplits || [])];
    if (patch && splits[index]) {
      splits[index] = { ...splits[index], ...patch };
    }
    const next = { ...draft, guestSplits: splits };
    if (index + 1 >= splits.length) {
      finalizeGuestPayload(next);
      return;
    }
    setGuestPayDraft(next);
    setGuestPayIndex(index + 1);
    setGuestCardOpen(false);
  }

  function handleSubmit() {
    if (nameMissing) return;
    if (payMode === "guests" && !unpaid) {
      if (payMismatch) return;
      const payload = buildPayload();
      if (!payload.guestSplits?.length) return;
      setGuestPayDraft(payload);
      setGuestPayIndex(0);
      setGuestCardOpen(false);
      return;
    }
    const payload = buildPayload();
    if (useTerminalCard) {
      setPendingPayload(payload);
      setCardPayOpen(true);
      return;
    }
    onConfirm(payload);
  }

  const activeGuest =
    guestPayDraft?.guestSplits && guestPayIndex != null
      ? guestPayDraft.guestSplits[guestPayIndex]
      : null;
  const guestWizardOpen =
    open && guestPayIndex != null && !!activeGuest && !guestCardOpen;
  const guestPayBusy = busy || guestCardOpen;

  if (!open || !order || !mounted) return null;

  const checkoutPortal = createPortal(
    <div
      className="table-glass-overlay orders-checkout-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="table-glass-dialog menu-glass-dialog orders-checkout-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="table-glass-head orders-checkout-head">
          <div>
            <h4 id="checkout-dialog-title" className="table-glass-title">
              ثبت فاکتور
            </h4>
            <p className="table-glass-sub orders-checkout-sub">
              میز {toPersianDigits(String(order.table))} ·{" "}
              {formatOrderTime(order.createdAt)}
            </p>
          </div>
          <button
            type="button"
            className="table-glass-close"
            aria-label="بستن"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <section className="orders-checkout-block">
          {payMode === "guests" && !unpaid ? (
            <>
              <h5>مشتریان (هر نفر یک فاکتور)</h5>
              <p className="checkout-coupon-hint">
                برای هر نفر مبلغ سهم و روش پرداخت را وارد کنید. نام اختیاری است.
                بعد از ادامه، برای هر نفر صفحه تأیید پرداخت باز می‌شود (نقدی یا
                کارتخوان).
              </p>
            </>
          ) : (
            <CustomerPicker
              value={pickedCustomer}
              invoices={invoices}
              disabled={busy}
              required={unpaid}
              invalid={nameMissing}
              allowWalkIn
              walkInName={customerName}
              onWalkInNameChange={(name) => {
                setCustomerName(name);
                setCustomerPhone("");
              }}
              onChange={(c) => {
                setPickedCustomer(c);
                if (c) {
                  setCustomerName(c.name);
                  setCustomerPhone(c.phone || "");
                } else {
                  setCustomerName("");
                  setCustomerPhone("");
                }
              }}
            />
          )}
          {nameMissing ? (
            <p className="orders-checkout-split-hint is-error">
              برای فاکتور بدهکار، وارد کردن نام مشتری الزامی است.
            </p>
          ) : null}
          {payMode !== "guests" && !pickedCustomer ? (
            <>
              <label className="checkout-field-label" htmlFor="checkout-phone">
                موبایل مشتری
              </label>
              <input
                id="checkout-phone"
                type="tel"
                dir="ltr"
                inputMode="tel"
                className="checkout-input"
                placeholder="09…"
                value={customerPhone}
                disabled={busy}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </>
          ) : null}
        </section>

        <section className="orders-checkout-block">
          <h5>روش پرداخت</h5>
          <div className="orders-checkout-mode orders-checkout-mode--3">
            <button
              type="button"
              className={`orders-checkout-mode-btn${payMode === "single" ? " is-active" : ""}`}
              disabled={unpaid || busy}
              onClick={() => switchPayMode("single")}
            >
              یک روش
            </button>
            <button
              type="button"
              className={`orders-checkout-mode-btn${payMode === "methods" ? " is-active" : ""}`}
              disabled={unpaid || busy}
              onClick={() => switchPayMode("methods")}
            >
              نقد + کارت
            </button>
            <button
              type="button"
              className={`orders-checkout-mode-btn${payMode === "guests" ? " is-active" : ""}`}
              disabled={unpaid || busy}
              onClick={() => switchPayMode("guests")}
            >
              تقسیم بین افراد
            </button>
          </div>

          {payMode === "single" && !unpaid ? (
            <div className="orders-checkout-chips">
              {PAY_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`orders-checkout-chip${payMethod === m ? " is-active" : ""}`}
                  disabled={busy}
                  onClick={() => setPayMethod(m)}
                >
                  {PAY_METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          ) : null}

          {payMode === "methods" && !unpaid ? (
            <div className="orders-checkout-split">
              <div className="orders-checkout-split-row">
                <span className="orders-checkout-split-label">
                  {PAY_METHOD_LABEL.cash}
                </span>
                <AmountField
                  value={cashAmount}
                  disabled={busy}
                  onChange={setCashAmount}
                />
                <button
                  type="button"
                  className="orders-checkout-split-fill"
                  disabled={busy || totals.total - parsedCard <= 0}
                  title="قرار دادن باقی‌مانده در نقدی"
                  onClick={() =>
                    setCashAmount(
                      String(Math.max(0, totals.total - parsedCard))
                    )
                  }
                >
                  باقی
                </button>
              </div>
              <div className="orders-checkout-split-row">
                <span className="orders-checkout-split-label">
                  {PAY_METHOD_LABEL.card}
                </span>
                <AmountField
                  value={cardAmount}
                  disabled={busy}
                  onChange={setCardAmount}
                />
                <button
                  type="button"
                  className="orders-checkout-split-fill"
                  disabled={busy || totals.total - parsedCash <= 0}
                  title="قرار دادن باقی‌مانده در کارت"
                  onClick={() =>
                    setCardAmount(
                      String(Math.max(0, totals.total - parsedCash))
                    )
                  }
                >
                  باقی
                </button>
              </div>
            </div>
          ) : null}

          {payMode === "guests" && !unpaid ? (
            <div className="checkout-guests">
              <div className="checkout-guests-toolbar">
                <button
                  type="button"
                  className="checkout-guests-btn"
                  disabled={busy}
                  onClick={splitGuestsEvenly}
                >
                  تقسیم مساوی
                </button>
                <button
                  type="button"
                  className="checkout-guests-btn"
                  disabled={busy}
                  onClick={addGuest}
                >
                  + افزودن نفر
                </button>
              </div>
              {guestLines.map((g, idx) => (
                <div key={g.id} className="checkout-guest-row">
                  <div className="checkout-guest-picker">
                    <span className="checkout-guest-label">
                      نفر {toPersianDigits(idx + 1)}
                    </span>
                    <CustomerPicker
                      compact
                      inputId={`guest-customer-${g.id}`}
                      label={`نفر ${toPersianDigits(idx + 1)}`}
                      placeholder="نام یا موبایل…"
                      invoices={invoices}
                      disabled={busy}
                      allowWalkIn
                      walkInName={g.name}
                      value={
                        g.customerId
                          ? { id: g.customerId, name: g.name }
                          : null
                      }
                      onWalkInNameChange={(name) =>
                        updateGuest(g.id, { name, customerId: "" })
                      }
                      onChange={(c) => {
                        if (c) {
                          updateGuest(g.id, {
                            name: c.name,
                            customerId: c.id,
                          });
                        } else {
                          // Keep typed name; only unlink CRM id (input will set walk-in next).
                          updateGuest(g.id, { customerId: "" });
                        }
                      }}
                    />
                  </div>
                  <div className="checkout-guest-controls">
                    <AmountField
                      value={g.amount}
                      disabled={busy}
                      step={5000}
                      onChange={(v) => updateGuest(g.id, { amount: v })}
                    />
                    <div className="checkout-guest-methods">
                      {PAY_METHODS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={`checkout-guest-method${g.method === m ? " is-active" : ""}`}
                          disabled={busy}
                          onClick={() => updateGuest(g.id, { method: m })}
                        >
                          {PAY_METHOD_LABEL[m]}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="checkout-guest-remove"
                      aria-label="حذف"
                      disabled={busy || guestLines.length <= 1}
                      onClick={() => removeGuest(g.id)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!unpaid && payMismatch ? (
            <p className="orders-checkout-split-hint is-error">
              {payRemaining > 0
                ? `باقی‌مانده: ${formatPriceAsNumber(payRemaining)}`
                : `مازاد پرداخت: ${formatPriceAsNumber(Math.abs(payRemaining))}`}
            </p>
          ) : null}

          <label className="checkout-toggle">
            <input
              type="checkbox"
              checked={unpaid}
              disabled={busy || payMode === "guests"}
              onChange={(e) => setUnpaid(e.target.checked)}
            />
            <span className="checkout-toggle-track" aria-hidden="true">
              <span className="checkout-toggle-thumb" />
            </span>
            <span className="checkout-toggle-label">
              ثبت فاکتور بدون پرداخت (بدهکار)
              {payMode === "guests" ? " — در تقسیم بین افراد در دسترس نیست" : ""}
            </span>
          </label>
        </section>

        <section className="orders-checkout-block">
          <h5>تخفیف / کد تخفیف</h5>
          <p className="checkout-coupon-hint">
            کدهای جدید را از تب «کوپن‌ها» در پنل مدیریت بسازید یا بررسی کنید.
          </p>
          <div className="checkout-coupon-row">
            <input
              id="checkout-coupon"
              type="text"
              className="checkout-input"
              placeholder="مثلاً LUMI10"
              value={couponCode}
              disabled={busy}
              onChange={(e) => {
                setCouponCode(e.target.value);
                setAppliedCouponCode("");
                setCouponMsg("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyCoupon();
              }}
            />
            <button
              type="button"
              className="checkout-coupon-apply"
              disabled={busy}
              onClick={applyCoupon}
            >
              اعمال
            </button>
          </div>
          {couponMsg ? (
            <p
              className={`checkout-coupon-msg${couponMsg.includes("نامعتبر") ? " is-error" : " is-ok"}`}
            >
              {couponMsg}
            </p>
          ) : null}
          <div className="orders-checkout-row">
            <CheckoutDropdown
              label="نوع تخفیف"
              value={discountType}
              options={DISCOUNT_OPTIONS}
              disabled={busy}
              onChange={(v) => {
                setDiscountType(v as "" | "percent" | "fixed");
                setAppliedCouponCode("");
                if (!v) setDiscountValue("");
              }}
            />
            <div className="checkout-field">
              <span className="checkout-field-label">مقدار</span>
              <AmountField
                value={discountValue}
                disabled={!discountType || busy}
                step={discountType === "percent" ? 1 : 5000}
                placeholder={discountType === "percent" ? "۱۰" : "۵۰۰۰۰"}
                onChange={setDiscountValue}
              />
            </div>
          </div>
        </section>

        <section className="orders-checkout-block">
          <h5>مالیات</h5>
          <div className="orders-checkout-row">
            <CheckoutDropdown
              label="نوع مالیات"
              value={taxMode}
              options={TAX_OPTIONS}
              disabled={busy}
              onChange={(v) => setTaxMode(v as "percent" | "fixed")}
            />
            <div className="checkout-field">
              <span className="checkout-field-label">
                {taxMode === "percent" ? "درصد مالیات" : "مبلغ مالیات"}
              </span>
              <AmountField
                value={taxValue}
                disabled={busy}
                step={taxMode === "percent" ? 1 : 5000}
                placeholder={taxMode === "percent" ? "۹" : "۰"}
                onChange={setTaxValue}
              />
            </div>
          </div>
        </section>

        <div className="checkout-receipt">
          <div className="checkout-receipt-line">
            <span>جمع جزء</span>
            <strong className="cp-num">{formatPriceAsNumber(subtotal)}</strong>
          </div>
          {totals.discountAmount > 0 ? (
            <div className="checkout-receipt-line is-discount">
              <span>تخفیف</span>
              <strong className="cp-num">
                −{formatPriceAsNumber(totals.discountAmount)}
              </strong>
            </div>
          ) : null}
          {totals.taxAmount > 0 ? (
            <div className="checkout-receipt-line">
              <span>مالیات</span>
              <strong className="cp-num">
                +{formatPriceAsNumber(totals.taxAmount)}
              </strong>
            </div>
          ) : null}
          <div className="checkout-receipt-total">
            <span>مبلغ قابل پرداخت</span>
            <strong className="cp-num">
              {formatPriceAsNumber(totals.total)}
            </strong>
          </div>
          {!unpaid && payMode === "guests" ? (
            <div className="checkout-receipt-meta">
              <span>جمع پرداخت افراد</span>
              <strong className={`cp-num${payMismatch ? " is-error" : ""}`}>
                {formatPriceAsNumber(guestPaidSum)}
              </strong>
            </div>
          ) : null}
        </div>

        <footer className="orders-checkout-actions">
          <button
            type="button"
            className={`orders-primary-btn is-invoice${busy ? " is-loading" : ""}`}
            disabled={
              busy ||
              payMismatch ||
              nameMissing ||
              cardPayOpen ||
              guestPayIndex != null
            }
            onClick={handleSubmit}
          >
            {submitLabel()}
          </button>
          {!unpaid && cardPortion > 0 && !activeTerminal && payMode !== "guests" ? (
            <p className="orders-checkout-hint" style={{ margin: 0, opacity: 0.75, fontSize: "0.85rem" }}>
              پایانه پرداخت تنظیم نشده — کارت به‌صورت دستی ثبت می‌شود. از تب «پایانه‌های پرداخت» یک کارتخوان اضافه کنید.
            </p>
          ) : null}
          <button
            type="button"
            className="cp-btn cp-btn--ghost"
            disabled={busy || cardPayOpen || guestPayIndex != null}
            onClick={onClose}
          >
            انصراف
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {checkoutPortal}
      {activeGuest && guestPayIndex != null && guestPayDraft ? (
        <GuestInvoicePayModal
          open={guestWizardOpen}
          guest={activeGuest}
          index={guestPayIndex}
          total={guestPayDraft.guestSplits?.length || 0}
          table={order?.table}
          hasTerminal={!!activeTerminal}
          busy={guestPayBusy}
          onBack={() => {
            if (guestPayBusy) return;
            if (guestPayIndex <= 0) {
              setGuestPayIndex(null);
              setGuestPayDraft(null);
              return;
            }
            setGuestPayIndex(guestPayIndex - 1);
          }}
          onConfirmCash={() => {
            if (!guestPayDraft || guestPayIndex == null) return;
            advanceGuestPay(guestPayDraft, guestPayIndex);
          }}
          onPayCard={() => {
            if (!activeTerminal) {
              if (!guestPayDraft || guestPayIndex == null) return;
              advanceGuestPay(guestPayDraft, guestPayIndex);
              return;
            }
            setGuestCardOpen(true);
          }}
        />
      ) : null}
      <CardPaymentModal
        open={guestCardOpen && !!activeGuest && guestPayIndex != null}
        amount={activeGuest?.amount || 0}
        invoiceId={
          order?.id
            ? `order:${order.id}:guest:${(guestPayIndex ?? 0) + 1}`
            : "pending"
        }
        terminalId={activeTerminal?.id}
        onClose={() => setGuestCardOpen(false)}
        onChangeMethod={() => setGuestCardOpen(false)}
        onSuccess={({ payment, result }) => {
          const draft = guestPayDraftRef.current;
          const index = guestPayIndexRef.current;
          if (!draft || index == null) return;
          advanceGuestPay(draft, index, {
            paymentId: payment.id,
            referenceNumber:
              result.referenceNumber || payment.referenceNumber || undefined,
            terminalId: payment.terminalId,
            providerTransactionId:
              result.providerTransactionId ||
              payment.providerTransactionId ||
              undefined,
          });
        }}
      />
      <CardPaymentModal
        open={cardPayOpen}
        amount={cardPortion}
        invoiceId={order?.id ? `order:${order.id}` : "pending"}
        terminalId={activeTerminal?.id}
        onClose={() => {
          setCardPayOpen(false);
          setPendingPayload(null);
        }}
        onChangeMethod={() => {
          setCardPayOpen(false);
          setPendingPayload(null);
        }}
        onSuccess={({ payment, result }) => {
          const base = pendingPayload || buildPayload();
          const enriched = base.payments.map((p) =>
            p.method === "card"
              ? {
                  ...p,
                  paymentId: payment.id,
                  referenceNumber:
                    result.referenceNumber || payment.referenceNumber || undefined,
                  terminalId: payment.terminalId,
                  providerTransactionId:
                    result.providerTransactionId ||
                    payment.providerTransactionId ||
                    undefined,
                }
              : p
          );
          setCardPayOpen(false);
          setPendingPayload(null);
          onConfirm({ ...base, payments: enriched });
        }}
      />
    </>
  );
}
