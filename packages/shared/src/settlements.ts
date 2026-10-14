/**
 * Gateway settlements, shared by the server and the Income page. Amounts are
 * paise. A settlement line stores what Razorpay's settlement recon reports:
 * the credit to or debit from the clearing balance, and the fee and the GST
 * on it, with the fee kept net of GST as contributions keep it (Razorpay's
 * own `fee` includes its GST).
 */

/** Synced rows may carry a defaulted amount as null; it counts as 0. */
type Paise = number | null | undefined;

export interface SettlementLine {
  creditPaise: Paise;
  debitPaise: Paise;
  /** Fee excluding GST. */
  feePaise: Paise;
  /** GST on the fee. */
  taxPaise: Paise;
  type: string;
}

export interface SettlementBreakdown {
  /** Adjustments Razorpay made, signed: added to the payout when positive. */
  adjustmentsPaise: number;
  /** Fees, excluding GST, on every line. */
  feesPaise: number;
  /** Payments settled, before fees. */
  grossPaise: number;
  /** What the lines add up to: gross − fees − GST − refunds − transfers ± adjustments. */
  netPaise: number;
  paymentCount: number;
  refundCount: number;
  refundsPaise: number;
  /** GST on the fees. */
  taxPaise: number;
  /** Money routed to linked accounts; not used by the trust today. */
  transfersPaise: number;
}

/**
 * A line's amount before its fee (signed: a refund or transfer is
 * negative): what the payment, refund, transfer or
 * adjustment was for. Razorpay reports a payment's credit as its amount
 * less the fee (GST included), and a transfer's debit as its amount plus
 * the fee, so adding the fee back gives the amount either way.
 */
export const lineAmountPaise = (line: SettlementLine) =>
  (line.creditPaise ?? 0) -
  (line.debitPaise ?? 0) +
  (line.feePaise ?? 0) +
  (line.taxPaise ?? 0);

export function settlementBreakdown(
  lines: readonly SettlementLine[]
): SettlementBreakdown {
  const out: SettlementBreakdown = {
    adjustmentsPaise: 0,
    feesPaise: 0,
    grossPaise: 0,
    netPaise: 0,
    paymentCount: 0,
    refundCount: 0,
    refundsPaise: 0,
    taxPaise: 0,
    transfersPaise: 0,
  };
  for (const line of lines) {
    const principal = lineAmountPaise(line);
    out.feesPaise += line.feePaise ?? 0;
    out.taxPaise += line.taxPaise ?? 0;
    out.netPaise += (line.creditPaise ?? 0) - (line.debitPaise ?? 0);
    if (line.type === "payment") {
      out.grossPaise += principal;
      out.paymentCount += 1;
    } else if (line.type === "refund") {
      out.refundsPaise -= principal;
      out.refundCount += 1;
    } else if (line.type === "transfer") {
      out.transfersPaise -= principal;
    } else {
      out.adjustmentsPaise += principal;
    }
  }
  return out;
}

/** Whether a payment line's fee or GST differs from what the contribution stored. */
export function hasFeeMismatch(
  line: { feePaise: Paise; taxPaise: Paise; type: string },
  contribution:
    | { gatewayFeePaise?: number | null; gatewayTaxPaise?: number | null }
    | null
    | undefined
): boolean {
  if (line.type !== "payment" || !contribution) {
    return false;
  }
  return (
    (line.feePaise ?? 0) !== (contribution.gatewayFeePaise ?? 0) ||
    (line.taxPaise ?? 0) !== (contribution.gatewayTaxPaise ?? 0)
  );
}

/** A payment or refund line not yet tied to its contribution or refund. */
export function isUnlinkedLine(line: {
  contributionId?: string | null;
  contributionRefundId?: string | null;
  type: string;
}): boolean {
  if (line.type === "payment") {
    return !line.contributionId;
  }
  if (line.type === "refund") {
    return !line.contributionRefundId;
  }
  return false;
}
