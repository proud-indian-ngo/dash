import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertHasPermission } from "../permissions";
import { zql } from "../schema";

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
        status: "pending",
        recipients: args.recipients,
        attachments: args.attachments ?? null,
        createdBy: ctx.userId,
        createdAt: now,
        updatedAt: now,
      });

      if (tx.location === "server") {
        const enqueuedAt = now;
        const recipients = args.recipients;
        const scheduledMessageId = args.id;
        const message = args.message;
        const attachments = args.attachments;
        const scheduledAt = args.scheduledAt;

        for (const recipient of recipients) {
          ctx.asyncTasks?.push({
            meta: {
              mutator: "scheduledMessage.create",
              scheduledMessageId,
              recipientId: recipient.id,
            },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");

              let targetAddress: string;
              if (recipient.type === "group") {
                const group = await tx.run(
                  zql.whatsappGroup.where("id", recipient.id).one()
                );
                if (!group) {
                  throw new Error(`WhatsApp group ${recipient.id} not found`);
                }
                targetAddress = group.jid;
              } else {
                const usr = await tx.run(
                  zql.user.where("id", recipient.id).one()
                );
                if (!usr?.phone) {
                  throw new Error(`User ${recipient.id} has no phone`);
                }
                targetAddress = usr.phone;
              }

              await enqueue(
                "send-scheduled-whatsapp",
                {
                  scheduledMessageId,
                  recipientType: recipient.type,
                  targetAddress,
                  message,
                  attachments: attachments ?? undefined,
                  enqueuedAt,
                },
                { startAfter: new Date(scheduledAt).toISOString() }
              );
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
      if (existing.status !== "pending") {
        throw new Error("Can only edit pending messages");
      }

      const now = Date.now();
      await tx.mutate.scheduledMessage.update({
        id: args.id,
        message: args.message,
        scheduledAt: args.scheduledAt,
        recipients: args.recipients,
        attachments: args.attachments ?? null,
        updatedAt: now,
      });

      if (tx.location === "server") {
        const enqueuedAt = now;
        const recipients = args.recipients;
        const scheduledMessageId = args.id;
        const message = args.message;
        const attachments = args.attachments;
        const scheduledAt = args.scheduledAt;

        for (const recipient of recipients) {
          ctx.asyncTasks?.push({
            meta: {
              mutator: "scheduledMessage.update",
              scheduledMessageId,
              recipientId: recipient.id,
            },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");

              let targetAddress: string;
              if (recipient.type === "group") {
                const group = await tx.run(
                  zql.whatsappGroup.where("id", recipient.id).one()
                );
                if (!group) {
                  throw new Error(`WhatsApp group ${recipient.id} not found`);
                }
                targetAddress = group.jid;
              } else {
                const usr = await tx.run(
                  zql.user.where("id", recipient.id).one()
                );
                if (!usr?.phone) {
                  throw new Error(`User ${recipient.id} has no phone`);
                }
                targetAddress = usr.phone;
              }

              await enqueue(
                "send-scheduled-whatsapp",
                {
                  scheduledMessageId,
                  recipientType: recipient.type,
                  targetAddress,
                  message,
                  attachments: attachments ?? undefined,
                  enqueuedAt,
                },
                { startAfter: new Date(scheduledAt).toISOString() }
              );
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
      if (existing.status !== "pending") {
        throw new Error("Can only cancel pending messages");
      }

      await tx.mutate.scheduledMessage.update({
        id: args.id,
        status: "cancelled",
        updatedAt: Date.now(),
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
      if (existing.status === "pending") {
        throw new Error("Cancel before deleting");
      }

      await tx.mutate.scheduledMessage.delete({ id: args.id });
    }
  ),
};
