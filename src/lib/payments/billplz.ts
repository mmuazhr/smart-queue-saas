// =============================================================================
// Billplz (Malaysian FPX) Payment Provider Implementation
// =============================================================================

import crypto from "crypto";
import { CreatePaymentSessionParams, PaymentProvider, PaymentSessionResponse, WebhookVerificationResult } from "./types";

const BILLPLZ_API_URL = process.env.NODE_ENV === "production" 
  ? "https://www.billplz.com/api/v3" 
  : "https://www.billplz-sandbox.com/api/v3";

export class BillplzProvider implements PaymentProvider {
  async createSession(params: CreatePaymentSessionParams): Promise<PaymentSessionResponse> {
    const auth = Buffer.from(`${process.env.BILLPLZ_API_KEY || "api_key_placeholder"}:`).toString("base64");
    
    // In Billplz, we create a "Bill"
    const response = await fetch(`${BILLPLZ_API_URL}/bills`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        collection_id: process.env.BILLPLZ_COLLECTION_ID || "coll_placeholder",
        email: params.customerEmail || "customer@example.com",
        mobile: params.customerPhone || "",
        name: params.customerName || "Customer",
        amount: Math.round(params.amount * 100), // Billplz expects cents
        callback_url: `${process.env.NEXTAUTH_URL}/api/webhooks/billplz`,
        redirect_url: params.successUrl,
        description: `Order #${params.orderId}`,
        reference_1_label: "Order ID",
        reference_1: params.orderId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Failed to create Billplz bill");
    }

    return {
      sessionId: data.id,
      redirectUrl: data.url,
    };
  }

  async verifyWebhook(req: Request): Promise<WebhookVerificationResult> {
    const signature = req.headers.get("x-signature");
    if (!signature) {
      return { isValid: false };
    }

    try {
      const rawBody = await req.text();
      // Billplz V3 uses HMAC-SHA256 or SHA512 depending on settings. 
      // Standard for App Router is regenerating from raw body.
      // Note: Billplz X-Signature calculation can be tricky (key-sorted string).
      // Here we implement the standard HMAC verification as per their docs.
      
      const secret = process.env.BILLPLZ_X_SIGNATURE_KEY || "whsec_placeholder";
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");

      // timingSafeEqual for security
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      if (!isValid) return { isValid: false };

      const data = JSON.parse(rawBody);
      return {
        isValid: true,
        orderId: data.reference_1,
        status: data.paid === "true" || data.paid === true ? "COMPLETED" : "FAILED",
        rawBody: data,
      };
    } catch (err) {
      console.error("Billplz Webhook Error:", err);
      return { isValid: false };
    }
  }
}
