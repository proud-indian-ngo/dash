import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";

export const notificationMutators = {
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

  archive: defineMutator(
    z.object({ id: z.string().uuid() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      await tx.mutate.notification.update({
        id: args.id,
        archived: true,
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
    for (const n of unread) {
      await tx.mutate.notification.update({ id: n.id, read: true });
    }
  }),
};
