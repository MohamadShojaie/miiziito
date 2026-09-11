export const PLAN_FEATURES = [
  "invoices",
  "reservations",
  "coupons",
  "advancedAnalytics",
  "paymentTerminal",
  "crm",
  "hardware",
  "kitchenPrint",
  "tableOps",
  "menuCosting",
  "staffOps",
] as const;

export type PlanFeature = (typeof PLAN_FEATURES)[number];

export type PlanEntitlements = Record<PlanFeature, boolean>;

export type PlanAccess = {
  planId: string;
  planName: string;
  entitlements: PlanEntitlements;
};

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  invoices: "فاکتور",
  reservations: "رزرو میز",
  coupons: "کوپن",
  advancedAnalytics: "آمار فروش",
  paymentTerminal: "پایانه پرداخت",
  crm: "باشگاه مشتریان",
  hardware: "سخت‌افزار و پرینتر",
  kitchenPrint: "چاپ تیکت آشپزخانه و بار",
  tableOps: "وضعیت میز و سفارش از نقشه میزها",
  menuCosting: "هزینه‌یابی منو",
  staffOps: "مدیریت پرسنل و چک‌لیست",
};

export const TAB_FEATURE: Record<string, PlanFeature> = {
  invoices: "invoices",
  reservations: "reservations",
  stats: "advancedAnalytics",
  customers: "crm",
  coupons: "coupons",
  hardware: "hardware",
  payments: "paymentTerminal",
  costing: "menuCosting",
  staff: "staffOps",
};

function flags(value: boolean): PlanEntitlements {
  return {
    invoices: value,
    reservations: value,
    coupons: value,
    advancedAnalytics: value,
    paymentTerminal: value,
    crm: value,
    hardware: value,
    kitchenPrint: value,
    tableOps: value,
    menuCosting: value,
    staffOps: value,
  };
}

export const LOCKED_ENTITLEMENTS = flags(false);
export const UNLOCKED_ENTITLEMENTS = flags(true);

export const UNLOCKED_ACCESS: PlanAccess = {
  planId: "",
  planName: "",
  entitlements: UNLOCKED_ENTITLEMENTS,
};

export function normalizePlanAccess(raw: unknown): PlanAccess {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const entRaw =
    src.entitlements && typeof src.entitlements === "object"
      ? (src.entitlements as Record<string, unknown>)
      : {};
  const entitlements = { ...LOCKED_ENTITLEMENTS };
  for (const key of PLAN_FEATURES) {
    if (Object.prototype.hasOwnProperty.call(entRaw, key)) {
      entitlements[key] = Boolean(entRaw[key]);
    }
  }
  // Compat: older API payloads omit tableOps — infer from plan tier.
  if (!Object.prototype.hasOwnProperty.call(entRaw, "tableOps")) {
    const planId = String(src.planId || "");
    if (!planId) {
      entitlements.tableOps = true;
    } else if (planId === "plan_basic") {
      entitlements.tableOps = false;
    } else {
      entitlements.tableOps = Boolean(
        entRaw.invoices || entRaw.reservations || entRaw.paymentTerminal
      );
    }
  }
  // Compat: older plans omit menuCosting — only highest (business) tier.
  if (!Object.prototype.hasOwnProperty.call(entRaw, "menuCosting")) {
    const planId = String(src.planId || "");
    if (!planId) {
      entitlements.menuCosting = true;
    } else if (planId === "plan_business") {
      entitlements.menuCosting = true;
    } else {
      entitlements.menuCosting = Boolean(
        entRaw.crm && entRaw.hardware && entRaw.kitchenPrint
      );
    }
  }
  // Compat: older plans omit staffOps — business tier only.
  if (!Object.prototype.hasOwnProperty.call(entRaw, "staffOps")) {
    const planId = String(src.planId || "");
    if (!planId) {
      entitlements.staffOps = true;
    } else if (planId === "plan_business") {
      entitlements.staffOps = true;
    } else {
      entitlements.staffOps = Boolean(
        entRaw.menuCosting || (entRaw.crm && entRaw.hardware && entRaw.kitchenPrint)
      );
    }
  }
  return {
    planId: String(src.planId || ""),
    planName: String(src.planName || ""),
    entitlements,
  };
}

export function hasPlanFeature(access: PlanAccess | null | undefined, feature: PlanFeature): boolean {
  if (!access) return true;
  return Boolean(access.entitlements[feature]);
}
