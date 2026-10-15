/** What the voucher printed from the line item and its request. */
export interface RenderedFrom {
  amountPaise: number;
  categoryId: string;
  /** The request's claimant, printed as "Claimed by". */
  claimantId: string;
  description: string | null;
  expenseDate: string;
  payeeName: string | null;
  payeePhone: string | null;
}

/**
 * Whether the line item and its request (expense date and claimant) still
 * hold what the voucher printed. The expense date is the stored calendar day (`YYYY-MM-DD`), so
 * re-picking the same day never counts as a change.
 */
export function stillAsRendered(
  current: Omit<RenderedFrom, "claimantId" | "expenseDate"> | undefined,
  request: Pick<RenderedFrom, "claimantId" | "expenseDate"> | undefined,
  rendered: RenderedFrom
): boolean {
  return Boolean(
    current &&
    request &&
    current.amountPaise === rendered.amountPaise &&
    current.categoryId === rendered.categoryId &&
    current.description === rendered.description &&
    current.payeeName === rendered.payeeName &&
    current.payeePhone === rendered.payeePhone &&
    request.expenseDate === rendered.expenseDate &&
    request.claimantId === rendered.claimantId
  );
}
