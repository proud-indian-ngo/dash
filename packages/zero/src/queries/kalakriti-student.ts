import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";
import { buildKalakritiLiaisonResponsibilityOr } from "./kalakriti-liaison-scope";

const centerInput = z.object({
  centerId: z.string(),
  editionId: z.string(),
});
const NO_ACCESS_ID = "00000000-0000-0000-0000-000000000000";

export const kalakritiStudentQueries = {
  ageCategoriesByCenter: defineQuery(centerInput, ({ args, ctx }) => {
    const query = zql.kalakritiAgeCategory.where("editionId", args.editionId);
    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.orderBy("sortOrder", "asc");
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
            .where(({ or, exists }) =>
              or(
                exists("assignments", (assignment) =>
                  assignment.where(({ or: assignmentOr, cmp }) =>
                    assignmentOr(
                      cmp("responsibility", "edition_admin"),
                      cmp("responsibility", "liaison_lead")
                    )
                  )
                ),
                exists("guardianCenters", (guardianCenter) =>
                  guardianCenter.where("centerId", args.centerId)
                ),
                exists("assignments", (assignment) =>
                  assignment
                    .where(({ or: liaisonOr, cmp }) =>
                      buildKalakritiLiaisonResponsibilityOr(liaisonOr, cmp)
                    )
                    .where("centerId", args.centerId)
                )
              )
            )
        )
      )
      .orderBy("sortOrder", "asc");
  }),
  visibleByCenter: defineQuery(centerInput, ({ args, ctx }) => {
    const query = zql.kalakritiStudent
      .where("editionId", args.editionId)
      .where("centerId", args.centerId)
      .related("ageCategory")
      .related("derivedAgeCategory")
      .related("entryMemberships")
      .related("center");
    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.orderBy("humanId", "asc");
    }
    if (!(ctx && can(ctx, "kalakriti.view"))) {
      return query.where("id", NO_ACCESS_ID);
    }
    return query
      .where(({ or, exists }) =>
        or(
          exists("edition", (edition) =>
            edition.whereExists("memberships", (membership) =>
              membership
                .where("userId", ctx.userId)
                .where("state", "active")
                .whereExists("assignments", (assignment) =>
                  assignment.where(({ or: assignmentOr, cmp }) =>
                    assignmentOr(
                      cmp("responsibility", "edition_admin"),
                      cmp("responsibility", "liaison_lead")
                    )
                  )
                )
            )
          ),
          exists("center", (center) =>
            center.whereExists("guardianCenters", (guardianCenter) =>
              guardianCenter.whereExists("membership", (membership) =>
                membership.where("userId", ctx.userId).where("state", "active")
              )
            )
          ),
          exists("center", (center) =>
            center.whereExists("assignments", (assignment) =>
              assignment
                .where(({ or: liaisonOr, cmp }) =>
                  buildKalakritiLiaisonResponsibilityOr(liaisonOr, cmp)
                )
                .whereExists("membership", (membership) =>
                  membership
                    .where("userId", ctx.userId)
                    .where("state", "active")
                )
            )
          )
        )
      )
      .orderBy("humanId", "asc");
  }),
};
