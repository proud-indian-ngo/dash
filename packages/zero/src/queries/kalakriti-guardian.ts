import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

const editionInput = z.object({ editionId: z.string() });

export const kalakritiGuardianQueries = {
  roster: defineQuery(editionInput, ({ args, ctx }) => {
    let query = zql.kalakritiEditionMembership
      .where("editionId", args.editionId)
      .where("kind", "guardian");

    if (!(ctx !== null && can(ctx, "kalakriti.admin"))) {
      if (!(ctx && can(ctx, "kalakriti.view"))) {
        return query.where("id", "00000000-0000-0000-0000-000000000000");
      }
      query = query.whereExists("edition", (edition) =>
        edition
          .where("id", args.editionId)
          .whereExists("memberships", (membership) =>
            membership
              .where("userId", ctx.userId)
              .where("state", "active")
              .whereExists("assignments", (assignment) =>
                assignment.where("responsibility", "edition_admin")
              )
          )
      );
    }

    return query.orderBy("snapshotName", "asc");
  }),
};
