/** Super Admin API types */

export type AdminUser = {
  id: string;
  email: string;
  username?: string;
  name?: string;
  roleId: string;
  roleName?: string;
  permissions: string[];
  status: string;
  lastLoginAt?: string | null;
};

export type CafeStatus =
  | "active"
  | "trial"
  | "expired"
  | "suspended"
  | "cancelled"
  | "pending";

export type CafeSettings = {
  cashierPassword?: string;
  hasCashierPassword?: boolean;
};

export type CafeCashierAuth = {
  hasPassword: boolean;
};

export type Cafe = {
  id: string;
  name: string;
  slug?: string;
  ownerName: string;
  email: string;
  phone: string;
  status: CafeStatus;
  planId?: string | null;
  subscriptionId?: string | null;
  settings?: CafeSettings;
  usage?: Record<string, number>;
  lastActivityAt?: string | null;
  createdAt: string;
  updatedAt: string;
  cashierAuth?: CafeCashierAuth;
};

export type Plan = {
  id: string;
  name: string;
  description: string;
  status: string;
  displayOrder: number;
  entitlements: Record<string, number | boolean>;
  prices: { monthly: number; "6months": number; yearly: number };
  createdAt: string;
  updatedAt: string;
};

export type Subscription = {
  id: string;
  tenantId: string;
  planId: string;
  billingCycle: "monthly" | "6months" | "yearly";
  status: string;
  price: number;
  currency: string;
  startDate?: string;
  endDate?: string;
  trialEndDate?: string | null;
  autoRenew: boolean;
  paymentStatus: string;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaasPayment = {
  id: string;
  tenantId: string;
  subscriptionId?: string | null;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  referenceNumber?: string;
  paymentMethod: string;
  planId?: string;
  billingCycle?: string;
  createdAt: string;
};

export type KpiValue = { value: number; change: number | null };

export type DashboardData = {
  kpis: Record<string, KpiValue>;
  expiringSoon: Subscription[];
  popularPlans: { planId: string; count: number }[];
  recentPayments: SaasPayment[];
};

export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type SupportTicket = {
  id: string;
  tenantId?: string;
  cafeName?: string;
  cafeOwnerName?: string;
  cafeOwnerEmail?: string;
  subject: string;
  priority: string;
  status: string;
  assignedAdminId?: string;
  needsAdminReply?: boolean;
  isNew?: boolean;
  lastMessageFrom?: string | null;
  attentionRank?: number;
  adminReadAt?: string | null;
  messages?: {
    id: string;
    from: string;
    body: string;
    createdAt: string;
    payload?: Record<string, unknown>;
  }[];
  createdAt: string;
  updatedAt: string;
  lastReplyAt?: string | null;
  lastActivityAt?: string | null;
};

export type AuditLog = {
  id: string;
  adminId?: string;
  adminEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type Coupon = {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  startDate?: string | null;
  endDate?: string | null;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  usedCount: number;
  applicablePlans: string[];
  minimumPayment: number;
  status: string;
};

export type HealthService = {
  name: string;
  status: "healthy" | "warning" | "critical" | string;
  detail: string;
};
