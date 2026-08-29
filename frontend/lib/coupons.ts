import type { Coupon } from "./types";

export function normalizeCouponCode(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function couponDiscountLabel(coupon: Coupon): string {
  if (coupon.discountType === "percent") {
    return `${coupon.discountValue}٪`;
  }
  return `${Math.round(coupon.discountValue).toLocaleString("fa-IR")} تومان`;
}

export function couponUsageLimit(coupon: Coupon): number | null {
  const limit = coupon.usageLimit;
  if (limit == null || limit <= 0) return null;
  return limit;
}

export function couponUsedCount(coupon: Coupon): number {
  return Math.max(0, Math.round(Number(coupon.usedCount) || 0));
}

export function isCouponUsageExhausted(coupon: Coupon): boolean {
  const limit = couponUsageLimit(coupon);
  if (!limit) return false;
  return couponUsedCount(coupon) >= limit;
}

export function couponUsageLabel(coupon: Coupon): string | null {
  const limit = couponUsageLimit(coupon);
  if (!limit) return null;
  return `${couponUsedCount(coupon)}/${limit}`;
}

export function validateCoupon(
  coupons: Coupon[],
  code: string,
  now = Date.now()
): { valid: true; coupon: Coupon } | { valid: false; error: string } {
  const key = normalizeCouponCode(code);
  if (!key) return { valid: false, error: "کد را وارد کنید" };

  const coupon = coupons.find((c) => normalizeCouponCode(c.code) === key);
  if (!coupon) return { valid: false, error: "کد نامعتبر است" };
  if (!coupon.active) return { valid: false, error: "این کد غیرفعال است" };
  if (coupon.expiresAt && coupon.expiresAt > 0 && now > coupon.expiresAt) {
    return { valid: false, error: "مهلت این کد تمام شده است" };
  }
  if (isCouponUsageExhausted(coupon)) {
    return { valid: false, error: "سقف استفاده این کد تمام شده است" };
  }
  if (coupon.discountType === "percent") {
    if (coupon.discountValue <= 0 || coupon.discountValue > 100) {
      return { valid: false, error: "مقدار تخفیف نامعتبر است" };
    }
  } else if (coupon.discountValue <= 0) {
    return { valid: false, error: "مقدار تخفیف نامعتبر است" };
  }

  return { valid: true, coupon };
}
