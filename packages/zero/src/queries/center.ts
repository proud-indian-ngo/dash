import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

function withRelated(q: typeof zql.center) {
  return q
    .related("coordinators", (c) => c.related("user"))
    .related("students");
}

export const centerQueries = {
  all: defineQuery(({ ctx }) =>
    ctx != null && can(ctx, "centers.manage")
      ? withRelated(zql.center).orderBy("name", "asc")
      : withRelated(zql.center)
          .whereExists("coordinators", (c) => c.where("userId", ctx?.userId))
          .orderBy("name", "asc")
  ),

  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    ctx != null && can(ctx, "centers.manage")
      ? withRelated(zql.center).where("id", id).one()
      : withRelated(zql.center)
          .where("id", id)
          .whereExists("coordinators", (c) => c.where("userId", ctx?.userId))
          .one()
  ),
};
