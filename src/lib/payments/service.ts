// =============================================================================
// Payment Orchestration Service
// =============================================================================

import { StripeProvider } from "./stripe";
import { BillplzProvider } from "./billplz";
import { CreatePaymentSessionParams, PaymentProvider, PaymentProviderType, WebhookVerificationResult } from "./types";

/**
 * Whether the environment holds the credentials a gateway needs to create a
 * session. Callers check this before persisting an order so a misconfigured
 * deployment answers with a clear error instead of a 500 plus an orphan
 * PENDING_PAYMENT row.
 */
export function isPaymentProviderConfigured(provider: PaymentProviderType): boolean {
  switch (provider) {
    case "STRIPE":
      return Boolean(process.env.STRIPE_SECRET_KEY);
    case "BILLPLZ":
      return Boolean(process.env.BILLPLZ_API_KEY && process.env.BILLPLZ_COLLECTION_ID);
    default:
      return false;
  }
}

export class PaymentService {
  private static providers: Record<PaymentProviderType, PaymentProvider> = {
    STRIPE: new StripeProvider(),
    BILLPLZ: new BillplzProvider(),
  };

  static async initiatePayment(
    provider: PaymentProviderType,
    params: CreatePaymentSessionParams
  ) {
    const p = this.providers[provider];
    if (!p) throw new Error(`Unsupported payment provider: ${provider}`);
    return p.createSession(params);
  }

  static async handleWebhook(
    provider: string,
    req: Request
  ): Promise<WebhookVerificationResult> {
    const providerType = provider.toUpperCase() as PaymentProviderType;
    const p = this.providers[providerType];
    
    if (!p) {
      console.warn(`Webhook received for unknown provider: ${provider}`);
      return { isValid: false };
    }

    return p.verifyWebhook(req);
  }
}
