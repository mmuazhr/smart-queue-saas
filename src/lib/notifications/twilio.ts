// =============================================================================
// Twilio Notification Provider
// =============================================================================

import twilio from "twilio";
import { NotificationProvider, SendNotificationParams } from "./types";

export class TwilioNotificationProvider implements NotificationProvider {
  private client: twilio.Twilio;
  private fromNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_FROM_NUMBER || "";

    if (!accountSid || !authToken || !this.fromNumber) {
      throw new Error("Twilio configuration missing in environment variables.");
    }

    this.client = twilio(accountSid, authToken);
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

      const message = await this.client.messages.create({
        body: messageBody,
        from: this.fromNumber,
        to: toPhone
      });

      return {
        success: true,
        externalId: message.sid
      };
    } catch (error: any) {
      console.error("Twilio Notification Error:", error);
      return {
        success: false,
        error: error.message || "Failed to send Twilio message"
      };
    }
  }
}
