import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { can, isExternalUser } from "../permissions";
import { zql } from "../schema";

function canReadScheduledMessages(ctx: Context | null): boolean {
  return Boolean(ctx && !isExternalUser(ctx) && can(ctx, "messages.schedule"));
}

export const scheduledMessageQueries = {
  all: defineQuery(({ ctx }) => {
    const query = zql.scheduledMessage
      .related("creator")
      .related("recipients")
      .orderBy("scheduledAt", "desc");
    return canReadScheduledMessages(ctx)
      ? query
      : query.where("id", "__never_match__");
  }),
  byId: defineQuery(z.object({ id: z.string() }), ({ args, ctx }) => {
    const query = zql.scheduledMessage
      .related("creator")
      .related("recipients")
      .where("id", args.id);
    return (
      canReadScheduledMessages(ctx)
        ? query
        : query.where("id", "__never_match__")
    ).one();
  }),
};
