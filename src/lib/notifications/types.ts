// =============================================================================
// Notification Service Interface & Types
// =============================================================================

export type NotificationChannel = "WHATSAPP" | "SMS";

export interface SendNotificationParams {
  recipientPhone: string;
  customerName: string;
  storeName: string;
  orderNumber: string | number;
  type: "CONFIRMED" | "READY" | "CANCELLED";
  orderUrl?: string;
}

export interface NotificationProvider {
  send(params: SendNotificationParams): Promise<{ success: boolean; externalId?: string; error?: string }>;
}
