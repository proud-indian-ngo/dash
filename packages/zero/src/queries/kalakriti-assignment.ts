import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import type { Context } from "../context";
import { can } from "../permissions";
import { zql } from "../schema";

const editionInput = z.object({ editionId: z.string() });

function withVolunteerDetails(q: typeof zql.kalakritiEditionMembership) {
  return q.related("assignments", (assignment) =>
    assignment.orderBy("createdAt", "asc")
  );
}

function restrictToVolunteerManagers(
  query: ReturnType<typeof withVolunteerDetails>,
  ctx: Context | null,
  editionId: string
) {
  if (ctx !== null && can(ctx, "kalakriti.admin")) {
    return query;
  }
  if (!(ctx && can(ctx, "kalakriti.view"))) {
    return query.where("id", "00000000-0000-0000-0000-000000000000");
  }

  return query.whereExists("edition", (edition) =>
    edition.where("id", editionId).whereExists("memberships", (membership) =>
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
    return ctx && can(ctx, "kalakriti.view")
      ? query.one()
      : query.where("id", "00000000-0000-0000-0000-000000000000").one();
  }),

  roster: defineQuery(editionInput, ({ args, ctx }) =>
    restrictToVolunteerManagers(
      withVolunteerDetails(zql.kalakritiEditionMembership)
        .where("editionId", args.editionId)
        .where("kind", "volunteer")
        .where("state", "active"),
      ctx,
      args.editionId
    ).orderBy("snapshotName", "asc")
  ),
};
