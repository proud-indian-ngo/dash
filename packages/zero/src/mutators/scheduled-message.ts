import { MAX_RECIPIENT_RETRIES } from "@pi-dash/shared/scheduled-message";
import { defineMutator } from "@rocicorp/zero";
import { uuidv7 } from "uuidv7";
import z from "zod";
import "../context";
import { assertHasPermission } from "../permissions";
import { zql } from "../schema";

async function markRecipientFailed(recipientRowId: string, error: unknown) {
  const { db } = await import("@pi-dash/db");
  const { scheduledMessageRecipient } = await import(
    "@pi-dash/db/schema/scheduled-message"
  );
  const { eq } = await import("drizzle-orm");
  await db
    .update(scheduledMessageRecipient)
    .set({
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
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

export const scheduledMessageMutators = {
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
      await tx.mutate.scheduledMessage.insert({
        id: args.id,
        message: args.message,
        scheduledAt: args.scheduledAt,
        attachments: args.attachments ?? null,
        createdBy: ctx.userId,
        createdAt: now,
        updatedAt: now,
      });

      const recipientRows = args.recipients.map((r) => ({
        id: uuidv7(),
        scheduledMessageId: args.id,
        recipientId: r.id,
        label: r.label,
        type: r.type as "group" | "user",
        status: "pending" as const,
        error: null,
        sentAt: null,
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      }));

      for (const row of recipientRows) {
        await tx.mutate.scheduledMessageRecipient.insert(row);
      }

      if (tx.location === "server") {
        const enqueuedAt = now;
        const scheduledMessageId = args.id;
        const message = args.message;
        const attachments = args.attachments;
        const scheduledAt = args.scheduledAt;

        for (const row of recipientRows) {
          ctx.asyncTasks?.push({
            meta: {
              mutator: "scheduledMessage.create",
              scheduledMessageId,
              recipientId: row.recipientId,
            },
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
                    recipientRowId: row.id,
                    scheduledMessageId,
                    recipientType: row.type,
                    targetAddress,
                    message,
                    attachments: attachments ?? undefined,
                    enqueuedAt,
                  },
                  { startAfter: new Date(scheduledAt).toISOString() }
                );
              } catch (error) {
                await markRecipientFailed(row.id, error);
              }
            },
          });
        }
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

      // Delete old recipient rows
      for (const r of existingRecipients) {
        await tx.mutate.scheduledMessageRecipient.delete({ id: r.id });
      }

      await tx.mutate.scheduledMessage.update({
        id: args.id,
        message: args.message,
        scheduledAt: args.scheduledAt,
        attachments: args.attachments ?? null,
        updatedAt: now,
      });

      // Insert new recipient rows
      const recipientRows = args.recipients.map((r) => ({
        id: uuidv7(),
        scheduledMessageId: args.id,
        recipientId: r.id,
        label: r.label,
        type: r.type as "group" | "user",
        status: "pending" as const,
        error: null,
        sentAt: null,
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      }));

      for (const row of recipientRows) {
        await tx.mutate.scheduledMessageRecipient.insert(row);
      }

      if (tx.location === "server") {
        const enqueuedAt = now;
        const scheduledMessageId = args.id;
        const message = args.message;
        const attachments = args.attachments;
        const scheduledAt = args.scheduledAt;

        for (const row of recipientRows) {
          ctx.asyncTasks?.push({
            meta: {
              mutator: "scheduledMessage.update",
              scheduledMessageId,
              recipientId: row.recipientId,
            },
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
                    recipientRowId: row.id,
                    scheduledMessageId,
                    recipientType: row.type,
                    targetAddress,
                    message,
                    attachments: attachments ?? undefined,
                    enqueuedAt,
                  },
                  { startAfter: new Date(scheduledAt).toISOString() }
                );
              } catch (error) {
                await markRecipientFailed(row.id, error);
              }
            },
          });
        }
      }
    }
  ),

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
      for (const r of recipients) {
        if (r.status === "pending") {
          await tx.mutate.scheduledMessageRecipient.update({
            id: r.id,
            status: "cancelled",
            updatedAt: now,
          });
        }
      }

      await tx.mutate.scheduledMessage.update({
        id: args.id,
        updatedAt: now,
      });
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
        id: args.recipientId,
        status: "pending",
        error: null,
        retryCount: currentRetryCount + 1,
        updatedAt: now,
      });

      if (tx.location === "server") {
        const recipientId = args.recipientId;
        const recipientRecipientId = recipient.recipientId;
        const recipientType = recipient.type;
        const scheduledMessageId = recipient.scheduledMessageId;

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
          meta: {
            mutator: "scheduledMessage.retryRecipient",
            scheduledMessageId,
            recipientId: recipientRecipientId,
          },
          fn: async () => {
            try {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");

              // 1-minute delay to prevent accidental double-sends
              const startAfter = new Date(Date.now() + 60_000).toISOString();

              await enqueue(
                "send-scheduled-whatsapp",
                {
                  recipientRowId: recipientId,
                  scheduledMessageId,
                  recipientType: recipientType as "group" | "user",
                  targetAddress,
                  message: parent.message,
                  attachments: parent.attachments ?? undefined,
                  enqueuedAt: Date.now(),
                },
                { startAfter }
              );
            } catch (error) {
              await markRecipientFailed(recipientId, error);
            }
          },
        });
      }
    }
  ),
};
