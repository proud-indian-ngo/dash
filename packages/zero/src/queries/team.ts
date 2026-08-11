import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can, isExternalUser } from "../permissions";
import { zql } from "../schema";

function withRelated(q: typeof zql.team) {
  return q
    .related("members", (m) => m.related("user"))
    .related("whatsappGroup");
}

export const teamQueries = {
  all: defineQuery(({ ctx }) => {
    if (isExternalUser(ctx)) {
      return withRelated(zql.team).where("id", "__never_match__");
    }
    if (ctx !== null && can(ctx, "teams.view_all")) {
      return withRelated(zql.team).orderBy("name", "asc");
    }
    return withRelated(zql.team)
      .whereExists("members", (m) => m.where("userId", ctx?.userId))
      .orderBy("name", "asc");
  }),
  byCurrentUser: defineQuery(({ ctx }) => {
    const query = withRelated(zql.team).orderBy("name", "asc");
    return isExternalUser(ctx)
      ? query.where("id", "__never_match__")
      : query.whereExists("members", (m) => m.where("userId", ctx?.userId));
  }),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) => {
    if (isExternalUser(ctx)) {
      return withRelated(zql.team).where("id", "__never_match__").one();
    }
    if (ctx !== null && can(ctx, "teams.view_all")) {
      return withRelated(zql.team).where("id", id).one();
    }
    return withRelated(zql.team)
      .where("id", id)
      .whereExists("members", (m) => m.where("userId", ctx?.userId))
      .one();
  }),
};
