// =============================================================================
// Notification Service Orchestrator
// =============================================================================

import { NotificationProvider, SendNotificationParams } from "./types";
import { logger } from "@/lib/logger";

/** Masks a phone number to show only the last 4 digits: +60•••1234 */
function maskPhone(phone: string): string {
  if (phone.length <= 4) return "••••";
  return `${phone.slice(0, phone.startsWith("+") ? 3 : 1)}•••${phone.slice(-4)}`;
}

/**
 * Mock provider for local development — logs to console without PII.
 */
class ConsoleNotificationProvider implements NotificationProvider {
  async send(params: SendNotificationParams) {
    logger.info("[NOTIF_SENT]", {
      to: maskPhone(params.recipientPhone),
      type: params.type,
      order: params.orderNumber,
      store: params.storeName,
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
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        NotificationService.provider = new TwilioNotificationProvider();
        logger.info("[NOTIF_ORCHESTRATOR] Initialized Twilio Provider");
      } catch (err) {
        logger.error(
          "[NOTIF_ORCHESTRATOR] Twilio init failed, falling back to ConsoleProvider",
          err
        );
        NotificationService.provider = new ConsoleNotificationProvider();
      }
    } else {
      logger.info("[NOTIF_ORCHESTRATOR] Using Console Notification Provider (Local Dev)");
      NotificationService.provider = new ConsoleNotificationProvider();
    }
  }

  static async sendOrderReady(params: Omit<SendNotificationParams, "type">) {
    return NotificationService.provider.send({ ...params, type: "READY" });
  }

  static async sendOrderConfirmed(params: Omit<SendNotificationParams, "type">) {
    return NotificationService.provider.send({ ...params, type: "CONFIRMED" });
  }

  static async sendOrderCancelled(params: Omit<SendNotificationParams, "type">) {
    return NotificationService.provider.send({ ...params, type: "CANCELLED" });
  }
}
