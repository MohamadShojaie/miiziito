export type PaymentErrorCode =
  | "TERMINAL_OFFLINE"
  | "UNKNOWN_RESULT"
  | "NOT_CONFIGURED"
  | "INVALID_AMOUNT"
  | "TERMINAL_NOT_FOUND"
  | "TERMINAL_DISABLED"
  | "AUTH_REQUIRED"
  | "RATE_LIMITED"
  | "DUPLICATE_PAYMENT"
  | "INQUIRY_REQUIRED"
  | "AGENT_UNAVAILABLE"
  | "VALIDATION_ERROR"
  | "PROVIDER_ERROR";

export class PaymentError extends Error {
  code: PaymentErrorCode;
  details?: Record<string, unknown>;

  constructor(
    code: PaymentErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
    this.details = details;
  }
}

export function paymentErrorMessage(code: string, fallback?: string): string {
  switch (code) {
    case "TERMINAL_OFFLINE":
      return "کارتخوان در دسترس نیست";
    case "UNKNOWN_RESULT":
      return "وضعیت تراکنش نامشخص است";
    case "NOT_CONFIGURED":
      return "ارائه‌دهنده پرداخت پیکربندی نشده است";
    case "INVALID_AMOUNT":
      return "مبلغ نامعتبر است";
    case "TERMINAL_NOT_FOUND":
      return "پایانه پرداخت یافت نشد";
    case "TERMINAL_DISABLED":
      return "پایانه پرداخت غیرفعال است";
    case "AUTH_REQUIRED":
      return "احراز هویت عامل محلی لازم است";
    case "RATE_LIMITED":
      return "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید";
    case "DUPLICATE_PAYMENT":
      return "این پرداخت قبلاً ثبت شده است";
    case "INQUIRY_REQUIRED":
      return "قبل از تلاش مجدد باید وضعیت تراکنش استعلام شود";
    case "AGENT_UNAVAILABLE":
      return "عامل محلی پرداخت در دسترس نیست";
    case "VALIDATION_ERROR":
      return "درخواست پرداخت نامعتبر است";
    case "PROVIDER_ERROR":
      return "خطای ارائه‌دهنده پرداخت";
    default:
      return fallback || "خطای پرداخت";
  }
}
