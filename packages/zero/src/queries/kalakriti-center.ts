import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

const editionInput = z.object({ editionId: z.string() });
const NO_ACCESS_ID = "00000000-0000-0000-0000-000000000000";

export const kalakritiCenterQueries = {
  guardianAssignments: defineQuery(editionInput, ({ args, ctx }) => {
    const query = zql.kalakritiGuardianCenter
      .where("editionId", args.editionId)
      .related("center")
      .related("membership");
    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.orderBy("createdAt", "asc");
    }
    if (!(ctx && can(ctx, "kalakriti.view"))) {
      return query.where("id", NO_ACCESS_ID);
    }
    return query
      .whereExists("edition", (edition) =>
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
      )
      .orderBy("createdAt", "asc");
  }),

  liaisonAssignments: defineQuery(editionInput, ({ args, ctx }) => {
    const query = zql.kalakritiAssignment
      .where("editionId", args.editionId)
      .where("responsibility", "liaison")
      .related("center")
      .related("membership");
    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.orderBy("createdAt", "asc");
    }
    if (!(ctx && can(ctx, "kalakriti.view"))) {
      return query.where("id", NO_ACCESS_ID);
    }
    return query
      .whereExists("edition", (edition) =>
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
                    cmp("responsibility", "volunteer_coordinator")
                  )
                )
              )
          )
      )
      .orderBy("createdAt", "asc");
  }),
  visible: defineQuery(editionInput, ({ args, ctx }) => {
    let query = zql.kalakritiCenter.where("editionId", args.editionId);
    if (ctx !== null && can(ctx, "kalakriti.admin")) {
      return query.orderBy("name", "asc");
    }
    if (!(ctx && can(ctx, "kalakriti.view"))) {
      return query.where("id", NO_ACCESS_ID);
    }

    query = query.where(({ or, exists }) =>
      or(
        exists("edition", (edition) =>
          edition
            .where("id", args.editionId)
            .whereExists("memberships", (membership) =>
              membership
                .where("userId", ctx.userId)
                .where("state", "active")
                .whereExists("assignments", (assignment) =>
                  assignment.where(({ or: assignmentOr, cmp }) =>
                    assignmentOr(
                      cmp("responsibility", "edition_admin"),
                      cmp("responsibility", "volunteer_coordinator")
                    )
                  )
                )
            )
        ),
        exists("guardianCenters", (guardianCenter) =>
          guardianCenter.whereExists("membership", (membership) =>
            membership.where("userId", ctx.userId).where("state", "active")
          )
        ),
        exists("assignments", (assignment) =>
          assignment.whereExists("membership", (membership) =>
            membership.where("userId", ctx.userId).where("state", "active")
          )
        )
      )
    );
    return query.orderBy("name", "asc");
  }),
};
