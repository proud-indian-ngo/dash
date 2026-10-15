import {
  PAYEE_NAME_REQUIRED_MESSAGE,
  qualifiesForCashVoucher,
} from "@pi-dash/shared/cash-voucher";
import { todayInKolkata } from "@pi-dash/shared/income";

/** A line item as the client submits it. */
export interface SubmittedVoucherItem {
  amountPaise: number;
  categoryId: string;
  description: string;
  generateVoucher?: boolean;
  id: string;
  /**
   * The claimant is the payee: the name and mobile are stored empty and the
   * voucher prints the claimant, so a missing name is a deliberate choice.
   */
  payeeIsClaimant?: boolean;
  payeeName?: null | string;
  payeePhone?: null | string;
}

/** A line item as stored before the edit. */
export interface StoredVoucherItem {
  amountPaise: number;
  categoryId: string;
  description: null | string;
  generateVoucher?: boolean | null;
  id: string;
  payeeName?: null | string;
  payeePhone?: null | string;
  payeeSignatureAttachmentId?: null | string;
  payeeSignatureCapturedAt?: null | number;
  payeeSignatureCapturedBy?: null | string;
  payeeSignatureStatement?: null | string;
  signedVoucherAttachmentId?: null | string;
  voucherAttachmentId?: null | string;
}

export interface AttachmentIdentity {
  id: string;
  objectKey?: null | string;
  type: string;
}

export interface VoucherFields {
  generateVoucher: boolean;
  payeeName: null | string;
  payeePhone: null | string;
}

/** The payee's signature and what it acknowledged, as stored on the item. */
export interface PayeeSignatureFields {
  payeeSignatureAttachmentId: string;
  payeeSignatureCapturedAt: null | number;
  payeeSignatureCapturedBy: null | string;
  payeeSignatureStatement: null | string;
}

export const NO_PAYEE_SIGNATURE = {
  payeeSignatureAttachmentId: null,
  payeeSignatureCapturedAt: null,
  payeeSignatureCapturedBy: null,
  payeeSignatureStatement: null,
} as const;

export interface VoucherPlan {
  fields: VoucherFields;
  /** Links to put back after the line items are re-inserted. */
  links: {
    signedVoucherAttachmentId: null | string;
    voucherAttachmentId: string;
  } | null;
  /** Whether an approved request should queue a voucher for this item. */
  queue: boolean;
  /** The payee's signature to put back, when it still holds. */
  signature: PayeeSignatureFields | null;
  /**
   * The item had a signature this edit made stale: the facts it acknowledged
   * changed, or its file was removed. The file stays among the attachments.
   */
  signatureDropped: boolean;
}

/**
 * The payee an item submits: none for an item without a voucher or one paid
 * to the claimant (the voucher prints the claimant), otherwise the typed
 * name and mobile.
 */
function submittedPayee(
  item: SubmittedVoucherItem,
  generateVoucher: boolean
): Pick<VoucherFields, "payeeName" | "payeePhone"> {
  if (!generateVoucher || item.payeeIsClaimant) {
    return { payeeName: null, payeePhone: null };
  }
  return {
    payeeName: item.payeeName?.trim() || null,
    payeePhone: item.payeePhone || null,
  };
}

/**
 * The voucher fields for a new or changed item: the opt-in only sticks
 * within the limit, the payee only on items that opt in, and a voucher item
 * must name its payee unless it is marked as paid to the claimant. A tick
 * left behind after the amount grew past the limit is dropped rather than
 * refused.
 */
export function normalizeVoucherFields(
  item: SubmittedVoucherItem,
  limitPaise: number
): VoucherFields {
  const generateVoucher =
    Boolean(item.generateVoucher) &&
    qualifiesForCashVoucher(item.amountPaise, limitPaise);
  const payee = submittedPayee(item, generateVoucher);
  if (generateVoucher && !item.payeeIsClaimant && !payee.payeeName) {
    throw new Error(`${PAYEE_NAME_REQUIRED_MESSAGE} on each cash voucher`);
  }
  return { generateVoucher, ...payee };
}

function sameAttachment(
  id: string,
  before: ReadonlyMap<string, AttachmentIdentity>,
  after: ReadonlyMap<string, AttachmentIdentity>
): boolean {
  const old = before.get(id);
  const kept = after.get(id);
  return Boolean(
    old &&
    kept &&
    old.type === kept.type &&
    (old.objectKey ?? null) === (kept.objectKey ?? null)
  );
}

/**
 * Decides, per submitted line item, what an edit stores and whether an
 * existing voucher survives it. A voucher survives when everything it
 * prints is unchanged (amount, description, category, the request's
 * expense date, and the payee when the item is still a ticked, eligible
 * voucher item, where "paid to the claimant" means no stored name) and its file is still attached under the same id and key;
 * then the stored opt-in and payee are kept as they are, whatever the
 * current limit, except that an explicit untick is stored. Otherwise the voucher is stale: links are dropped (the
 * files stay among the attachments) and the item is treated as new, so an
 * approved request queues a fresh voucher, as approval would.
 *
 * The payee's signature follows the same rule, judged on its own: it was
 * given against the amount, description, category, expense day and payee,
 * so it survives only when those are unchanged, the item is still a voucher
 * item naming that payee, and its file is still attached. A voucher need not
 * exist yet; signatures are collected before approval.
 */
export function planVoucherFields(input: {
  attachmentsAfter: readonly AttachmentIdentity[];
  attachmentsBefore: readonly AttachmentIdentity[];
  /** Whether the request's expense date moved to another calendar day. */
  expenseDateChanged: boolean;
  items: readonly SubmittedVoucherItem[];
  itemsBefore: readonly StoredVoucherItem[];
  limitPaise: number;
}): Map<string, VoucherPlan> {
  const before = new Map(input.itemsBefore.map((li) => [li.id, li]));
  const attachmentsBefore = new Map(
    input.attachmentsBefore.map((a) => [a.id, a])
  );
  const attachmentsAfter = new Map(
    input.attachmentsAfter.map((a) => [a.id, a])
  );
  const plans = new Map<string, VoucherPlan>();
  for (const item of input.items) {
    const old = before.get(item.id);
    const editsPayee =
      Boolean(item.generateVoucher) &&
      qualifiesForCashVoucher(item.amountPaise, input.limitPaise);
    // Ticking or unticking "paid to the claimant" changes the printed
    // payee: no stored name means the voucher prints the claimant.
    const payee = submittedPayee(item, editsPayee);
    const samePayee =
      old !== undefined &&
      payee.payeeName === (old.payeeName ?? null) &&
      payee.payeePhone === (old.payeePhone ?? null);
    const sameFacts =
      old !== undefined &&
      old.amountPaise === item.amountPaise &&
      (old.description ?? "") === item.description &&
      old.categoryId === item.categoryId &&
      !input.expenseDateChanged;
    const signature = keptSignature(old, {
      attachmentsAfter,
      attachmentsBefore,
      // The payee acknowledged these facts, so the voucher's stale rule
      // applies, and the item must still be a voucher item naming them.
      stillHolds: sameFacts && editsPayee && samePayee,
    });
    const signatureDropped = Boolean(
      old?.payeeSignatureAttachmentId && !signature
    );
    const voucherId = old?.voucherAttachmentId;
    if (old && voucherId) {
      // The voucher prints the signature too: losing it makes the voucher stale.
      const printedUnchanged =
        sameFacts && (!editsPayee || samePayee) && !signatureDropped;
      if (
        printedUnchanged &&
        sameAttachment(voucherId, attachmentsBefore, attachmentsAfter)
      ) {
        const signedId = old.signedVoucherAttachmentId;
        // The box shows on an eligible item, so an untick there is the
        // user's choice: store it, keeping the voucher as evidence. An item
        // over the limit can't show the box; its stored opt-in stands.
        const unticked =
          !item.generateVoucher &&
          qualifiesForCashVoucher(item.amountPaise, input.limitPaise);
        plans.set(item.id, {
          fields: {
            generateVoucher: unticked ? false : Boolean(old.generateVoucher),
            payeeName: old.payeeName ?? null,
            payeePhone: old.payeePhone ?? null,
          },
          links: {
            signedVoucherAttachmentId:
              signedId &&
              sameAttachment(signedId, attachmentsBefore, attachmentsAfter)
                ? signedId
                : null,
            voucherAttachmentId: voucherId,
          },
          queue: false,
          signature,
          signatureDropped,
        });
        continue;
      }
    }
    const fields = normalizeVoucherFields(item, input.limitPaise);
    plans.set(item.id, {
      fields,
      links: null,
      queue: fields.generateVoucher,
      signature,
      signatureDropped,
    });
  }
  return plans;
}

/**
 * The stored signature when it still holds: the facts it acknowledged are
 * unchanged and its file is still attached under the same id and key.
 */
function keptSignature(
  old: StoredVoucherItem | undefined,
  input: {
    attachmentsAfter: ReadonlyMap<string, AttachmentIdentity>;
    attachmentsBefore: ReadonlyMap<string, AttachmentIdentity>;
    stillHolds: boolean;
  }
): PayeeSignatureFields | null {
  const id = old?.payeeSignatureAttachmentId;
  if (
    !(old && id && input.stillHolds) ||
    !sameAttachment(id, input.attachmentsBefore, input.attachmentsAfter)
  ) {
    return null;
  }
  return {
    payeeSignatureAttachmentId: id,
    payeeSignatureCapturedAt: old.payeeSignatureCapturedAt ?? null,
    payeeSignatureCapturedBy: old.payeeSignatureCapturedBy ?? null,
    payeeSignatureStatement: old.payeeSignatureStatement ?? null,
  };
}

/** The calendar day of an expense date in India, where expenses are dated. */
export function expenseDay(epochMs: number | null | undefined): string {
  return typeof epochMs === "number" && Number.isFinite(epochMs)
    ? todayInKolkata(new Date(epochMs))
    : "";
}
