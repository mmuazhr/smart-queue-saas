// =============================================================================
// Smart Queue Web System — Shared TypeScript Types
// =============================================================================

// ---- Enums ----

export enum UserRole {
  CUSTOMER = "CUSTOMER",
  MERCHANT = "MERCHANT",
  ADMIN = "ADMIN",
}

export enum StoreStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  CLOSED = "CLOSED",
}

export enum OrderStatus {
  PENDING_PAYMENT = "PENDING_PAYMENT",
  PAID = "PAID",
  ACCEPTED = "ACCEPTED",
  PREPARING = "PREPARING",
  READY = "READY",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum PaymentStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

export enum PaymentGateway {
  STRIPE = "STRIPE",
  BILLPLZ = "BILLPLZ",
  TOYYIBPAY = "TOYYIBPAY",
}

export enum NotificationChannel {
  WHATSAPP = "WHATSAPP",
  SMS = "SMS",
}

export enum NotificationType {
  ORDER_CONFIRMED = "ORDER_CONFIRMED",
  ORDER_READY = "ORDER_READY",
  ORDER_CANCELLED = "ORDER_CANCELLED",
}

export enum NotificationStatus {
  PENDING = "PENDING",
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
}

// ---- Interfaces ----

export interface OperatingHours {
  [day: string]: {
    open: string; // "09:00"
    close: string; // "22:00"
    isClosed: boolean;
  };
}

export interface Store {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  status: StoreStatus;
  avgPrepTimeMins: number;
  maxConcurrentOrders: number;
  operatingHours: OperatingHours | null;
  qrCodeUrl: string | null;
  paymentGateway: PaymentGateway | null;
  gatewayMerchantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  storeId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuItem {
  id: string;
  storeId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  prepTimeMins: number | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  storeId: string;
  customerPhone: string;
  customerName: string;
  queueNumber: number | null;
  status: OrderStatus;
  subtotal: number;
  tax: number;
  total: number;
  estimatedWaitMins: number | null;
  paymentIntentId: string | null;
  paymentGateway: PaymentGateway | null;
  paymentStatus: PaymentStatus;
  notes: string | null;
  paidAt: Date | null;
  acceptedAt: Date | null;
  preparingAt: Date | null;
  readyAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  itemName: string;
  itemPrice: number;
  quantity: number;
  lineTotal: number;
  specialInstructions: string | null;
}

export interface Notification {
  id: string;
  orderId: string;
  recipientPhone: string;
  channel: NotificationChannel;
  type: NotificationType;
  status: NotificationStatus;
  messageBody: string;
  externalId: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

export interface DailyQueueCounter {
  id: string;
  storeId: string;
  queueDate: Date;
  lastQueueNumber: number;
}

// ---- Cart Types (Client-side) ----

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  specialInstructions: string;
}

export interface Cart {
  storeSlug: string;
  items: CartItem[];
}

// ---- API Response Types ----

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;
}

// ---- SSE Event Types ----

export interface QueueUpdateEvent {
  orderId: string;
  status: OrderStatus;
  queueNumber: number | null;
  queuePosition: number | null;
  estimatedWaitMins: number | null;
}

export interface StoreQueueEvent {
  type: "ORDER_CREATED" | "ORDER_UPDATED" | "ORDER_COMPLETED";
  order: {
    id: string;
    queueNumber: number | null;
    status: OrderStatus;
    customerName: string;
    total: number;
    items: { name: string; quantity: number }[];
    createdAt: string;
  };
}

// ---- Valid Order Status Transitions ----

export const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING],
  [OrderStatus.PREPARING]: [OrderStatus.READY],
  [OrderStatus.READY]: [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};
