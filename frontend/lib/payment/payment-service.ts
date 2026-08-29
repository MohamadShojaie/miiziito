import { apiJson, cashierHeaders } from "@/lib/api";
import { paymentErrorMessage } from "./payment-errors";
import type {
  PaymentAttempt,
  PaymentRecord,
  PaymentRequest,
  PaymentResult,
  PaymentTerminal,
  ProviderMeta,
  TestResult,
} from "./payment-types";
import { newPaymentId } from "./payment-types";

function auth() {
  return { headers: cashierHeaders() };
}

export async function listPaymentTerminals(): Promise<PaymentTerminal[]> {
  const data = await apiJson<{ terminals?: PaymentTerminal[] }>(
    "/api/payment-terminals",
    auth()
  );
  return Array.isArray(data.terminals) ? data.terminals : [];
}

export async function mutatePaymentTerminal(
  body: Record<string, unknown>
): Promise<{ terminal?: PaymentTerminal; terminals: PaymentTerminal[] }> {
  const data = await apiJson<{
    terminal?: PaymentTerminal;
    terminals?: PaymentTerminal[];
    error?: string;
    message?: string;
  }>("/api/payment-terminals", {
    method: "POST",
    ...auth(),
    body: JSON.stringify(body),
  });
  return {
    terminal: data.terminal,
    terminals: Array.isArray(data.terminals) ? data.terminals : [],
  };
}

export async function listProviders(): Promise<ProviderMeta[]> {
  const data = await apiJson<{ providers?: ProviderMeta[] }>(
    "/api/payment-agent",
    {
      method: "POST",
      ...auth(),
      body: JSON.stringify({ action: "providers" }),
    }
  );
  return Array.isArray(data.providers) ? data.providers : [];
}

export async function testTerminalConnection(
  terminalId: string
): Promise<TestResult> {
  return apiJson<TestResult>("/api/payment-agent", {
    method: "POST",
    ...auth(),
    body: JSON.stringify({ action: "test", terminalId }),
  });
}

export async function discoverTerminals(payload: {
  connectionType?: string;
  provider?: string;
  subnet?: string;
  host?: string;
  port?: number;
}): Promise<{ devices?: unknown[]; message?: string; ok?: boolean }> {
  return apiJson("/api/payment-agent", {
    method: "POST",
    ...auth(),
    body: JSON.stringify({ action: "discover", ...payload }),
  });
}

export async function agentHealth(): Promise<{
  ok: boolean;
  payment?: boolean;
  message?: string;
}> {
  try {
    return await apiJson("/api/payment-agent", {
      method: "POST",
      ...auth(),
      body: JSON.stringify({ action: "health" }),
    });
  } catch {
    return { ok: false, payment: false, message: "AGENT_UNAVAILABLE" };
  }
}

export type SaleOptions = {
  invoiceId: string;
  amount: number;
  terminalId?: string;
  paymentId?: string;
  merchantReference?: string;
  metadata?: Record<string, unknown>;
};

export async function createAndSale(
  options: SaleOptions
): Promise<{ payment: PaymentRecord; result: PaymentResult }> {
  const paymentId = options.paymentId || newPaymentId();
  const data = await apiJson<{
    payment?: PaymentRecord;
    result?: PaymentResult;
    error?: string;
    message?: string;
  }>("/api/payments", {
    method: "POST",
    ...auth(),
    body: JSON.stringify({
      action: "sale",
      paymentId,
      invoiceId: options.invoiceId,
      amount: options.amount,
      currency: "IRT",
      terminalId: options.terminalId || "",
      merchantReference: options.merchantReference || paymentId,
      metadata: options.metadata || {},
    }),
  });
  if (!data.payment || !data.result) {
    throw new Error(
      paymentErrorMessage(data.error || "", data.message || "sale_failed")
    );
  }
  return { payment: data.payment, result: data.result };
}

export async function inquirePayment(
  paymentId: string
): Promise<{ payment: PaymentRecord; result: PaymentResult }> {
  const data = await apiJson<{
    payment?: PaymentRecord;
    result?: PaymentResult;
    error?: string;
    message?: string;
  }>("/api/payments", {
    method: "POST",
    ...auth(),
    body: JSON.stringify({ action: "inquiry", paymentId }),
  });
  if (!data.payment || !data.result) {
    throw new Error(
      paymentErrorMessage(data.error || "", data.message || "inquiry_failed")
    );
  }
  return { payment: data.payment, result: data.result };
}

export async function getPayment(
  paymentId: string
): Promise<PaymentRecord | null> {
  const data = await apiJson<{ payment?: PaymentRecord }>(
    `/api/payments/${encodeURIComponent(paymentId)}`,
    auth()
  );
  return data.payment || null;
}

export async function listPaymentsByInvoice(
  invoiceId: string
): Promise<PaymentRecord[]> {
  const data = await apiJson<{ payments?: PaymentRecord[] }>("/api/payments", {
    method: "POST",
    ...auth(),
    body: JSON.stringify({ action: "list_by_invoice", invoiceId }),
  });
  return Array.isArray(data.payments) ? data.payments : [];
}

export async function listPaymentAttempts(
  paymentId: string
): Promise<PaymentAttempt[]> {
  const data = await apiJson<{ attempts?: PaymentAttempt[] }>("/api/payments", {
    method: "POST",
    ...auth(),
    body: JSON.stringify({ action: "attempts", paymentId }),
  });
  return Array.isArray(data.attempts) ? data.attempts : [];
}

/** Resolve UNKNOWN via inquiry before allowing another sale for the same operation. */
export async function resolveUnknownPayment(
  paymentId: string,
  maxRounds = 3,
  delayMs = 1500
): Promise<{ payment: PaymentRecord; result: PaymentResult }> {
  let last: { payment: PaymentRecord; result: PaymentResult } | null = null;
  for (let i = 0; i < maxRounds; i++) {
    last = await inquirePayment(paymentId);
    const st = last.payment.status;
    if (st === "SUCCESS" || st === "FAILED" || st === "CANCELLED" || st === "REVERSED") {
      return last;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  if (!last) throw new Error(paymentErrorMessage("UNKNOWN_RESULT"));
  return last;
}

export function defaultTerminal(
  terminals: PaymentTerminal[],
  stationId?: string
): PaymentTerminal | null {
  const active = terminals.filter((t) => t.isActive);
  if (stationId) {
    const assigned = active.find((t) => t.stationId === stationId);
    if (assigned) return assigned;
  }
  return active.find((t) => t.isDefault) || active[0] || null;
}

export type CardPaymentUiPhase =
  | "idle"
  | "connecting"
  | "present_card"
  | "waiting"
  | "inquiring"
  | "success"
  | "failed"
  | "unknown";

export function phaseFromStatus(
  status: string,
  opts?: { sent?: boolean }
): CardPaymentUiPhase {
  switch (status) {
    case "CREATED":
    case "INITIATED":
      return "connecting";
    case "SENT_TO_TERMINAL":
      return opts?.sent ? "waiting" : "present_card";
    case "SUCCESS":
      return "success";
    case "FAILED":
    case "CANCELLED":
      return "failed";
    case "UNKNOWN":
    case "PENDING":
      return "inquiring";
    default:
      return "idle";
  }
}

export async function runCardSale(options: SaleOptions): Promise<{
  payment: PaymentRecord;
  result: PaymentResult;
}> {
  const { payment, result } = await createAndSale(options);
  if (payment.status === "UNKNOWN" || result.status === "UNKNOWN") {
    return resolveUnknownPayment(payment.id);
  }
  return { payment, result };
}

export type { PaymentRequest };
