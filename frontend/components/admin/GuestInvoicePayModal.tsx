"use client";

import { createPortal } from "react-dom";
import { PAY_METHOD_LABEL } from "@/lib/types";
import { formatPriceAsNumber, toPersianDigits } from "@/lib/format";

export type GuestPayPreview = {
  name: string;
  amount: number;
  method: "cash" | "card";
};

type Props = {
  open: boolean;
  guest: GuestPayPreview;
  index: number;
  total: number;
  table?: string | number;
  hasTerminal: boolean;
  busy?: boolean;
  onBack: () => void;
  onConfirmCash: () => void;
  onPayCard: () => void;
};

export function GuestInvoicePayModal({
  open,
  guest,
  index,
  total,
  table,
  hasTerminal,
  busy,
  onBack,
  onConfirmCash,
  onPayCard,
}: Props) {
  if (!open || typeof document === "undefined") return null;

  const isCard = guest.method === "card";
  const primaryLabel = isCard
    ? hasTerminal
      ? "ارسال به کارتخوان"
      : "ثبت پرداخت کارت"
    : "تأیید دریافت نقدی";

  return createPortal(
    <div
      className="table-glass-overlay guest-pay-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-pay-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onBack();
      }}
    >
      <div
        className="table-glass-dialog menu-glass-dialog guest-pay-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="table-glass-head">
          <div>
            <h4 id="guest-pay-title" className="table-glass-title">
              فاکتور {toPersianDigits(index + 1)} از {toPersianDigits(total)}
            </h4>
            <p className="table-glass-sub">
              {table != null && table !== ""
                ? `میز ${toPersianDigits(String(table))} · `
                : null}
              تأیید پرداخت این نفر
            </p>
          </div>
          <button
            type="button"
            className="table-glass-close"
            aria-label="بازگشت"
            disabled={busy}
            onClick={onBack}
          >
            ×
          </button>
        </header>

        <div className="guest-pay-summary">
          <div className="guest-pay-summary-row">
            <span>مشتری</span>
            <strong>{guest.name || `نفر ${toPersianDigits(index + 1)}`}</strong>
          </div>
          <div className="guest-pay-summary-row">
            <span>روش پرداخت</span>
            <strong>{PAY_METHOD_LABEL[guest.method] || guest.method}</strong>
          </div>
          <div className="guest-pay-summary-row is-total">
            <span>مبلغ فاکتور</span>
            <strong className="cp-num">
              {formatPriceAsNumber(guest.amount)} تومان
            </strong>
          </div>
          <p className="guest-pay-hint">
            {isCard
              ? hasTerminal
                ? "با تأیید، مبلغ به کارتخوان ارسال می‌شود. پس از موفقیت، نفر بعدی باز می‌شود."
                : "پایانه تنظیم نشده — پرداخت کارت به‌صورت دستی ثبت می‌شود."
              : "با تأیید، این سهم به‌عنوان دریافت نقدی ثبت می‌شود."}
          </p>
        </div>

        <footer className="guest-pay-actions">
          <button
            type="button"
            className={`orders-primary-btn is-invoice${busy ? " is-loading" : ""}`}
            disabled={busy}
            onClick={isCard ? onPayCard : onConfirmCash}
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            className="cp-btn cp-btn--ghost"
            disabled={busy}
            onClick={onBack}
          >
            بازگشت
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
