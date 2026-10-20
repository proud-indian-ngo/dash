import { defineMutator, type Transaction } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertIsLoggedIn } from "../permissions";
import { type Schema, zql } from "../schema";

type Tx = Transaction<Schema>;

export const notificationMutators = {
  archive: defineMutator(
    z.object({ id: z.uuid() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      await assertOwnNotification(tx, args.id, ctx.userId);
      await tx.mutate.notification.update({
        archived: true,
        id: args.id,
        read: true,
      });
    }
  ),

  markAllAsRead: defineMutator(z.object({}), async ({ tx, ctx }) => {
    assertIsLoggedIn(ctx);
    const unread = await tx.run(
      zql.notification
        .where("userId", ctx.userId)
        .where("read", false)
        .where("archived", false)
    );
    await Promise.all(
      unread.map(async (n) => {
        await tx.mutate.notification.update({ id: n.id, read: true });
      })
    );
  }),
  markAsRead: defineMutator(
    z.object({ id: z.uuid() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      await assertOwnNotification(tx, args.id, ctx.userId);
      await tx.mutate.notification.update({ id: args.id, read: true });
    }
  ),

  markAsUnread: defineMutator(
    z.object({ id: z.uuid() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      await assertOwnNotification(tx, args.id, ctx.userId);
      await tx.mutate.notification.update({ id: args.id, read: false });
    }
  ),
};

async function assertOwnNotification(
  tx: Tx,
  id: string,
  userId: string
): Promise<void> {
  const notification = await tx.run(zql.notification.where("id", id).one());
  if (!notification) {
    throw new Error("Notification not found");
  }
  if (notification.userId !== userId) {
    throw new Error("Forbidden");
  }
}
