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
import { defineMutator, type Transaction } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { assertHasPermission, assertIsLoggedIn, can } from "../permissions";
import { type Schema, zql } from "../schema";
import {
  mutatorAttachmentSchema as attachmentSchema,
  mutatorLineItemSchema as lineItemSchema,
} from "../shared-schemas";
import {
  assertCanChangeCharge,
  chargeChangeNote,
  expenseChargeArgs,
  resolveExpenseCharge,
  setChargedToSchema,
} from "./expense-charge";
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
import { planVoucherFields, type VoucherPlan } from "./voucher-fields";

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
  payeeName: z
    .string()
    .trim()
    .max(PAYEE_NAME_MAX)
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

const fk = (id: string) => ({ reimbursementId: id });

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

      if (
        entity.approvalScreenshotKey &&
        entity.approvalScreenshotKey !== approvalScreenshotKey
      ) {
        enqueueDeleteR2Object(ctx, tx.location, entity.approvalScreenshotKey, {
          keyPrefixes: reimbursementApprovalKeyPrefixes(args.id),
          meta: {
            mutator: "reimbursement.approve:replaceApprovalScreenshot",
            reimbursementId: args.id,
          },
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
  create: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    assertHasPermission(ctx, "requests.create");
    const { userId } = ctx;
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
      id: args.id,
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      status: "pending",
      submittedAt: now,
      title: args.title,
      updatedAt: now,
      userId,
      ...entityFields(args),
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
        insertHistory: (data) => tx.mutate.reimbursementHistory.insert(data),
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
      const submitterName = submitter?.name;
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
        },
        meta: {
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
            keyPrefixes: reimbursementAttachmentKeyPrefixes(args.id),
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

      if (entity.status === "pending") {
        throw new Error("Reimbursement is already pending");
      }

      const now = Date.now();
      enqueueDeleteR2Object(ctx, tx.location, entity.approvalScreenshotKey, {
        keyPrefixes: reimbursementApprovalKeyPrefixes(args.id),
        meta: {
          mutator: "reimbursement.resetToPending",
          reimbursementId: args.id,
        },
      });

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
    }
  ),

  /**
   * Finance changes what the request is charged to, at approval or later.
   * Expenses are not posted to the books yet; once they are, a posted
   * request will refuse this.
   */
  setChargedTo: defineMutator(setChargedToSchema, async ({ tx, ctx, args }) => {
    const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
    assertEntityExists(entity, "Reimbursement");
    assertCanChangeCharge(ctx, entity);
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
  }),

  update: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const { userId } = ctx;
    const canEditAnyStatus = can(ctx, "requests.edit_all_statuses");
    const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
    assertEntityExists(entity, "Reimbursement");
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
    const voucherPlans = planVoucherFields({
      attachmentsAfter: args.attachments.map((attachment) => ({
        id: attachment.id,
        objectKey: attachment.type === "file" ? attachment.objectKey : null,
        type: attachment.type,
      })),
      attachmentsBefore,
      expenseDateChanged: entity.expenseDate !== args.expenseDate,
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
            keyPrefixes: reimbursementAttachmentKeyPrefixes(args.id),
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
  }),
};
