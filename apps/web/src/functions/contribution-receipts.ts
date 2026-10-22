import type {
  IssueReceiptsResult,
  ReceiptCandidates,
  ReceiptContacts,
  ReceiptReadiness,
} from "@pi-dash/db/queries/contribution-receipts";
import { INCOME_PERMISSIONS } from "@pi-dash/shared/income";
import {
  MAX_RECEIPTS_PER_ISSUE,
  RECEIPT_VIEW_PERMISSIONS,
  VOID_REASON_MAX,
  VOID_REASON_MIN,
} from "@pi-dash/shared/receipts";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import {
  assertServerAnyPermission,
  assertServerPermission,
} from "@/lib/api-auth";
import { MAX_ID_VALUES, runSessionAuditedAction } from "@/lib/audit";
import { HttpError } from "@/lib/http-error";
import { containsIdentifier } from "@/lib/income-import/normalize";
import {
  issueReceipts,
  loadCandidates,
  loadContacts,
  loadReadiness,
  queueReceiptEmail,
  queueReceiptNow,
  queueReceiptWhatsApp,
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

export type ReceiptReadinessResponse = ReceiptReadiness;

/**
 * The Income table's Receipt column: which open direct gifts are ready to
 * issue and which need details. Gift IDs only, never donor details; for
 * anyone who may read receipts (an income permission and a receipt-view
 * permission, as `canReadReceipts`). A read, so not audited.
 */
export const getContributionReceiptReadiness = createServerFn({
  method: "POST",
})
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ReceiptReadinessResponse> => {
    await assertServerAnyPermission(context.session, INCOME_PERMISSIONS);
    await assertServerAnyPermission(context.session, RECEIPT_VIEW_PERMISSIONS);
    return await loadReadiness();
  });

/**
 * Whether each live receipt's donor has a usable email address and a phone
 * number, so the Receipts tab can disable sends that can't work. Flags
 * only, never the contact details; a read, so not audited.
 */
export const getReceiptContacts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Record<string, ReceiptContacts>> => {
    await assertServerPermission(context.session, "donors.receipt");
    return await loadContacts();
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
      throw new HttpError(401, "Unauthorized");
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
          : undefined,
      (result) => ({
        contributionIds: result.issued
          .slice(0, MAX_ID_VALUES)
          .map((receipt) => receipt.contributionId),
        issuedCount: result.issued.length,
        skippedCount: result.skipped.length,
      })
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
        .max(VOID_REASON_MAX)
        .refine(
          (reason) => !containsIdentifier(reason),
          "Don't include ID numbers in the reason"
        ),
      receiptId: z.uuid(),
    })
  )
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "donors.receipt");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
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
      throw new HttpError(401, "Unauthorized");
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

export const whatsappContributionReceipt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ receiptId: z.uuid() }))
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "donors.receipt");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "contribution_receipt.whatsapp",
        target: { id: data.receiptId, type: "contribution_receipt" },
      },
      () => queueReceiptWhatsApp(data.receiptId)
    );
  });

export const sendContributionReceiptNow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ receiptId: z.uuid() }))
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "donors.receipt");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "contribution_receipt.send_now",
        target: { id: data.receiptId, type: "contribution_receipt" },
      },
      () => queueReceiptNow(data.receiptId)
    );
  });
