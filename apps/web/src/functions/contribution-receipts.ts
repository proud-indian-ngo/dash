import type {
  IssueReceiptsResult,
  ReceiptCandidates,
} from "@pi-dash/db/queries/contribution-receipts";
import {
  MAX_RECEIPTS_PER_ISSUE,
  VOID_REASON_MAX,
  VOID_REASON_MIN,
} from "@pi-dash/shared/receipts";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import {
  issueReceipts,
  loadCandidates,
  queueReceiptEmail,
  voidReceipt,
} from "@/lib/receipts/server";
import { authMiddleware } from "@/middleware/auth";

/**
 * Donation receipts for direct gifts (`donors.receipt`, held by finance
 * admins and super admins). Reading the candidates is a read (gift and party
 * IDs, donor names, amounts and why a gift is blocked; no contact details or
 * ID numbers). Issuing, voiding and emailing are audited with IDs and counts
 * only; the void reason stays on the receipt, never in the audit metadata.
 */

export type ReceiptCandidatesResponse = ReceiptCandidates;

// Inputs name the gifts `giftIds`, not `contributionIds`: the Income page's
// bank-evidence request is told apart by that key (give.do payout spec).

export const getReceiptCandidates = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      giftIds: z.array(z.uuid()).max(MAX_RECEIPTS_PER_ISSUE).nullish(),
    })
  )
  .handler(async ({ context, data }): Promise<ReceiptCandidatesResponse> => {
    await assertServerPermission(context.session, "donors.receipt");
    return await loadCandidates(data.giftIds ?? null);
  });

export const issueContributionReceipts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      giftIds: z.array(z.uuid()).min(1).max(MAX_RECEIPTS_PER_ISSUE),
    })
  )
  .handler(async ({ context, data }): Promise<IssueReceiptsResult> => {
    await assertServerPermission(context.session, "donors.receipt");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "contribution_receipt.issue",
        metadata: { requestedCount: data.giftIds.length },
        target: { type: "contribution_receipt" },
      },
      () => issueReceipts(data.giftIds, session.user.id),
      undefined,
      (result) =>
        result.issued.length === 1 && result.issued[0]
          ? { id: result.issued[0].id, type: "contribution_receipt" }
          : undefined
    );
  });

export const voidContributionReceipt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      reason: z
        .string()
        .trim()
        .min(VOID_REASON_MIN, "Say why")
        .max(VOID_REASON_MAX),
      receiptId: z.uuid(),
    })
  )
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "donors.receipt");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "contribution_receipt.void",
        target: { id: data.receiptId, type: "contribution_receipt" },
      },
      () => voidReceipt(data, session.user.id)
    );
  });

export const emailContributionReceipt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ receiptId: z.uuid() }))
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "donors.receipt");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "contribution_receipt.email",
        target: { id: data.receiptId, type: "contribution_receipt" },
      },
      () => queueReceiptEmail(data.receiptId)
    );
  });
