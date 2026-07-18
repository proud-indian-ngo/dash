import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

const centerInput = z.object({
  centerId: z.string(),
  editionId: z.string(),
});
const NO_ACCESS_ID = "00000000-0000-0000-0000-000000000000";

export const kalakritiStudentQueries = {
  ageCategoriesByCenter: defineQuery(centerInput, ({ args, ctx }) => {
    const query = zql.kalakritiAgeCategory
      .where("editionId", args.editionId)
      .whereExists("quotas", (quota) => quota.where("centerId", args.centerId));
    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.orderBy("sortOrder", "asc");
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
                  assignment.where("responsibility", "edition_admin")
                )
            )
          ),
          exists("quotas", (quota) =>
            quota
              .where("centerId", args.centerId)
              .whereExists("center", (center) =>
                center.whereExists("guardianCenters", (guardianCenter) =>
                  guardianCenter.whereExists("membership", (membership) =>
                    membership
                      .where("userId", ctx.userId)
                      .where("state", "active")
                  )
                )
              )
          ),
          exists("quotas", (quota) =>
            quota
              .where("centerId", args.centerId)
              .whereExists("center", (center) =>
                center.whereExists("assignments", (assignment) =>
                  assignment
                    .where("responsibility", "liaison")
                    .whereExists("membership", (membership) =>
                      membership
                        .where("userId", ctx.userId)
                        .where("state", "active")
                    )
                )
              )
          )
        )
      )
      .orderBy("sortOrder", "asc");
  }),
  quotasByCenter: defineQuery(centerInput, ({ args, ctx }) => {
    const query = zql.kalakritiCenterAgeQuota
      .where("editionId", args.editionId)
      .where("centerId", args.centerId);
    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.orderBy("createdAt", "asc");
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
                  assignment.where("responsibility", "edition_admin")
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
                .where("responsibility", "liaison")
                .whereExists("membership", (membership) =>
                  membership
                    .where("userId", ctx.userId)
                    .where("state", "active")
                )
            )
          )
        )
      )
      .orderBy("createdAt", "asc");
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
                  assignment.where("responsibility", "edition_admin")
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
                .where("responsibility", "liaison")
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
