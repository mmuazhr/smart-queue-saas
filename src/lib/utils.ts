// =============================================================================
// General Utilities
// =============================================================================

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with clsx for conditional class names.
 * shadcn/ui standard utility.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a URL-safe slug from a string.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Format a price value as Malaysian Ringgit.
 */
export function formatPrice(price: number | string): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  return new Intl.NumberFormat("ms-MY", {
    style: "currency",
    currency: "MYR",
  }).format(num);
}

/**
 * Format a date relative to now (e.g., "2 minutes ago").
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Format minutes into human-readable time.
 */
export function formatWaitTime(minutes: number): string {
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`;
}

/**
 * Check if a store is currently open based on operating hours.
 */
export function isStoreOpen(operatingHours: Record<string, { open: string; close: string; isClosed: boolean }> | null): boolean {
  if (!operatingHours) return true; // If no hours set, assume always open

  const now = new Date();
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const today = days[now.getDay()];
  const hours = operatingHours[today];

  if (!hours || hours.isClosed) return false;

  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  return currentTime >= hours.open && currentTime <= hours.close;
}

/**
 * Normalize a Malaysian phone number to +60 format.
 */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("60")) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+6${cleaned}`;
  return `+${cleaned}`;
}
