// =============================================================================
// Notification Service Orchestrator
// =============================================================================

import { NotificationProvider, SendNotificationParams } from "./types";

/**
 * Mock provider for local development - just logs to console
 */
class ConsoleNotificationProvider implements NotificationProvider {
  async send(params: SendNotificationParams) {
    console.log("🔔 [NOTIF_SENT]", {
      to: params.recipientPhone,
      message: `Order #${params.orderNumber} for ${params.customerName} at ${params.storeName} is ${params.type}. Tracking: ${params.orderUrl || 'N/A'}`
    });
    return { success: true, externalId: `mock_${Date.now()}` };
  }
}

import { TwilioNotificationProvider } from "./twilio";

/**
 * Main Service Orchestrator
 */
export class NotificationService {
  private static provider: NotificationProvider;

  static {
    // Determine provider based on environment variables
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        this.provider = new TwilioNotificationProvider();
        console.log("🚀 [NOTIF_ORCHESTRATOR] Initialized Twilio Provider");
      } catch (err) {
        console.error("⚠️ [NOTIF_ORCHESTRATOR] Twilio init failed, falling back to ConsoleProvider", err);
        this.provider = new ConsoleNotificationProvider();
      }
    } else {
      console.log("ℹ️ [NOTIF_ORCHESTRATOR] Using Console Notification Provider (Local Dev)");
      this.provider = new ConsoleNotificationProvider();
    }
  }

  static async sendOrderReady(params: Omit<SendNotificationParams, "type">) {
    return this.provider.send({
      ...params,
      type: "READY"
    });
  }

  static async sendOrderConfirmed(params: Omit<SendNotificationParams, "type">) {
    return this.provider.send({
      ...params,
      type: "CONFIRMED"
    });
  }

  static async sendOrderCancelled(params: Omit<SendNotificationParams, "type">) {
    return this.provider.send({
      ...params,
      type: "CANCELLED"
    });
  }
}
