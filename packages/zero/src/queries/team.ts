import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { zql } from "../schema";

function withRelated(q: typeof zql.team) {
  return q
    .related("members", (m) => m.related("user"))
    .related("whatsappGroup");
}

export const teamQueries = {
  all: defineQuery(({ ctx }) =>
    ctx?.role === "admin"
      ? withRelated(zql.team).orderBy("name", "asc")
      : withRelated(zql.team)
          .whereExists("members", (m) => m.where("userId", ctx?.userId ?? ""))
          .orderBy("name", "asc")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    ctx?.role === "admin"
      ? withRelated(zql.team).where("id", id).one()
      : withRelated(zql.team)
          .where("id", id)
          .whereExists("members", (m) => m.where("userId", ctx?.userId ?? ""))
          .one()
  ),
  byCurrentUser: defineQuery(({ ctx }) =>
    withRelated(zql.team)
      .whereExists("members", (m) => m.where("userId", ctx?.userId ?? ""))
      .orderBy("name", "asc")
  ),
};
