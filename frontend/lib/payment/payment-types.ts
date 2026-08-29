/** System of record: IRT (تومان) integers. Convert to Rial only inside adapters if a vendor requires it. */

export type PaymentCurrency = "IRT" | "IRR";

export type PaymentStatus =
  | "CREATED"
  | "INITIATED"
  | "SENT_TO_TERMINAL"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "REVERSED"
  | "UNKNOWN"
  | "PENDING";

export type PaymentResultStatus =
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "REVERSED"
  | "UNKNOWN"
  | "PENDING";

export type TerminalConnectionType =
  | "network"
  | "usb"
  | "serial"
  | "bluetooth"
  | "android";

export type TerminalProtocol = "tcp" | "http" | "https" | "websocket" | "vendor";

export type PaymentProviderId =
  | "generic"
  | "simulator"
  | "radian"
  | "behpardakht"
  | "saman"
  | "irankish"
  | "pasargad";

export type PaymentTerminal = {
  id: string;
  name: string;
  provider: PaymentProviderId | string;
  model: string;
  connectionType: TerminalConnectionType;
  host: string;
  port: string;
  protocol: TerminalProtocol | string;
  serialPort: string;
  baudRate: number;
  dataBits: number;
  parity: "none" | "even" | "odd" | string;
  stopBits: number;
  flowControl: "none" | "hardware" | "software" | string;
  bluetoothIdentifier: string;
  configuration: Record<string, unknown>;
  isActive: boolean;
  isDefault: boolean;
  stationId: string;
  assignedUserId: string;
  connectionTimeoutMs: number;
  requestTimeoutMs: number;
  createdAt: number;
  updatedAt: number;
};

export type PaymentRequest = {
  paymentId: string;
  invoiceId: string;
  amount: number;
  currency: PaymentCurrency;
  terminalId: string;
  createdAt: string;
  merchantReference?: string;
  metadata?: Record<string, unknown>;
};

export type PaymentResult = {
  success: boolean;
  status: PaymentResultStatus;
  paymentId: string;
  invoiceId: string;
  amount: number;
  providerTransactionId?: string;
  referenceNumber?: string;
  terminalId: string;
  responseCode?: string;
  message?: string;
  timestamp: string;
  rawResponse?: unknown;
  errorCode?: string;
};

export type PaymentRecord = {
  id: string;
  invoiceId: string;
  terminalId: string;
  provider: string;
  amount: number;
  currency: PaymentCurrency;
  status: PaymentStatus;
  providerTransactionId?: string;
  referenceNumber?: string;
  responseCode?: string;
  failureReason?: string;
  merchantReference?: string;
  message?: string;
  createdAt: number;
  updatedAt: number;
};

export type PaymentAttempt = {
  id: string;
  paymentId: string;
  attemptNumber: number;
  status: PaymentStatus | PaymentResultStatus | string;
  requestMetadata?: Record<string, unknown>;
  responseMetadata?: Record<string, unknown>;
  startedAt: number;
  completedAt?: number;
};

export type ConnectionResult = {
  ok: boolean;
  online?: boolean;
  message?: string;
  error?: string;
};

export type TestResult = {
  ok: boolean;
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
};

export type ProviderMeta = {
  id: PaymentProviderId | string;
  name: string;
  configured: boolean;
  description?: string;
};

export const PAYMENT_STATUSES_IN_FLIGHT: PaymentStatus[] = [
  "CREATED",
  "INITIATED",
  "SENT_TO_TERMINAL",
  "UNKNOWN",
  "PENDING",
];

export const PAYMENT_PROVIDER_OPTIONS: ProviderMeta[] = [
  {
    id: "simulator",
    name: "شبیه‌ساز (توسعه)",
    configured: true,
    description: "برای تست جریان پرداخت بدون سخت‌افزار واقعی",
  },
  {
    id: "generic",
    name: "عمومی / شبکه",
    configured: false,
    description: "اتصال شبکه عمومی — پروتکل پرداخت پیکربندی نشده",
  },
  {
    id: "radian",
    name: "رادین (Radian)",
    configured: false,
    description: "نیاز به مستندات رسمی یکپارچه‌سازی",
  },
  {
    id: "behpardakht",
    name: "به‌پرداخت",
    configured: false,
  },
  {
    id: "saman",
    name: "سامان",
    configured: false,
  },
  {
    id: "irankish",
    name: "ایران‌کیش",
    configured: false,
  },
  {
    id: "pasargad",
    name: "پاسارگاد",
    configured: false,
  },
];

export const CONNECTION_TYPE_OPTIONS: Array<{
  id: TerminalConnectionType;
  title: string;
}> = [
  { id: "network", title: "شبکه (LAN / TCP)" },
  { id: "usb", title: "USB" },
  { id: "serial", title: "سریال / COM" },
  { id: "bluetooth", title: "بلوتوث" },
  { id: "android", title: "Android Smart POS" },
];

export function providerLabel(id: string): string {
  return PAYMENT_PROVIDER_OPTIONS.find((p) => p.id === id)?.name || id;
}

export function connectionTypeLabel(id: string): string {
  return CONNECTION_TYPE_OPTIONS.find((c) => c.id === id)?.title || id;
}

export function isProviderConfigured(id: string): boolean {
  return !!PAYMENT_PROVIDER_OPTIONS.find((p) => p.id === id)?.configured;
}

export function newPaymentId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
  return `pay_${rand}`;
}
