import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";

export const notificationMutators = {
  archive: defineMutator(
    z.object({ id: z.string().uuid() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
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
    z.object({ id: z.string().uuid() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      await tx.mutate.notification.update({ id: args.id, read: true });
    }
  ),

  markAsUnread: defineMutator(
    z.object({ id: z.string().uuid() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      await tx.mutate.notification.update({ id: args.id, read: false });
    }
  ),
};
