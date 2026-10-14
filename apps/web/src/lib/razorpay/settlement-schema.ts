import z from "zod";

/**
 * Server-only. A Razorpay settlement and a settlement recon line as pi-dash
 * reads them: IDs, amounts, times, status and the bank reference only.
 * A recon line's `notes`, `description`, order and card details can carry
 * personal data and are never read (zod drops keys it does not list).
 *
 * Field names follow Razorpay's API reference (Settlements: fetch all,
 * fetch by ID, fetch recon; the `settlement.processed` webhook).
 */

export const SETTLEMENT_ID = /^setl_\w{1,40}$/;

const paise = z.number().int().nonnegative();

export const razorpaySettlementSchema = z.object({
  /** Net paid out to the bank. */
  amount: paise,
  created_at: z.number().int(),
  /** Fees of an instant settlement itself; 0 for a normal settlement. */
  fees: paise.nullish(),
  id: z.string().regex(SETTLEMENT_ID),
  status: z.enum(["created", "processed", "failed"]),
  tax: paise.nullish(),
  utr: z.string().max(100).nullish(),
});
export type RazorpaySettlement = z.infer<typeof razorpaySettlementSchema>;

export const razorpayReconItemSchema = z.object({
  /** Added to the payout (a payment's credit is its amount less the fee and GST). */
  credit: paise,
  currency: z.string().nullish(),
  /** Taken from the payout. */
  debit: paise,
  entity_id: z.string().regex(/^[a-z]+_\w{1,40}$/),
  /** Razorpay's fee, GST included. */
  fee: paise.nullish(),
  settled: z.boolean().nullish(),
  settled_at: z.number().int().nullish(),
  settlement_id: z.string().regex(SETTLEMENT_ID).nullish(),
  /** GST on the fee. */
  tax: paise.nullish(),
  type: z.enum(["payment", "refund", "transfer", "adjustment"]),
});
export type RazorpayReconItem = z.infer<typeof razorpayReconItemSchema>;
