import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { can } from "../permissions";
import { zql } from "../schema";

const editionInput = z.object({ editionId: z.string() });

function withVolunteerDetails(
  q: typeof zql.kalakritiEditionMembership,
  editionId: string
) {
  return q
    .related("operations", (operations) =>
      operations
        .where("editionId", editionId)
        .where("type", "volunteer_check_in")
    )
    .related("assignments", (assignment) =>
      assignment.orderBy("createdAt", "asc")
    )
    .related("user");
}

function restrictToVolunteerManagers(
  query: ReturnType<typeof withVolunteerDetails>,
  ctx: Context | null,
  editionId: string
) {
  if (ctx !== null && can(ctx, "kalakriti.admin")) {
    return query;
  }
  if (!ctx?.userId) {
    return query.where("id", "00000000-0000-0000-0000-000000000000");
  }

  return query.whereExists("edition", (edition) =>
    edition.where("id", editionId).where(({ or, and, cmp, exists }) =>
      or(
        exists("memberships", (membership) =>
          membership
            .where("userId", ctx.userId)
            .where("state", "active")
            .whereExists("assignments", (assignment) =>
              assignment.where("responsibility", "IN", [
                "edition_admin",
                "volunteer_coordinator",
              ])
            )
        ),
        and(
          cmp("lifecycle", "!=", "archived"),
          exists("memberships", (membership) =>
            membership
              .where("userId", ctx.userId)
              .where("state", "active")
              .whereExists("assignments", (assignment) =>
                assignment.where(
                  "responsibility",
                  "volunteer_management_volunteer"
                )
              )
          )
        )
      )
    )
  );
}

export const kalakritiAssignmentQueries = {
  myAccess: defineQuery(editionInput, ({ args, ctx }) => {
    const query = zql.kalakritiEditionMembership
      .where("editionId", args.editionId)
      .where("userId", ctx?.userId)
      .where("state", "active")
      .related("assignments", (assignment) =>
        assignment.orderBy("createdAt", "asc")
      );
    return ctx?.userId
      ? query.one()
      : query.where("id", "00000000-0000-0000-0000-000000000000").one();
  }),

  roster: defineQuery(editionInput, ({ args, ctx }) =>
    restrictToVolunteerManagers(
      withVolunteerDetails(zql.kalakritiEditionMembership, args.editionId)
        .where("editionId", args.editionId)
        .where("kind", "volunteer")
        .where("state", "active"),
      ctx,
      args.editionId
    ).orderBy("snapshotName", "asc")
  ),
};
