import {
  CASH_VOUCHER_LIMIT_CONFIG_KEY,
  cashVoucherLimitError,
  isIndianMobile,
  isLatinName,
  PAYEE_NAME_MAX,
  PAYEE_NAME_SCRIPT_MESSAGE,
  PAYEE_PHONE_MESSAGE,
  parseCashVoucherLimit,
  qualifiesForCashVoucher,
} from "@pi-dash/shared/cash-voucher";
import { cityValues } from "@pi-dash/shared/constants";
import { todayInKolkata } from "@pi-dash/shared/income";
import { defineMutator, type Transaction } from "@rocicorp/zero";
import { uuidv7 } from "uuidv7";
import z from "zod";

import type { Context } from "../context";
import { assertHasPermission, assertIsLoggedIn, can } from "../permissions";
import { type Schema, zql } from "../schema";
import {
  mutatorAttachmentSchema as attachmentSchema,
  mutatorLineItemSchema as lineItemSchema,
} from "../shared-schemas";
import {
  assertEligibleClaimant,
  claimantBankFields,
  resolveClaimant,
  userName,
} from "./claimant";
import {
  assertCanChangeCharge,
  chargeChangeNote,
  expenseChargeArgs,
  resolveExpenseCharge,
  POSTED_CHARGE_MESSAGE,
  setChargedToSchema,
} from "./expense-charge";
import { isPostedInBooks, queueLedgerPosting } from "./ledger-queue";
import {
  assertApprovalScreenshot,
  assertCanDelete,
  assertCanModify,
  assertEntityExists,
  assertPending,
  buildHistoryInsert,
  claimUploadedR2ObjectKey,
  createR2ClaimOptions,
  deleteAllRelations,
  enqueueDeleteR2Object,
  insertRelations,
  replaceRelations,
} from "./submission-helpers";
import {
  assertDeletable,
  assertNotMatchedToBank,
  assertNotVoided,
  voidSchema,
} from "./void";
import {
  expenseDay,
  planVoucherFields,
  type VoucherPlan,
} from "./voucher-fields";

const reimbursementAttachmentKeyPrefixes = (id: string) => [
  `attachments/reimbursements/${id}/`,
  `attachments/${id}/`,
];

const reimbursementApprovalKeyPrefixes = (id: string) => [
  `approval-screenshots/reimbursements/${id}/approval-screenshots/`,
  `approval-screenshots/${id}/`,
];

/** A reimbursement line item: the shared fields plus the voucher payee. */
const reimbursementLineItemSchema = lineItemSchema.extend({
  /**
   * The claimant was paid: the name and mobile are stored empty and the
   * voucher prints the claimant. Without it a voucher item must name its
   * payee.
   */
  payeeIsClaimant: z.boolean().optional().default(false),
  // Stored in NFC, so the same name always compares and prints the same.
  payeeName: z
    .string()
    .trim()
    .max(PAYEE_NAME_MAX)
    .transform((v) => v.normalize("NFC"))
    .refine((v) => v === "" || isLatinName(v), PAYEE_NAME_SCRIPT_MESSAGE)
    .nullable()
    .optional(),
  payeePhone: z
    .string()
    .refine(isIndianMobile, PAYEE_PHONE_MESSAGE)
    .nullable()
    .optional(),
});

/**
 * The cash-voucher limit in force (Settings → Programmes). On the server it
 * reads the database, so the server decides; on the client it reads the
 * synced `app_config` row and falls back to the default before it arrives.
 */
export async function readCashVoucherLimit(
  tx: Transaction<Schema>
): Promise<number> {
  const row = await tx.run(
    zql.appConfig.where("key", CASH_VOUCHER_LIMIT_CONFIG_KEY).one()
  );
  return parseCashVoucherLimit(row?.value);
}

export const createSchema = z.object({
  attachments: z.array(attachmentSchema),
  bankAccountIfscCode: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  ...expenseChargeArgs,
  city: z.enum(cityValues).optional(),
  eventId: z.string().optional(),
  expenseDate: z
    .number()
    .refine((n) => n <= Date.now(), "Expense date cannot be in the future"),
  id: z.string(),
  lineItems: z.array(reimbursementLineItemSchema),
  title: z.string().min(1),
});

/**
 * Create takes an optional claimant: finance raises a reimbursement for
 * someone else (`requests.create_for_others`), paid to one of that person's
 * saved bank accounts, chosen by ID so the server copies its details.
 */
export const createArgsSchema = createSchema.extend({
  claimantBankAccountId: z.string().optional(),
  claimantUserId: z.string().optional(),
});

/** Finance moves a reimbursement to another claimant, with a reason. */
export const changeClaimantSchema = z.object({
  /** One of the new claimant's saved accounts; null when they have none. */
  bankAccountId: z.string().nullable(),
  id: z.string(),
  /** The claimant the client saw, so two changes never race. */
  previousUserId: z.string(),
  reason: z.string().trim().min(1, "Give a reason").max(500),
  /** The new claimant. */
  userId: z.string(),
});

/** Payment proof added after approval, or a replacement for it. */
export const addPaymentProofSchema = z.object({
  /** The uploaded screenshot (a temporary upload, claimed here). */
  approvalScreenshotKey: z.string().min(1),
  id: z.string(),
  /** When replacing: the attachment that keeps the old screenshot. */
  keptAttachmentId: z.string().optional(),
  /** Whether the client saw a screenshot, so two adds never race. */
  replacing: z.boolean(),
});

const IMAGE_MIME_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const extensionOf = (key: string) => {
  const name = key.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

const imageMimeTypeOf = (key: string) =>
  IMAGE_MIME_TYPES[extensionOf(key)] ?? null;

const KEPT_PROOF_PREFIX = "payment-proof-";

/** A payment screenshot kept as an attachment (see `keepProofAsAttachment`). */
const isKeptPaymentProof = (attachment: {
  filename: null | string;
  objectKey?: null | string;
}) =>
  Boolean(attachment.filename?.startsWith(KEPT_PROOF_PREFIX)) &&
  Boolean(attachment.objectKey?.includes("approval-screenshots/"));

const KEPT_PROOF_REMOVAL_MESSAGE =
  "Only an approver can remove kept payment proof";

/**
 * Payment proof is evidence: a screenshot that stops being the claim's
 * proof (replaced, or cleared by a reset to pending) is kept as a plain
 * attachment, "payment-proof-replaced-2026-10-17.png" or
 * "payment-proof-previous-2026-10-17.png" (the day in India, with "-2",
 * "-3" when the claim already has that name). Kept; only approvers can
 * remove it.
 */
async function keepProofAsAttachment(
  tx: Transaction<Schema>,
  reimbursementId: string,
  objectKey: string,
  { id, kind, now }: { id: string; kind: "previous" | "replaced"; now: number }
) {
  const ext = extensionOf(objectKey);
  const base = `${KEPT_PROOF_PREFIX}${kind}-${todayInKolkata(new Date(now))}`;
  const withExt = (name: string) => (ext ? `${name}.${ext}` : name);
  const taken = new Set(
    (
      await tx.run(
        zql.reimbursementAttachment.where("reimbursementId", reimbursementId)
      )
    ).map((a) => a.filename)
  );
  let filename = withExt(base);
  for (let n = 2; taken.has(filename); n += 1) {
    filename = withExt(`${base}-${n}`);
  }
  return tx.mutate.reimbursementAttachment.insert({
    createdAt: now,
    filename,
    id,
    mimeType: imageMimeTypeOf(objectKey),
    objectKey,
    reimbursementId,
    type: "file",
    url: null,
  });
}

const fk = (id: string) => ({ reimbursementId: id });

/** Its posting in the books (finance layer 3-3a). */
const ledgerSource = (id: string) => ({
  sourceId: id,
  sourceType: "reimbursement" as const,
});

/** After a change, the books follow: post, repost or reverse it. */
const queuePosting = (
  ctx: Parameters<typeof queueLedgerPosting>[0],
  tx: Parameters<typeof queueLedgerPosting>[1],
  id: string,
  mutator: string
) => queueLedgerPosting(ctx, tx, [ledgerSource(id)], mutator);

/** Inserts each line item with its planned voucher fields and empty links. */
function withPlannedVoucherFields<T extends { id: string }>(
  plans: ReadonlyMap<string, VoucherPlan>,
  insertFn: (data: T) => Promise<unknown>
) {
  return (data: T) => {
    const plan = plans.get(data.id);
    return insertFn({
      ...data,
      generateVoucher: plan?.fields.generateVoucher ?? false,
      payeeName: plan?.fields.payeeName ?? null,
      payeePhone: plan?.fields.payeePhone ?? null,
      signedVoucherAttachmentId: null,
      voucherAttachmentId: null,
    });
  };
}

/** Queues `generate-cash-voucher` for line items after commit, on the server. */
function queueVouchers(
  ctx: Context,
  reimbursementId: string,
  lineItemIds: readonly string[],
  approverUserId: string,
  mutator: string
) {
  if (lineItemIds.length === 0) {
    return;
  }
  ctx.asyncTasks?.push({
    fn: async () => {
      const { enqueue } = await import("@pi-dash/jobs/enqueue");
      await Promise.all(
        lineItemIds.map(async (lineItemId) => {
          await enqueue(
            "generate-cash-voucher",
            { approverUserId, lineItemId, reimbursementId },
            { singletonKey: `voucher-${lineItemId}`, traceId: ctx.traceId }
          );
        })
      );
    },
    meta: { mutator, reimbursementId },
  });
}

const entityFields = (args: z.infer<typeof createSchema>) => ({
  bankAccountIfscCode: args.bankAccountIfscCode,
  bankAccountName: args.bankAccountName,
  bankAccountNumber: args.bankAccountNumber,
  city: args.city,
  expenseDate: args.expenseDate,
});

export const reimbursementMutators = {
  approve: defineMutator(
    z.object({
      approvalScreenshotKey: z.string().optional(),
      id: z.string(),
      note: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const { userId } = ctx;
      const canEditAnyStatus = can(ctx, "requests.edit_all_statuses");
      const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
      assertEntityExists(entity, "Reimbursement");
      assertNotVoided(entity);
      assertPending(entity, "reimbursement", "approved", canEditAnyStatus);

      const now = Date.now();
      const requestedApprovalScreenshotKey =
        args.approvalScreenshotKey || entity.approvalScreenshotKey;
      assertApprovalScreenshot(requestedApprovalScreenshotKey);
      const approvalScreenshotKey = claimUploadedR2ObjectKey(
        requestedApprovalScreenshotKey,
        createR2ClaimOptions(ctx, tx.location, {
          durablePrefix: `reimbursements/${args.id}/approval-screenshots`,
          existingObjectKeys: entity.approvalScreenshotKey
            ? new Set([entity.approvalScreenshotKey])
            : undefined,
          subfolder: "approval-screenshots",
        })
      );

      // A re-approval with a new screenshot keeps the old one as evidence.
      // The server alone writes it, under an ID of its own.
      if (
        tx.location === "server" &&
        entity.approvalScreenshotKey &&
        entity.approvalScreenshotKey !== approvalScreenshotKey
      ) {
        await keepProofAsAttachment(tx, args.id, entity.approvalScreenshotKey, {
          id: uuidv7(),
          kind: "replaced",
          now,
        });
      }

      await tx.mutate.reimbursement.update({
        approvalScreenshotKey,
        id: args.id,
        rejectionReason: null,
        reviewedAt: now,
        reviewedBy: userId,
        status: "approved",
        updatedAt: now,
      });

      await tx.mutate.reimbursementHistory.insert({
        ...buildHistoryInsert(userId, "approved", now, args.note),
        reimbursementId: args.id,
      });
      queuePosting(ctx, tx, args.id, "reimbursement.approve");

      if (tx.location === "server") {
        const { title, userId: ownerId } = entity;
        const { id } = args;
        const { note } = args;
        const approverUserId = userId;

        const lineItems = await tx.run(
          zql.reimbursementLineItem.where("reimbursementId", args.id)
        );
        const limitPaise = await readCashVoucherLimit(tx);
        const voucherLineItems = lineItems.filter(
          (li) =>
            li.generateVoucher &&
            qualifiesForCashVoucher(li.amountPaise, limitPaise)
        );

        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-reimbursement-approved",
              {
                note,
                reimbursementId: id,
                submitterId: ownerId,
                title,
              },
              { traceId: ctx.traceId }
            );
            await Promise.all(
              voucherLineItems.map(async (li) => {
                await enqueue(
                  "generate-cash-voucher",
                  {
                    approverUserId,
                    lineItemId: li.id,
                    reimbursementId: id,
                  },
                  {
                    singletonKey: `voucher-${li.id}`,
                    traceId: ctx.traceId,
                  }
                );
              })
            );
          },
          meta: {
            mutator: "approveReimbursement",
            reimbursementId: id,
            submitterId: ownerId,
            title,
          },
        });
      }
    }
  ),
  /**
   * Adds the payment screenshot to an approved reimbursement that has none
   * (older records approved before it was required), or replaces it. It is
   * stored exactly as approval stores it (`approval_screenshot_key`), so the
   * books post the claim with no special case: the posting job is queued
   * after the commit. A replaced screenshot is never deleted: it stays among
   * the request's attachments as evidence.
   */
  addPaymentProof: defineMutator(
    addPaymentProofSchema,
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
      assertEntityExists(entity, "Reimbursement");
      assertNotVoided(entity);
      if (entity.status !== "approved") {
        throw new Error("Only an approved reimbursement takes payment proof");
      }
      const previousKey = entity.approvalScreenshotKey ?? null;
      if (Boolean(previousKey) !== args.replacing) {
        throw new Error(
          "The payment proof changed meanwhile. Reload and try again"
        );
      }
      if (previousKey && !args.keptAttachmentId) {
        throw new Error("Replacing the payment proof keeps the old one");
      }

      const now = Date.now();
      const approvalScreenshotKey = claimUploadedR2ObjectKey(
        args.approvalScreenshotKey,
        createR2ClaimOptions(ctx, tx.location, {
          durablePrefix: `reimbursements/${args.id}/approval-screenshots`,
          subfolder: "approval-screenshots",
        })
      );

      if (previousKey && args.keptAttachmentId) {
        await keepProofAsAttachment(tx, args.id, previousKey, {
          id: args.keptAttachmentId,
          kind: "replaced",
          now,
        });
      }
      await tx.mutate.reimbursement.update({
        approvalScreenshotKey,
        id: args.id,
        updatedAt: now,
      });
      await tx.mutate.reimbursementHistory.insert({
        ...buildHistoryInsert(
          ctx.userId,
          "updated",
          now,
          previousKey ? "Payment proof replaced" : "Payment proof added"
        ),
        reimbursementId: args.id,
      });
      // With its screenshot, an approved claim waiting in the books posts.
      queuePosting(ctx, tx, args.id, "reimbursement.addPaymentProof");
    }
  ),
  /**
   * Upload the voucher the payee signed or thumb-printed, after approval,
   * without reopening the claim. The claimant (owner) or finance
   * (finance.manage, or an approver) may attach or replace it; the file
   * becomes a reimbursement attachment linked from the line item, and a
   * replaced copy stays attached to the request.
   */
  attachSignedVoucher: defineMutator(
    z.object({
      lineItemId: z.string(),
      reimbursementId: z.string(),
      /** The signed copy the client saw, so a replace never races another. */
      replacesAttachmentId: z.string().nullable(),
      signedCopy: z.object({
        filename: z.string().min(1).max(255),
        id: z.string(),
        mimeType: z.string().optional(),
        objectKey: z.string().min(1),
      }),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const entity = await tx.run(
        zql.reimbursement.where("id", args.reimbursementId).one()
      );
      assertEntityExists(entity, "Reimbursement");
      assertNotVoided(entity);
      const isOwner = entity.userId === ctx.userId;
      if (
        !(isOwner || can(ctx, "finance.manage") || can(ctx, "requests.approve"))
      ) {
        throw new Error("Unauthorized");
      }
      if (entity.status !== "approved") {
        throw new Error("Only approved reimbursements take a signed voucher");
      }
      const lineItem = await tx.run(
        zql.reimbursementLineItem
          .where("id", args.lineItemId)
          .where("reimbursementId", args.reimbursementId)
          .one()
      );
      assertEntityExists(lineItem, "Line item");
      if (!lineItem.voucherAttachmentId) {
        throw new Error("Generate the voucher before uploading a signed copy");
      }
      if (
        (lineItem.signedVoucherAttachmentId ?? null) !==
        args.replacesAttachmentId
      ) {
        throw new Error(
          "The signed copy changed meanwhile. Reload and try again"
        );
      }

      const now = Date.now();
      const { signedCopy } = args;
      const objectKey = claimUploadedR2ObjectKey(
        signedCopy.objectKey,
        createR2ClaimOptions(ctx, tx.location, {
          durablePrefix: `reimbursements/${args.reimbursementId}`,
          mimeType: signedCopy.mimeType,
          subfolder: "attachments",
        })
      );
      await tx.mutate.reimbursementAttachment.insert({
        createdAt: now,
        filename: signedCopy.filename,
        id: signedCopy.id,
        mimeType: signedCopy.mimeType ?? null,
        objectKey,
        reimbursementId: args.reimbursementId,
        type: "file",
        url: null,
      });
      await tx.mutate.reimbursementLineItem.update({
        id: args.lineItemId,
        signedVoucherAttachmentId: signedCopy.id,
        updatedAt: now,
      });

      // A replaced copy stays among the request's attachments as evidence.
      const previousId = lineItem.signedVoucherAttachmentId;

      await tx.mutate.reimbursementHistory.insert({
        ...buildHistoryInsert(
          ctx.userId,
          "updated",
          now,
          previousId ? "Signed voucher replaced" : "Signed voucher uploaded"
        ),
        reimbursementId: args.reimbursementId,
      });
    }
  ),
  /**
   * Finance moves a reimbursement to another claimant, at any status, with a
   * reason: the new claimant owns it, sees it and is reimbursed. The bank
   * details become one of the new claimant's saved accounts (cleared when
   * they have none). Vouchers print the claimant as "Claimed by", so any
   * voucher and signed copy are unlinked (the files stay among the
   * attachments) and an approved request queues fresh ones. Expenses aren't
   * posted to the books yet; once they are, this must reverse and repost.
   */
  changeClaimant: defineMutator(
    changeClaimantSchema,
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.create_for_others");
      const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
      assertEntityExists(entity, "Reimbursement");
      assertNotVoided(entity);
      if (entity.userId !== args.previousUserId) {
        throw new Error("The claimant changed meanwhile. Reload and try again");
      }
      if (args.userId === entity.userId) {
        throw new Error("They're already the claimant");
      }
      const previousClaimantId = entity.userId;
      const { title } = entity;
      await assertEligibleClaimant(tx, args.userId);
      const bank = await claimantBankFields(
        tx,
        args.userId,
        args.bankAccountId,
        { required: false }
      );
      const [changedByName, fromName, toName] = await Promise.all([
        userName(tx, ctx.userId),
        userName(tx, previousClaimantId),
        userName(tx, args.userId),
      ]);

      const now = Date.now();
      await tx.mutate.reimbursement.update({
        id: args.id,
        updatedAt: now,
        userId: args.userId,
        ...bank,
      });

      const lineItems = await tx.run(
        zql.reimbursementLineItem.where("reimbursementId", args.id)
      );
      for (const item of lineItems) {
        if (item.voucherAttachmentId || item.signedVoucherAttachmentId) {
          await tx.mutate.reimbursementLineItem.update({
            id: item.id,
            signedVoucherAttachmentId: null,
            updatedAt: now,
            voucherAttachmentId: null,
          });
        }
      }

      await tx.mutate.reimbursementHistory.insert({
        ...buildHistoryInsert(
          ctx.userId,
          "updated",
          now,
          `Claimant changed from ${fromName} to ${toName}. Reason: ${args.reason}`
        ),
        metadata: { fromUserId: previousClaimantId, toUserId: args.userId },
        reimbursementId: args.id,
      });

      if (tx.location !== "server") {
        return;
      }
      // The payout names the claimant: a posted request is reversed and
      // reposted to the new one.
      queuePosting(ctx, tx, args.id, "reimbursement.changeClaimant");
      if (entity.status === "approved") {
        const limitPaise = await readCashVoucherLimit(tx);
        queueVouchers(
          ctx,
          args.id,
          lineItems
            .filter(
              (li) =>
                li.generateVoucher &&
                qualifiesForCashVoucher(li.amountPaise, limitPaise)
            )
            .map((li) => li.id),
          ctx.userId,
          "reimbursement.changeClaimant:queueVouchers"
        );
      }
      const notification = {
        changedAt: now,
        changedByName,
        newClaimantId: args.userId,
        newClaimantName: toName,
        previousClaimantId,
        reason: args.reason,
        reimbursementId: args.id,
        title,
      };
      ctx.asyncTasks?.push({
        fn: async () => {
          const { enqueue } = await import("@pi-dash/jobs/enqueue");
          await enqueue("notify-reimbursement-claimant-changed", notification, {
            traceId: ctx.traceId,
          });
        },
        meta: {
          mutator: "reimbursement.changeClaimant",
          newClaimantId: args.userId,
          previousClaimantId,
          reimbursementId: args.id,
        },
      });
    }
  ),
  create: defineMutator(createArgsSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    assertHasPermission(ctx, "requests.create");
    const { userId } = ctx;
    const { claimantId, forOthers } = await resolveClaimant(
      tx,
      ctx,
      args.claimantUserId
    );
    // For someone else, the bank details come from their saved account.
    const bank = forOthers
      ? await claimantBankFields(tx, claimantId, args.claimantBankAccountId, {
          required: true,
        })
      : null;
    const [creatorName, claimantName] = forOthers
      ? await Promise.all([userName(tx, userId), userName(tx, claimantId)])
      : [undefined, undefined];
    const raisedForNote = forOthers
      ? `Raised by ${creatorName} for ${claimantName}`
      : undefined;
    const now = Date.now();
    const charge = await resolveExpenseCharge(tx, args);
    const voucherPlans = planVoucherFields({
      attachmentsAfter: [],
      attachmentsBefore: [],
      expenseDateChanged: false,
      items: args.lineItems,
      itemsBefore: [],
      limitPaise: await readCashVoucherLimit(tx),
    });

    await tx.mutate.reimbursement.insert({
      approvalScreenshotKey: null,
      createdAt: now,
      createdBy: userId,
      id: args.id,
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      status: "pending",
      submittedAt: now,
      title: args.title,
      updatedAt: now,
      userId: claimantId,
      ...entityFields(args),
      ...bank,
      ...charge,
    });

    await insertRelations(
      fk(args.id),
      args.lineItems,
      args.attachments,
      userId,
      "created",
      now,
      {
        insertAttachment: (data) =>
          tx.mutate.reimbursementAttachment.insert(data),
        insertHistory: (data) =>
          tx.mutate.reimbursementHistory.insert({
            ...data,
            note: raisedForNote ?? data.note,
          }),
        insertLineItem: withPlannedVoucherFields(voucherPlans, (data) =>
          tx.mutate.reimbursementLineItem.insert(data)
        ),
      },
      createR2ClaimOptions(ctx, tx.location, {
        durablePrefix: `reimbursements/${args.id}`,
        subfolder: "attachments",
      })
    );

    if (tx.location === "server") {
      const reimbursementId = args.id;
      const { title } = args;
      const submitter = await tx.run(zql.user.where("id", userId).one());
      const submitterName = forOthers
        ? `${creatorName} for ${claimantName}`
        : submitter?.name;
      ctx.asyncTasks?.push({
        fn: async () => {
          const { enqueue } = await import("@pi-dash/jobs/enqueue");
          await enqueue(
            "notify-reimbursement-submitted",
            {
              reimbursementId,
              submitterName: submitterName ?? "Someone",
              title,
            },
            { traceId: ctx.traceId }
          );
          if (forOthers) {
            await enqueue(
              "notify-reimbursement-raised-for-you",
              {
                claimantId,
                raisedByName: creatorName ?? "Finance",
                reimbursementId,
                title,
              },
              { traceId: ctx.traceId }
            );
          }
        },
        meta: {
          claimantId,
          mutator: "createReimbursement",
          reimbursementId,
          title,
          userId,
        },
      });
    }
  }),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const { userId } = ctx;
      const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
      assertEntityExists(entity, "Reimbursement");
      assertCanDelete(entity, userId, can(ctx, "requests.delete_all"));
      await assertDeletable(tx, entity, [ledgerSource(args.id)]);
      enqueueDeleteR2Object(ctx, tx.location, entity.approvalScreenshotKey, {
        keyPrefixes: reimbursementApprovalKeyPrefixes(args.id),
        meta: {
          mutator: "reimbursement.delete:approvalScreenshot",
          reimbursementId: args.id,
        },
      });

      await deleteAllRelations({
        deleteAttachment: (data) =>
          tx.mutate.reimbursementAttachment.delete(data),
        deleteHistory: (data) => tx.mutate.reimbursementHistory.delete(data),
        deleteLineItem: (data) => tx.mutate.reimbursementLineItem.delete(data),
        onDeleteAttachmentObjectKey: (key) =>
          enqueueDeleteR2Object(ctx, tx.location, key, {
            // A replaced payment proof is kept as an attachment.
            keyPrefixes: [
              ...reimbursementAttachmentKeyPrefixes(args.id),
              ...reimbursementApprovalKeyPrefixes(args.id),
            ],
            meta: {
              mutator: "reimbursement.delete",
              reimbursementId: args.id,
            },
          }),
        queryAttachments: () =>
          tx.run(zql.reimbursementAttachment.where("reimbursementId", args.id)),
        queryHistory: () =>
          tx.run(zql.reimbursementHistory.where("reimbursementId", args.id)),
        queryLineItems: () =>
          tx.run(zql.reimbursementLineItem.where("reimbursementId", args.id)),
      });

      await tx.mutate.reimbursement.delete({ id: args.id });
      queuePosting(ctx, tx, args.id, "reimbursement.delete");
    }
  ),

  generateVoucher: defineMutator(
    z.object({ lineItemId: z.string(), reimbursementId: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const { userId } = ctx;

      const entity = await tx.run(
        zql.reimbursement.where("id", args.reimbursementId).one()
      );
      assertEntityExists(entity, "Reimbursement");
      assertNotVoided(entity);
      if (entity.status !== "approved") {
        throw new Error("Only approved reimbursements can have vouchers");
      }

      const lineItem = await tx.run(
        zql.reimbursementLineItem.where("id", args.lineItemId).one()
      );
      assertEntityExists(lineItem, "Line item");
      const limitPaise = await readCashVoucherLimit(tx);
      if (!qualifiesForCashVoucher(lineItem.amountPaise, limitPaise)) {
        throw new Error(cashVoucherLimitError(limitPaise));
      }

      if (tx.location === "server") {
        const { lineItemId } = args;
        const { reimbursementId } = args;
        const approverUserId = userId;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "generate-cash-voucher",
              {
                approverUserId,
                lineItemId,
                reimbursementId,
              },
              {
                singletonKey: `voucher-${lineItemId}`,
                traceId: ctx.traceId,
              }
            );
          },
          meta: {
            lineItemId,
            mutator: "generateVoucher",
            reimbursementId,
          },
        });
      }
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const { userId } = ctx;
      const canEditAnyStatus = can(ctx, "requests.edit_all_statuses");
      const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
      assertEntityExists(entity, "Reimbursement");
      assertNotVoided(entity);
      assertPending(entity, "reimbursement", "rejected", canEditAnyStatus);

      const now = Date.now();
      await tx.mutate.reimbursement.update({
        id: args.id,
        rejectionReason: args.reason,
        reviewedAt: now,
        reviewedBy: userId,
        status: "rejected",
        updatedAt: now,
      });

      await tx.mutate.reimbursementHistory.insert({
        ...buildHistoryInsert(userId, "rejected", now, args.reason),
        reimbursementId: args.id,
      });
      queuePosting(ctx, tx, args.id, "reimbursement.reject");

      if (tx.location === "server") {
        const { title, userId: ownerId } = entity;
        const { id } = args;
        const { reason } = args;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-reimbursement-rejected",
              {
                reason,
                reimbursementId: id,
                submitterId: ownerId,
                title,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            mutator: "rejectReimbursement",
            reason,
            reimbursementId: id,
            submitterId: ownerId,
            title,
          },
        });
      }
    }
  ),

  resetToPending: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.edit_all_statuses");
      const { userId } = ctx;
      const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
      assertEntityExists(entity, "Reimbursement");
      assertNotVoided(entity);

      if (entity.status === "pending") {
        throw new Error("Reimbursement is already pending");
      }

      const now = Date.now();
      // The payment screenshot stays with the claim as evidence.
      if (tx.location === "server" && entity.approvalScreenshotKey) {
        await keepProofAsAttachment(tx, args.id, entity.approvalScreenshotKey, {
          id: uuidv7(),
          kind: "previous",
          now,
        });
      }

      await tx.mutate.reimbursement.update({
        approvalScreenshotKey: null,
        id: args.id,
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
        status: "pending",
        updatedAt: now,
      });

      await tx.mutate.reimbursementHistory.insert({
        ...buildHistoryInsert(userId, "submitted", now, "Reset to pending"),
        reimbursementId: args.id,
      });
      // Un-approving a posted request reverses it in the books.
      queuePosting(ctx, tx, args.id, "reimbursement.resetToPending");
    }
  ),

  /**
   * Finance changes what the request is charged to, at approval or later,
   * until it is posted to the books: a posted request refuses this
   * (founder decision, finance layer 3-3a).
   */
  setChargedTo: defineMutator(setChargedToSchema, async ({ tx, ctx, args }) => {
    const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
    assertEntityExists(entity, "Reimbursement");
    assertNotVoided(entity);
    assertCanChangeCharge(ctx, entity);
    if (await isPostedInBooks(tx, ledgerSource(args.id))) {
      throw new Error(POSTED_CHARGE_MESSAGE);
    }
    const charge = await resolveExpenseCharge(tx, args, entity);
    const note = await chargeChangeNote(tx, entity, charge);
    const now = Date.now();
    await tx.mutate.reimbursement.update({
      id: args.id,
      updatedAt: now,
      ...charge,
    });
    await tx.mutate.reimbursementHistory.insert({
      ...buildHistoryInsert(ctx.userId, "updated", now, note),
      reimbursementId: args.id,
    });
    queuePosting(ctx, tx, args.id, "reimbursement.setChargedTo");
  }),

  /**
   * Voids the request (finance Option B): it stays, with its attachments,
   * vouchers (their numbers stay used) and history, and takes no further
   * change; the posting run reverses it on the void day. Voiding twice
   * changes nothing.
   */
  void: defineMutator(voidSchema, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "requests.void");
    const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
    assertEntityExists(entity, "Reimbursement");
    if (entity.voidedAt) {
      return;
    }
    await assertNotMatchedToBank(tx, [ledgerSource(args.id)]);
    const now = Date.now();
    await tx.mutate.reimbursement.update({
      id: args.id,
      updatedAt: now,
      voidedAt: now,
      voidedBy: ctx.userId,
      voidReason: args.reason,
    });
    await tx.mutate.reimbursementHistory.insert({
      ...buildHistoryInsert(ctx.userId, "voided", now, args.reason),
      reimbursementId: args.id,
    });
    queuePosting(ctx, tx, args.id, "reimbursement.void");
  }),

  update: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const { userId } = ctx;
    const canEditAnyStatus = can(ctx, "requests.edit_all_statuses");
    const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
    assertEntityExists(entity, "Reimbursement");
    assertNotVoided(entity);
    assertCanModify(
      entity,
      userId,
      can(ctx, "requests.edit_all") || canEditAnyStatus,
      "reimbursement",
      canEditAnyStatus,
      can(ctx, "requests.edit_own")
    );

    const now = Date.now();
    const charge = await resolveExpenseCharge(tx, args, entity);
    const [itemsBefore, attachmentsBefore] = await Promise.all([
      tx.run(zql.reimbursementLineItem.where("reimbursementId", args.id)),
      tx.run(zql.reimbursementAttachment.where("reimbursementId", args.id)),
    ]);
    // Kept payment proof is evidence: only an approver may remove it.
    const keptIds = new Set(args.attachments.map((a) => a.id));
    if (
      attachmentsBefore.some(
        (a) => !keptIds.has(a.id) && isKeptPaymentProof(a)
      ) &&
      !can(ctx, "requests.approve")
    ) {
      throw new Error(KEPT_PROOF_REMOVAL_MESSAGE);
    }
    const voucherPlans = planVoucherFields({
      attachmentsAfter: args.attachments.map((attachment) => ({
        id: attachment.id,
        objectKey: attachment.type === "file" ? attachment.objectKey : null,
        type: attachment.type,
      })),
      attachmentsBefore,
      // Re-picking the same day isn't a change, whatever the time part.
      expenseDateChanged:
        expenseDay(entity.expenseDate) !== expenseDay(args.expenseDate),
      items: args.lineItems,
      itemsBefore,
      limitPaise: await readCashVoucherLimit(tx),
    });

    await tx.mutate.reimbursement.update({
      id: args.id,
      title: args.title,
      updatedAt: now,
      ...entityFields(args),
      ...charge,
    });

    await replaceRelations(
      fk(args.id),
      args.lineItems,
      args.attachments,
      userId,
      now,
      {
        deleteAttachment: (data) =>
          tx.mutate.reimbursementAttachment.delete(data),
        deleteLineItem: (data) => tx.mutate.reimbursementLineItem.delete(data),
        insertAttachment: (data) =>
          tx.mutate.reimbursementAttachment.insert(data),
        insertHistory: (data) => tx.mutate.reimbursementHistory.insert(data),
        insertLineItem: withPlannedVoucherFields(voucherPlans, (data) =>
          tx.mutate.reimbursementLineItem.insert(data)
        ),
        onDeleteAttachmentObjectKey: (key) =>
          enqueueDeleteR2Object(ctx, tx.location, key, {
            // Kept payment proof sits under the approval screenshots.
            keyPrefixes: [
              ...reimbursementAttachmentKeyPrefixes(args.id),
              ...reimbursementApprovalKeyPrefixes(args.id),
            ],
            meta: {
              mutator: "reimbursement.update",
              reimbursementId: args.id,
            },
          }),
        queryAttachments: () =>
          tx.run(zql.reimbursementAttachment.where("reimbursementId", args.id)),
        queryLineItems: () =>
          tx.run(zql.reimbursementLineItem.where("reimbursementId", args.id)),
      },
      createR2ClaimOptions(ctx, tx.location, {
        durablePrefix: `reimbursements/${args.id}`,
        subfolder: "attachments",
      })
    );

    // Links go back once the attachments they point at are re-inserted.
    for (const [id, plan] of voucherPlans) {
      if (plan.links) {
        await tx.mutate.reimbursementLineItem.update({ id, ...plan.links });
      }
    }

    // An approved request edited by an admin gets vouchers for opted-in
    // items that are new, changed or still without one, as approval would.
    if (tx.location === "server" && entity.status === "approved") {
      queueVouchers(
        ctx,
        args.id,
        [...voucherPlans].filter(([, plan]) => plan.queue).map(([id]) => id),
        userId,
        "reimbursement.update:queueVouchers"
      );
    }
    // An edit after posting reverses and reposts it in the books.
    queuePosting(ctx, tx, args.id, "reimbursement.update");
  }),
};
