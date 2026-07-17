import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

const editionInput = z.object({ editionId: z.string() });
const NO_ACCESS_ID = "00000000-0000-0000-0000-000000000000";

export const kalakritiEligibilityQueries = {
  ageCategories: defineQuery(editionInput, ({ args, ctx }) => {
    let query = zql.kalakritiAgeCategory.where("editionId", args.editionId);
    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.orderBy("sortOrder", "asc");
    }
    if (!(ctx && can(ctx, "kalakriti.view"))) {
      return query.where("id", NO_ACCESS_ID);
    }
    query = query.whereExists("edition", (edition) =>
      edition
        .where("id", args.editionId)
        .whereExists("memberships", (membership) =>
          membership
            .where("userId", ctx.userId)
            .where("state", "active")
            .whereExists("assignments", (assignment) =>
              assignment.where(({ or, cmp }) =>
                or(
                  cmp("responsibility", "edition_admin"),
                  cmp("responsibility", "overall_events_lead"),
                  cmp("responsibility", "competition_category_lead")
                )
              )
            )
        )
    );
    return query.orderBy("sortOrder", "asc");
  }),
  quotas: defineQuery(editionInput, ({ args, ctx }) => {
    let query = zql.kalakritiCenterAgeQuota.where("editionId", args.editionId);
    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.orderBy("createdAt", "asc");
    }
    if (!(ctx && can(ctx, "kalakriti.view"))) {
      return query.where("id", NO_ACCESS_ID);
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
    return query.orderBy("createdAt", "asc");
  }),
};
