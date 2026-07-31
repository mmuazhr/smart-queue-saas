// =============================================================================
// Billplz (Malaysian FPX) Payment Provider Implementation
// =============================================================================

import crypto from "crypto";
import {
  CreatePaymentSessionParams,
  PaymentProvider,
  PaymentSessionResponse,
  WebhookVerificationResult,
} from "./types";
import { logger } from "@/lib/logger";

const BILLPLZ_API_URL =
  process.env.NODE_ENV === "production"
    ? "https://www.billplz.com/api/v3"
    : "https://www.billplz-sandbox.com/api/v3";

/**
 * Builds the Billplz v3 X-Signature string.
 *
 * Spec: sort all callback parameters alphabetically (excluding x_signature
 * itself), then join as "key|value|key|value|..." — i.e. all key-value pairs
 * concatenated with "|" separators.
 *
 * Exported as a pure function so it can be unit-tested against known vectors.
 */
export function buildBillplzSignatureString(
  params: Record<string, string>
): string {
  return Object.entries(params)
    .filter(([key]) => key !== "x_signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([k, v]) => [k, v])
    .join("|");
}

export class BillplzProvider implements PaymentProvider {
  async createSession(
    params: CreatePaymentSessionParams
  ): Promise<PaymentSessionResponse> {
    const apiKey = process.env.BILLPLZ_API_KEY;
    if (!apiKey) {
      throw new Error(
        "BILLPLZ_API_KEY is not configured. Cannot create Billplz bill."
      );
    }

    const collectionId = process.env.BILLPLZ_COLLECTION_ID;
    if (!collectionId) {
      throw new Error(
        "BILLPLZ_COLLECTION_ID is not configured. Cannot create Billplz bill."
      );
    }

    const auth = Buffer.from(`${apiKey}:`).toString("base64");

    const response = await fetch(`${BILLPLZ_API_URL}/bills`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        collection_id: collectionId,
        email: params.customerEmail || "customer@example.com",
        mobile: params.customerPhone || "",
        name: params.customerName || "Customer",
        amount: Math.round(params.amount * 100),
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
    const signatureKey = process.env.BILLPLZ_X_SIGNATURE_KEY;
    if (!signatureKey) {
      logger.error(
        "BILLPLZ_X_SIGNATURE_KEY is not configured. Cannot verify Billplz webhook."
      );
      return { isValid: false };
    }

    const receivedSignature = req.headers.get("x-signature");
    if (!receivedSignature) {
      return { isValid: false };
    }

    try {
      // Billplz v3 callbacks are application/x-www-form-urlencoded
      const rawBody = await req.text();
      const params = Object.fromEntries(new URLSearchParams(rawBody).entries());

      const signatureString = buildBillplzSignatureString(params);

      const expectedSignature = crypto
        .createHmac("sha256", signatureKey)
        .update(signatureString)
        .digest("hex");

      // Guard against length mismatch before timingSafeEqual (would throw)
      const receivedBuf = Buffer.from(receivedSignature, "utf8");
      const expectedBuf = Buffer.from(expectedSignature, "utf8");

      if (receivedBuf.length !== expectedBuf.length) {
        return { isValid: false };
      }

      const isValid = crypto.timingSafeEqual(receivedBuf, expectedBuf);
      if (!isValid) return { isValid: false };

      return {
        isValid: true,
        orderId: params.reference_1,
        status: params.paid === "true" ? "COMPLETED" : "FAILED",
        rawBody: params,
      };
    } catch (err) {
      logger.error("Billplz Webhook Error:", err);
      return { isValid: false };
    }
  }
}
