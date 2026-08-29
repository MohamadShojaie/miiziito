"use client";

import { createPortal } from "react-dom";
import type { Invoice } from "@/lib/types";
import { PAY_METHOD_LABEL } from "@/lib/types";
import { formatPriceAsNumber, toPersianDigits } from "@/lib/format";

type Props = {
  open: boolean;
  invoices: Invoice[];
  onClose: () => void;
  onViewInvoices: () => void;
};

export function SplitInvoicesResultModal({
  open,
  invoices,
  onClose,
  onViewInvoices,
}: Props) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="table-glass-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="split-invoices-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="table-glass-dialog menu-glass-dialog"
        style={{ maxWidth: 460 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="table-glass-head">
          <div>
            <h4 id="split-invoices-title" className="table-glass-title">
              {toPersianDigits(invoices.length)} فاکتور جدا ثبت شد
            </h4>
            <p className="table-glass-sub">
              هر نفر فاکتور و روش پرداخت خودش را دارد
            </p>
          </div>
          <button
            type="button"
            className="table-glass-close"
            aria-label="بستن"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <ul className="split-invoices-list">
          {invoices.map((inv, idx) => (
            <li key={inv.id || idx} className="split-invoices-row">
              <div>
                <strong>
                  فاکتور {toPersianDigits(String(inv.number ?? idx + 1))}
                </strong>
                <small>{inv.customerName || "—"}</small>
              </div>
              <div className="split-invoices-meta">
                <span>
                  {PAY_METHOD_LABEL[inv.payMethod || ""] || inv.payMethod || "—"}
                </span>
                <strong className="cp-num">
                  {formatPriceAsNumber(inv.total || 0)}
                </strong>
              </div>
            </li>
          ))}
        </ul>

        <footer className="menu-glass-actions">
          <button type="button" className="cp-btn cp-btn--ghost" onClick={onClose}>
            بستن
          </button>
          <button
            type="button"
            className="cp-btn cp-btn--primary"
            onClick={onViewInvoices}
          >
            مشاهده فاکتورها
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
