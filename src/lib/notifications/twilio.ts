// =============================================================================
// Twilio Notification Provider
// =============================================================================
// Uses raw fetch instead of the Twilio SDK (originally to fit Cloudflare
// Worker bundle limits — constraint gone since the 2026-08 Railway
// migration, but the lean approach stays).

import { NotificationProvider, SendNotificationParams } from "./types";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

export class TwilioNotificationProvider implements NotificationProvider {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_FROM_NUMBER || "";

    if (!accountSid || !authToken || !this.fromNumber) {
      throw new Error("Twilio configuration missing in environment variables.");
    }

    this.accountSid = accountSid;
    this.authToken = authToken;
  }

  private generateMessageBody(params: SendNotificationParams): string {
    const { type, customerName, storeName, orderNumber, orderUrl } = params;

    switch (type) {
      case "CONFIRMED":
        return `Hi ${customerName}, your order #${orderNumber} at ${storeName} has been received and confirmed! Tracking link: ${orderUrl}`;
      case "READY":
        return `Great news ${customerName}! Your order #${orderNumber} at ${storeName} is READY for pickup. See you soon!`;
      case "CANCELLED":
        return `Hi ${customerName}, unfortunately your order #${orderNumber} at ${storeName} has been cancelled.`;
      default:
        return `Update regarding your order #${orderNumber} at ${storeName}. Tracking link: ${orderUrl}`;
    }
  }

  async send(params: SendNotificationParams): Promise<{ success: boolean; externalId?: string; error?: string }> {
    try {
      const messageBody = this.generateMessageBody(params);

      // Support for WhatsApp if the fromNumber starts with 'whatsapp:'
      // Ensure the recipient number is also formatted correctly for WhatsApp if so configured
      const isWhatsApp = this.fromNumber.startsWith("whatsapp:");
      const toPhone = isWhatsApp && !params.recipientPhone.startsWith("whatsapp:")
        ? `whatsapp:${params.recipientPhone}`
        : params.recipientPhone;

      const res = await fetch(
        `${TWILIO_API_BASE}/Accounts/${this.accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            Body: messageBody,
            From: this.fromNumber,
            To: toPhone,
          }),
        }
      );

      const data = (await res.json()) as { sid?: string; message?: string };

      if (!res.ok) {
        return {
          success: false,
          error: data.message || `Twilio API error (HTTP ${res.status})`,
        };
      }

      return {
        success: true,
        externalId: data.sid,
      };
    } catch (error: unknown) {
      console.error("Twilio Notification Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send Twilio message",
      };
    }
  }
}
