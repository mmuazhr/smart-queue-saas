// =============================================================================
// Payment Orchestration Service
// =============================================================================

import { StripeProvider } from "./stripe";
import { BillplzProvider } from "./billplz";
import { CreatePaymentSessionParams, PaymentProvider, PaymentProviderType, WebhookVerificationResult } from "./types";

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
