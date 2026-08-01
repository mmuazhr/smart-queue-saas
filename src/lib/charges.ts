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
