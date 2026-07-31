// =============================================================================
// Stripe Payment Provider Implementation
// =============================================================================

import Stripe from "stripe";
import {
  CreatePaymentSessionParams,
  PaymentProvider,
  PaymentSessionResponse,
  WebhookVerificationResult,
} from "./types";
import { logger } from "@/lib/logger";

let _stripe: Stripe | null = null;

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. Cannot process Stripe payments."
    );
  }
  if (!_stripe) {
    _stripe = new Stripe(key, { apiVersion: Stripe.API_VERSION });
  }
  return _stripe;
}

export class StripeProvider implements PaymentProvider {
  async createSession(
    params: CreatePaymentSessionParams
  ): Promise<PaymentSessionResponse> {
    const stripe = getStripeClient();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "grabpay"],
      line_items: [
        {
          price_data: {
            currency: params.currency.toLowerCase(),
            product_data: {
              name: `Order #${params.orderId}`,
              description: "Smart Queue Payment for Store Order",
            },
            unit_amount: Math.round(params.amount * 100),
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
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error(
        "STRIPE_WEBHOOK_SECRET is not configured. Cannot verify Stripe webhooks."
      );
      return { isValid: false };
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return { isValid: false };
    }

    try {
      const stripe = getStripeClient();
      const rawBody = await req.text();
      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        return {
          isValid: true,
          orderId:
            session.metadata?.orderId ||
            session.client_reference_id ||
            undefined,
          status: "COMPLETED",
          rawBody: event,
        };
      }

      return { isValid: true, rawBody: event };
    } catch (err) {
      logger.error("Stripe Webhook Error:", err);
      return { isValid: false };
    }
  }
}
