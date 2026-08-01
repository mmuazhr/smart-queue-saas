// Merchant-configured order charges (SST, service charge, …).
// DECIDED 2026-08-01: every line is rate% × subtotal — flat, no compounding.
import { z } from "zod";

export const storeChargeSchema = z.object({
  label: z.string().trim().min(1).max(30),
  rate: z.number().min(0).max(100),
  enabled: z.boolean(),
});
export const storeChargesSchema = z.array(storeChargeSchema).max(5);

export type StoreCharge = z.infer<typeof storeChargeSchema>;
export interface ChargeLine { label: string; rate: number; amountCents: number }

export function parseStoreCharges(value: unknown): StoreCharge[] {
  const parsed = storeChargesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function computeCharges(
  subtotalCents: number,
  charges: StoreCharge[] | null | undefined
): { lines: ChargeLine[]; chargeTotalCents: number } {
  const lines: ChargeLine[] = (charges ?? [])
    .filter((c) => c.enabled && c.rate > 0)
    .map((c) => ({ label: c.label, rate: c.rate, amountCents: Math.round((subtotalCents * c.rate) / 100) }));
  return { lines, chargeTotalCents: lines.reduce((sum, l) => sum + l.amountCents, 0) };
}

// Mirrors the rounding order/api/orders/route.ts uses when building order
// items — round each line's unit price to cents first, then multiply by
// quantity, then sum — so a cart preview built from this never drifts a
// cent from the order actually created from the same items.
export function subtotalCentsFromItems(items: { price: number; quantity: number }[]): number {
  return items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);
}

// Single derivation path for customer-facing previews (cart drawer,
// checkout): raw cart items + a store's raw `charges` JSON in, the same
// subtotal/lines/total the server will compute for this exact cart out.
// Never build this preview a second, ad-hoc way in a component.
export function computeCartCharges(
  items: { price: number; quantity: number }[],
  rawCharges: unknown
): { subtotalCents: number; lines: ChargeLine[]; chargeTotalCents: number; totalCents: number } {
  const subtotalCents = subtotalCentsFromItems(items);
  const { lines, chargeTotalCents } = computeCharges(subtotalCents, parseStoreCharges(rawCharges));
  return { subtotalCents, lines, chargeTotalCents, totalCents: subtotalCents + chargeTotalCents };
}
