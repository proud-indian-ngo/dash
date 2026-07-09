import { MAX_RECIPIENT_RETRIES } from "@pi-dash/shared/scheduled-message";
import { defineMutator } from "@rocicorp/zero";
import { uuidv7 } from "uuidv7";
import z from "zod";
import type { AsyncTask } from "../context";
import "../context";
import { assertHasPermission } from "../permissions";
import { zql } from "../schema";
import {
  claimUploadedR2ObjectKey,
  enqueueDeleteR2Object,
} from "./submission-helpers";

async function markRecipientFailed(recipientRowId: string, error: unknown) {
  const { db } = await import("@pi-dash/db");
  const { scheduledMessageRecipient } = await import(
    "@pi-dash/db/schema/scheduled-message"
  );
  const { eq } = await import("drizzle-orm");
  await db
    .update(scheduledMessageRecipient)
    .set({
      error: error instanceof Error ? error.message : String(error),
      status: "failed",
      updatedAt: new Date(),
    })
    .where(eq(scheduledMessageRecipient.id, recipientRowId));
}

const recipientSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["group", "user"]),
});

const attachmentSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  r2Key: z.string(),
});
type ScheduledMessageAttachment = z.infer<typeof attachmentSchema>;

async function claimScheduledMessageAttachments(
  attachments: readonly ScheduledMessageAttachment[] | undefined,
  messageId: string,
  userId: string,
  txLocation: string,
  asyncTasks?: AsyncTask[],
  traceId?: string,
  existingObjectKeys?: ReadonlySet<string>
): Promise<ScheduledMessageAttachment[] | undefined> {
  if (!attachments) {
    return;
  }
  return await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      r2Key: await claimUploadedR2ObjectKey(attachment.r2Key, {
        asyncTasks,
        durablePrefix: messageId,
        existingObjectKeys,
        mimeType: attachment.mimeType,
        subfolder: "scheduled-messages",
        traceId,
        txLocation,
        userId,
      }),
    }))
  );
}

export const scheduledMessageMutators = {
  cancel: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "messages.schedule");

      const existing = await tx.run(
        zql.scheduledMessage.where("id", args.id).one()
      );
      if (!existing) {
        throw new Error("Scheduled message not found");
      }

      const recipients = await tx.run(
        zql.scheduledMessageRecipient.where("scheduledMessageId", args.id)
      );

      const now = Date.now();
      await Promise.all(
        recipients.map(async (r) => {
          if (r.status === "pending") {
            await tx.mutate.scheduledMessageRecipient.update({
              id: r.id,
              status: "cancelled",
              updatedAt: now,
            });
          }
        })
      );

      await tx.mutate.scheduledMessage.update({
        id: args.id,
        updatedAt: now,
      });
    }
  ),
  create: defineMutator(
    z.object({
      attachments: z.array(attachmentSchema).max(5).optional(),
      id: z.string(),
      message: z.string().min(1),
      recipients: z.array(recipientSchema).min(1).max(10),
      scheduledAt: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "messages.schedule");

      const now = Date.now();
      const attachments = await claimScheduledMessageAttachments(
        args.attachments,
        args.id,
        ctx.userId,
        tx.location,
        ctx.asyncTasks,
        ctx.traceId
      );
      await tx.mutate.scheduledMessage.insert({
        attachments,
        createdAt: now,
        createdBy: ctx.userId,
        id: args.id,
        message: args.message,
        scheduledAt: args.scheduledAt,
        updatedAt: now,
      });

      const recipientRows = args.recipients.map((r) => ({
        createdAt: now,
        error: null,
        id: uuidv7(),
        label: r.label,
        recipientId: r.id,
        retryCount: 0,
        scheduledMessageId: args.id,
        sentAt: null,
        status: "pending" as const,
        type: r.type as "group" | "user",
        updatedAt: now,
      }));

      await Promise.all(
        recipientRows.map((row) =>
          tx.mutate.scheduledMessageRecipient.insert(row)
        )
      );

      if (tx.location === "server") {
        const enqueuedAt = now;
        const scheduledMessageId = args.id;
        const { message } = args;
        const { scheduledAt } = args;

        for (const row of recipientRows) {
          ctx.asyncTasks?.push({
            fn: async () => {
              try {
                const { enqueue } = await import("@pi-dash/jobs/enqueue");

                let targetAddress: string;
                if (row.type === "group") {
                  const group = await tx.run(
                    zql.whatsappGroup.where("id", row.recipientId).one()
                  );
                  if (!group) {
                    throw new Error(
                      `WhatsApp group ${row.recipientId} not found`
                    );
                  }
                  targetAddress = group.jid;
                } else {
                  const usr = await tx.run(
                    zql.user.where("id", row.recipientId).one()
                  );
                  if (!usr?.phone) {
                    throw new Error(`User ${row.recipientId} has no phone`);
                  }
                  targetAddress = usr.phone;
                }

                await enqueue(
                  "send-scheduled-whatsapp",
                  {
                    attachments,
                    enqueuedAt,
                    message,
                    recipientRowId: row.id,
                    recipientType: row.type,
                    scheduledMessageId,
                    targetAddress,
                  },
                  {
                    startAfter: new Date(scheduledAt).toISOString(),
                    traceId: ctx.traceId,
                  }
                );
              } catch (error) {
                await markRecipientFailed(row.id, error);
              }
            },
            meta: {
              mutator: "scheduledMessage.create",
              recipientId: row.recipientId,
              scheduledMessageId,
            },
          });
        }
      }
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "messages.schedule");

      const existing = await tx.run(
        zql.scheduledMessage.where("id", args.id).one()
      );
      if (!existing) {
        throw new Error("Scheduled message not found");
      }

      const recipients = await tx.run(
        zql.scheduledMessageRecipient.where("scheduledMessageId", args.id)
      );
      if (recipients.some((r) => r.status === "pending")) {
        throw new Error("Cancel before deleting");
      }

      for (const attachment of existing.attachments ?? []) {
        enqueueDeleteR2Object(ctx, tx.location, attachment.r2Key, {
          mutator: "scheduledMessage.delete",
          scheduledMessageId: args.id,
        });
      }

      // CASCADE will delete recipient rows
      await tx.mutate.scheduledMessage.delete({ id: args.id });
    }
  ),

  retryRecipient: defineMutator(
    z.object({ recipientId: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "messages.schedule");

      const recipient = await tx.run(
        zql.scheduledMessageRecipient.where("id", args.recipientId).one()
      );
      if (!recipient) {
        throw new Error("Recipient not found");
      }
      if (recipient.status !== "failed") {
        throw new Error("Can only retry failed recipients");
      }

      const currentRetryCount = recipient.retryCount ?? 0;
      if (currentRetryCount >= MAX_RECIPIENT_RETRIES) {
        throw new Error("Maximum retries exceeded");
      }

      const now = Date.now();
      await tx.mutate.scheduledMessageRecipient.update({
        error: null,
        id: args.recipientId,
        retryCount: currentRetryCount + 1,
        status: "pending",
        updatedAt: now,
      });

      if (tx.location === "server") {
        const { recipientId } = args;
        const recipientRecipientId = recipient.recipientId;
        const recipientType = recipient.type;
        const { scheduledMessageId } = recipient;

        // Resolve data before pushing to asyncTasks — tx.run() may not work post-commit
        const parent = await tx.run(
          zql.scheduledMessage.where("id", scheduledMessageId).one()
        );
        if (!parent) {
          throw new Error("Parent scheduled message not found");
        }

        let targetAddress: string;
        if (recipientType === "group") {
          const group = await tx.run(
            zql.whatsappGroup.where("id", recipientRecipientId).one()
          );
          if (!group) {
            throw new Error(`WhatsApp group ${recipientRecipientId} not found`);
          }
          targetAddress = group.jid;
        } else {
          const usr = await tx.run(
            zql.user.where("id", recipientRecipientId).one()
          );
          if (!usr?.phone) {
            throw new Error(`User ${recipientRecipientId} has no phone`);
          }
          targetAddress = usr.phone;
        }

        ctx.asyncTasks?.push({
          fn: async () => {
            try {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");

              // 1-minute delay to prevent accidental double-sends
              const startAfter = new Date(Date.now() + 60_000).toISOString();

              await enqueue(
                "send-scheduled-whatsapp",
                {
                  attachments: parent.attachments ?? undefined,
                  enqueuedAt: Date.now(),
                  message: parent.message,
                  recipientRowId: recipientId,
                  recipientType: recipientType as "group" | "user",
                  scheduledMessageId,
                  targetAddress,
                },
                {
                  startAfter,
                  traceId: ctx.traceId,
                }
              );
            } catch (caughtError) {
              await markRecipientFailed(recipientId, caughtError);
            }
          },
          meta: {
            mutator: "scheduledMessage.retryRecipient",
            recipientId: recipientRecipientId,
            scheduledMessageId,
          },
        });
      }
    }
  ),

  update: defineMutator(
    z.object({
      attachments: z.array(attachmentSchema).max(5).optional(),
      id: z.string(),
      message: z.string().min(1),
      recipients: z.array(recipientSchema).min(1).max(10),
      scheduledAt: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "messages.schedule");

      const existing = await tx.run(
        zql.scheduledMessage.where("id", args.id).one()
      );
      if (!existing) {
        throw new Error("Scheduled message not found");
      }

      const existingRecipients = await tx.run(
        zql.scheduledMessageRecipient.where("scheduledMessageId", args.id)
      );
      if (existingRecipients.some((r) => r.status !== "pending")) {
        throw new Error("Can only edit messages with all pending recipients");
      }

      const now = Date.now();
      const existingObjectKeys = new Set(
        (existing.attachments ?? []).map((attachment) => attachment.r2Key)
      );
      const attachments = await claimScheduledMessageAttachments(
        args.attachments,
        args.id,
        ctx.userId,
        tx.location,
        ctx.asyncTasks,
        ctx.traceId,
        existingObjectKeys
      );
      const retainedObjectKeys = new Set(
        (attachments ?? []).map((attachment) => attachment.r2Key)
      );
      for (const attachment of existing.attachments ?? []) {
        if (!retainedObjectKeys.has(attachment.r2Key)) {
          enqueueDeleteR2Object(ctx, tx.location, attachment.r2Key, {
            mutator: "scheduledMessage.update",
            scheduledMessageId: args.id,
          });
        }
      }

      // Delete old recipient rows
      await Promise.all(
        existingRecipients.map(async (r) => {
          await tx.mutate.scheduledMessageRecipient.delete({ id: r.id });
        })
      );

      await tx.mutate.scheduledMessage.update({
        attachments,
        id: args.id,
        message: args.message,
        scheduledAt: args.scheduledAt,
        updatedAt: now,
      });

      // Insert new recipient rows
      const recipientRows = args.recipients.map((r) => ({
        createdAt: now,
        error: null,
        id: uuidv7(),
        label: r.label,
        recipientId: r.id,
        retryCount: 0,
        scheduledMessageId: args.id,
        sentAt: null,
        status: "pending" as const,
        type: r.type as "group" | "user",
        updatedAt: now,
      }));

      await Promise.all(
        recipientRows.map((row) =>
          tx.mutate.scheduledMessageRecipient.insert(row)
        )
      );

      if (tx.location === "server") {
        const enqueuedAt = now;
        const scheduledMessageId = args.id;
        const { message } = args;
        const { scheduledAt } = args;

        for (const row of recipientRows) {
          ctx.asyncTasks?.push({
            fn: async () => {
              try {
                const { enqueue } = await import("@pi-dash/jobs/enqueue");

                let targetAddress: string;
                if (row.type === "group") {
                  const group = await tx.run(
                    zql.whatsappGroup.where("id", row.recipientId).one()
                  );
                  if (!group) {
                    throw new Error(
                      `WhatsApp group ${row.recipientId} not found`
                    );
                  }
                  targetAddress = group.jid;
                } else {
                  const usr = await tx.run(
                    zql.user.where("id", row.recipientId).one()
                  );
                  if (!usr?.phone) {
                    throw new Error(`User ${row.recipientId} has no phone`);
                  }
                  targetAddress = usr.phone;
                }

                await enqueue(
                  "send-scheduled-whatsapp",
                  {
                    attachments,
                    enqueuedAt,
                    message,
                    recipientRowId: row.id,
                    recipientType: row.type,
                    scheduledMessageId,
                    targetAddress,
                  },
                  {
                    startAfter: new Date(scheduledAt).toISOString(),
                    traceId: ctx.traceId,
                  }
                );
              } catch (error) {
                await markRecipientFailed(row.id, error);
              }
            },
            meta: {
              mutator: "scheduledMessage.update",
              recipientId: row.recipientId,
              scheduledMessageId,
            },
          });
        }
      }
    }
  ),
};
