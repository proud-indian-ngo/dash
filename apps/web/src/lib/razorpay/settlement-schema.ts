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

/** A settlement (`setl_…`) or an instant, on-demand settlement (`setlod_…`). */
export const SETTLEMENT_ID = /^setl(?:od)?_\w{1,40}$/;
export const ONDEMAND_SETTLEMENT_ID = /^setlod_\w{1,40}$/;

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

/** An instant settlement's states, read as a settlement's. */
const ONDEMAND_STATUS: Record<string, RazorpaySettlement["status"]> = {
  processed: "processed",
  reversed: "failed",
};

/**
 * An instant (on-demand) settlement (`GET /v1/settlements/ondemand/:id`),
 * read as a settlement: `amount_settled` is what reached the bank, after
 * its `fees` (GST included) and `tax`. Its payouts carry the UTRs; none is
 * read here.
 */
export const razorpayOndemandSettlementSchema = z
  .object({
    amount_settled: paise,
    created_at: z.number().int(),
    fees: paise.nullish(),
    id: z.string().regex(ONDEMAND_SETTLEMENT_ID),
    status: z.string(),
    tax: paise.nullish(),
  })
  .transform((o): RazorpaySettlement => ({
    amount: o.amount_settled,
    created_at: o.created_at,
    fees: o.fees,
    id: o.id,
    status: ONDEMAND_STATUS[o.status] ?? "created",
    tax: o.tax,
    utr: null,
  }));

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
