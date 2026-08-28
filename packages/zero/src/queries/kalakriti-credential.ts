import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

const editionInput = z.object({
  editionId: z.string(),
});
const NO_ACCESS_ID = "00000000-0000-0000-0000-000000000000";

export const kalakritiCredentialQueries = {
  visibleForAdmin: defineQuery(editionInput, ({ args, ctx }) => {
    const query = zql.kalakritiCredential
      .where("editionId", args.editionId)
      .related("student", (student) => student.related("center"))
      .related("membership", (membership) =>
        membership.related("assignments", (assignment) =>
          assignment.where("isPrimary", true)
        )
      );
    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.orderBy("humanId", "asc");
    }
    if (!(ctx && can(ctx, "kalakriti.view"))) {
      return query.where("id", NO_ACCESS_ID);
    }
    return query
      .whereExists("edition", (edition) =>
        edition.whereExists("memberships", (membership) =>
          membership
            .where("userId", ctx.userId)
            .where("state", "active")
            .whereExists("assignments", (assignment) =>
              assignment.where("responsibility", "edition_admin")
            )
        )
      )
      .orderBy("humanId", "asc");
  }),
};
