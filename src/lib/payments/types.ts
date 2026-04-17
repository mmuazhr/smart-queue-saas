// =============================================================================
// Payment System Types & Interfaces
// =============================================================================

export type PaymentProviderType = "STRIPE" | "BILLPLZ";

export interface CreatePaymentSessionParams {
  orderId: string;
  amount: number; // In base currency (e.g., 10.50)
  currency: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface PaymentSessionResponse {
  sessionId: string;
  redirectUrl: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  orderId?: string;
  status?: "COMPLETED" | "FAILED";
  rawBody?: any;
}

export interface PaymentProvider {
  createSession(params: CreatePaymentSessionParams): Promise<PaymentSessionResponse>;
  verifyWebhook(req: Request): Promise<WebhookVerificationResult>;
}
