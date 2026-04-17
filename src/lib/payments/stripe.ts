// =============================================================================
// Stripe Payment Provider Implementation
// =============================================================================

import Stripe from "stripe";
import { CreatePaymentSessionParams, PaymentProvider, PaymentSessionResponse, WebhookVerificationResult } from "./types";

if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
  console.warn("WARNING: Missing STRIPE_SECRET_KEY. Payments will fail in production.");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2024-12-18.acacia" as any, 
});

export class StripeProvider implements PaymentProvider {
  async createSession(params: CreatePaymentSessionParams): Promise<PaymentSessionResponse> {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "grabpay"], // Common in SE Asia
      line_items: [
        {
          price_data: {
            currency: params.currency.toLowerCase(),
            product_data: {
              name: `Order #${params.orderId}`,
              description: `Smart Queue Payment for Store Order`,
            },
            unit_amount: Math.round(params.amount * 100), // Stripe expects cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.orderId,
      customer_email: params.customerEmail,
      metadata: {
        orderId: params.orderId,
      },
    });

    if (!session.url) {
      throw new Error("Failed to create Stripe session URL");
    }

    return {
      sessionId: session.id,
      redirectUrl: session.url,
    };
  }

  async verifyWebhook(req: Request): Promise<WebhookVerificationResult> {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return { isValid: false };
    }

    try {
      const rawBody = await req.text();
      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || "whsec_placeholder"
      );

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        return {
          isValid: true,
          orderId: session.metadata?.orderId || session.client_reference_id || undefined,
          status: "COMPLETED",
          rawBody: event,
        };
      }

      return { isValid: true, rawBody: event };
    } catch (err) {
      console.error("Stripe Webhook Error:", err);
      return { isValid: false };
    }
  }
}
