import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { isExternalUser } from "../permissions";
import { zql } from "../schema";

export const scheduledMessageQueries = {
  all: defineQuery(({ ctx }) => {
    const query = zql.scheduledMessage
      .related("creator")
      .related("recipients")
      .orderBy("scheduledAt", "desc");
    return isExternalUser(ctx) ? query.where("id", "__never_match__") : query;
  }),
  byId: defineQuery(z.object({ id: z.string() }), ({ args, ctx }) => {
    const query = zql.scheduledMessage
      .related("creator")
      .related("recipients")
      .where("id", args.id);
    return (
      isExternalUser(ctx) ? query.where("id", "__never_match__") : query
    ).one();
  }),
};
