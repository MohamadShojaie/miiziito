"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatPriceAsNumber } from "@/lib/format";
import {
  createAndSale,
  newPaymentId,
  paymentErrorMessage,
  resolveUnknownPayment,
  type CardPaymentUiPhase,
  type PaymentRecord,
  type PaymentResult,
} from "@/lib/payment";

export type CardPaymentSuccess = {
  payment: PaymentRecord;
  result: PaymentResult;
};

type Props = {
  open: boolean;
  amount: number;
  invoiceId: string;
  terminalId?: string;
  onClose: () => void;
  onSuccess: (payload: CardPaymentSuccess) => void;
  onChangeMethod?: () => void;
};

function phaseCopy(phase: CardPaymentUiPhase, amount: number): {
  title: string;
  body: string;
} {
  const amt = `${formatPriceAsNumber(amount)} تومان`;
  switch (phase) {
    case "connecting":
      return {
        title: "در حال اتصال به کارت‌خوان…",
        body: `مبلغ:\n${amt}`,
      };
    case "present_card":
    case "waiting":
      return {
        title: "لطفاً کارت خود را وارد یا نزدیک کنید",
        body: `مبلغ:\n${amt}\n\nدر حال دریافت نتیجه تراکنش…`,
      };
    case "inquiring":
      return {
        title: "وضعیت تراکنش نامشخص است",
        body: "در حال بررسی تراکنش…",
      };
    case "success":
      return { title: "پرداخت موفق", body: amt };
    case "failed":
      return { title: "پرداخت ناموفق", body: "" };
    default:
      return { title: "پرداخت با کارت", body: amt };
  }
}

export function CardPaymentModal({
  open,
  amount,
  invoiceId,
  terminalId,
  onClose,
  onSuccess,
  onChangeMethod,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<CardPaymentUiPhase>("idle");
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const paymentIdRef = useRef("");
  const startedRef = useRef(false);
  const inFlight = ["connecting", "present_card", "waiting", "inquiring"].includes(
    phase
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      paymentIdRef.current = "";
      setPhase("idle");
      setPayment(null);
      setResult(null);
      setErrorMsg("");
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    const paymentId = newPaymentId();
    paymentIdRef.current = paymentId;
    void runSale(paymentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function runSale(paymentId: string) {
    setPhase("connecting");
    setErrorMsg("");
    try {
      setPhase("present_card");
      const { payment: pay, result: res } = await createAndSale({
        invoiceId,
        amount,
        terminalId,
        paymentId,
      });
      setPayment(pay);
      setResult(res);

      if (pay.status === "UNKNOWN" || res.status === "UNKNOWN") {
        setPhase("inquiring");
        const resolved = await resolveUnknownPayment(pay.id);
        setPayment(resolved.payment);
        setResult(resolved.result);
        if (resolved.payment.status === "SUCCESS") {
          setPhase("success");
          return;
        }
        if (
          resolved.payment.status === "FAILED" ||
          resolved.payment.status === "CANCELLED"
        ) {
          setPhase("failed");
          setErrorMsg(
            resolved.result.message ||
              paymentErrorMessage(resolved.result.errorCode || "")
          );
          return;
        }
        setPhase("unknown");
        setErrorMsg("وضعیت تراکنش هنوز نامشخص است. لطفاً استعلام را دوباره بزنید.");
        return;
      }

      if (pay.status === "SUCCESS") {
        setPhase("success");
        return;
      }

      setPhase("failed");
      setErrorMsg(
        res.message ||
          paymentErrorMessage(res.errorCode || "") ||
          pay.failureReason ||
          "پرداخت ناموفق"
      );
    } catch (e) {
      setPhase("failed");
      setErrorMsg(e instanceof Error ? e.message : "خطای پرداخت");
    }
  }

  async function retryInquiry() {
    if (!paymentIdRef.current) return;
    setPhase("inquiring");
    try {
      const resolved = await resolveUnknownPayment(paymentIdRef.current);
      setPayment(resolved.payment);
      setResult(resolved.result);
      if (resolved.payment.status === "SUCCESS") setPhase("success");
      else if (
        resolved.payment.status === "FAILED" ||
        resolved.payment.status === "CANCELLED"
      ) {
        setPhase("failed");
        setErrorMsg(resolved.result.message || "پرداخت ناموفق");
      } else {
        setPhase("unknown");
        setErrorMsg("وضعیت همچنان نامشخص است");
      }
    } catch (e) {
      setPhase("unknown");
      setErrorMsg(e instanceof Error ? e.message : "استعلام ناموفق");
    }
  }

  function retrySale() {
    // New paymentId only after confirmed non-success (not UNKNOWN)
    if (payment && ["UNKNOWN", "SENT_TO_TERMINAL", "INITIATED", "PENDING"].includes(payment.status)) {
      void retryInquiry();
      return;
    }
    const paymentId = newPaymentId();
    paymentIdRef.current = paymentId;
    startedRef.current = true;
    void runSale(paymentId);
  }

  if (!open || !mounted) return null;

  const copy = phaseCopy(phase, amount);

  return createPortal(
    <div
      className="table-glass-overlay orders-checkout-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-pay-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !inFlight) onClose();
      }}
    >
      <div
        className="table-glass-dialog menu-glass-dialog"
        style={{ maxWidth: 420, textAlign: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="table-glass-head" style={{ justifyContent: "center" }}>
          <h4 id="card-pay-title" className="table-glass-title">
            {copy.title}
          </h4>
        </header>

        <div style={{ padding: "8px 16px 20px", whiteSpace: "pre-line", lineHeight: 1.7 }}>
          {phase === "success" ? (
            <>
              <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>
                مبلغ: {formatPriceAsNumber(amount)} تومان
              </p>
              <p style={{ margin: "12px 0 0", opacity: 0.8 }}>
                شماره پیگیری:{" "}
                {result?.referenceNumber || payment?.referenceNumber || "—"}
              </p>
            </>
          ) : phase === "failed" ? (
            <>
              <p style={{ margin: 0 }}>دلیل:</p>
              <p style={{ margin: "8px 0 0", opacity: 0.85 }}>{errorMsg || "—"}</p>
            </>
          ) : (
            <p style={{ margin: 0 }}>{copy.body}</p>
          )}
        </div>

        <footer
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            flexWrap: "wrap",
            paddingBottom: 12,
          }}
        >
          {phase === "success" ? (
            <button
              type="button"
              className="cp-btn cp-btn-primary"
              onClick={() => {
                if (payment && result) onSuccess({ payment, result });
              }}
            >
              تکمیل سفارش
            </button>
          ) : null}
          {phase === "failed" ? (
            <>
              <button type="button" className="cp-btn cp-btn-primary" onClick={retrySale}>
                تلاش مجدد
              </button>
              {onChangeMethod ? (
                <button type="button" className="cp-btn" onClick={onChangeMethod}>
                  تغییر روش پرداخت
                </button>
              ) : null}
              <button type="button" className="cp-btn" onClick={onClose}>
                بستن
              </button>
            </>
          ) : null}
          {phase === "unknown" ? (
            <>
              <button type="button" className="cp-btn cp-btn-primary" onClick={retryInquiry}>
                استعلام مجدد
              </button>
              <button type="button" className="cp-btn" onClick={onClose} disabled={inFlight}>
                بستن
              </button>
            </>
          ) : null}
          {inFlight ? (
            <button type="button" className="cp-btn" disabled>
              لطفاً صبر کنید…
            </button>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body
  );
}
