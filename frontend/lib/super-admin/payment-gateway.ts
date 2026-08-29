/**
 * Subscription billing payment gateway abstraction.
 * Do not couple platform billing to a single provider.
 * Concrete adapters (Iranian gateways, international, bank transfer, manual)
 * should implement this interface without inventing undocumented protocols.
 */

export type Payment = {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "successful" | "failed" | "cancelled" | "unknown";
  provider: string;
  providerTransactionId?: string | null;
  referenceNumber?: string | null;
  metadata?: Record<string, unknown>;
};

export type PaymentResult = {
  success: boolean;
  payment: Payment;
  message?: string;
};

export type RefundResult = {
  success: boolean;
  payment: Payment;
  message?: string;
};

export type CreatePaymentInput = {
  tenantId: string;
  subscriptionId?: string;
  amount: number;
  currency: string;
  planId?: string;
  billingCycle?: string;
  returnUrl?: string;
  metadata?: Record<string, unknown>;
};

export interface SubscriptionPaymentGateway {
  createPayment(input: CreatePaymentInput): Promise<Payment>;
  verifyPayment(paymentId: string, payload?: Record<string, unknown>): Promise<PaymentResult>;
  refundPayment(paymentId: string, reason?: string): Promise<RefundResult>;
}

/** Manual / offline payments recorded by Super Admin — always available. */
export class ManualSubscriptionGateway implements SubscriptionPaymentGateway {
  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    const id = `pay_manual_${Date.now().toString(16)}`;
    return {
      id,
      amount: input.amount,
      currency: input.currency,
      status: "pending",
      provider: "manual",
      referenceNumber: id,
      metadata: input.metadata,
    };
  }

  async verifyPayment(paymentId: string): Promise<PaymentResult> {
    return {
      success: true,
      payment: {
        id: paymentId,
        amount: 0,
        currency: "IRT",
        status: "successful",
        provider: "manual",
      },
      message: "Manual verification",
    };
  }

  async refundPayment(paymentId: string, reason?: string): Promise<RefundResult> {
    return {
      success: true,
      payment: {
        id: paymentId,
        amount: 0,
        currency: "IRT",
        status: "successful",
        provider: "manual",
        metadata: { refundReason: reason },
      },
    };
  }
}
