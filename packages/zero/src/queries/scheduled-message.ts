import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { zql } from "../schema";

export const scheduledMessageQueries = {
  all: defineQuery(() =>
    zql.scheduledMessage.related("creator").orderBy("scheduledAt", "desc")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args }) =>
    zql.scheduledMessage.where("id", args.id).related("creator").one()
  ),
};
