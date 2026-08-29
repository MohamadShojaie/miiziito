import type {
  ConnectionResult,
  PaymentRequest,
  PaymentResult,
  PaymentTerminal,
  TestResult,
} from "./payment-types";

/** Provider-facing terminal operations. POS never calls a concrete PSP directly. */
export interface PaymentTerminalDriver {
  connect(): Promise<ConnectionResult>;
  disconnect(): Promise<void>;
  getStatus(): Promise<{ online: boolean; message?: string }>;
  sale(request: PaymentRequest): Promise<PaymentResult>;
  inquiry(transactionId: string): Promise<PaymentResult>;
  cancel(transactionId: string): Promise<PaymentResult>;
  reversal(transactionId: string): Promise<PaymentResult>;
  refund(transactionId: string): Promise<PaymentResult>;
  testConnection(): Promise<TestResult>;
}

export interface PaymentProvider {
  id: string;
  name: string;
  configured: boolean;
  discover(): Promise<Partial<PaymentTerminal>[]>;
  connect(terminal: PaymentTerminal): Promise<ConnectionResult>;
  sale(request: PaymentRequest, terminal: PaymentTerminal): Promise<PaymentResult>;
  inquiry(
    paymentId: string,
    terminal: PaymentTerminal
  ): Promise<PaymentResult>;
  cancel(paymentId: string, terminal: PaymentTerminal): Promise<PaymentResult>;
  reversal(
    paymentId: string,
    terminal: PaymentTerminal
  ): Promise<PaymentResult>;
  testConnection(terminal: PaymentTerminal): Promise<TestResult>;
}
