import { defineQuery, type Query } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { can } from "../permissions";
import { type schema, zql } from "../schema";

function scopedAssignments(
  query: Query<"kalakritiJudgeAssignment", typeof schema>,
  editionId: string,
  ctx: Context
) {
  const scoped = query.where("editionId", editionId);
  if (can(ctx, "kalakriti.admin")) return scoped;
  return scoped.whereExists("competition", (competition) =>
    competition.where("editionId", editionId).where(({ or, exists }) =>
      or(
        exists("edition", (edition) =>
          edition.whereExists("memberships", (membership) =>
            membership
              .where("editionId", editionId)
              .where("userId", ctx.userId)
              .where("state", "active")
              .where("kind", "volunteer")
              .whereExists("assignments", (assignment) =>
                assignment
                  .where("editionId", editionId)
                  .where("responsibility", "IN", [
                    "edition_admin",
                    "volunteer_coordinator",
                    "overall_events_lead",
                  ])
              )
          )
        ),
        exists("assignments", (assignment) =>
          assignment
            .where("editionId", editionId)
            .where("responsibility", "competition_coordinator")
            .whereExists("membership", (membership) =>
              membership
                .where("editionId", editionId)
                .where("userId", ctx.userId)
                .where("state", "active")
                .where("kind", "volunteer")
            )
        ),
        exists("category", (category) =>
          category.whereExists("assignments", (assignment) =>
            assignment
              .where("editionId", editionId)
              .where("responsibility", "competition_category_lead")
              .whereExists("membership", (membership) =>
                membership
                  .where("editionId", editionId)
                  .where("userId", ctx.userId)
                  .where("state", "active")
                  .where("kind", "volunteer")
              )
          )
        )
      )
    )
  );
}

export const kalakritiAttendeeQueries = {
  visible: defineQuery(
    z.object({ editionId: z.string(), kind: z.enum(["guest", "judge"]) }),
    ({ args, ctx }) => {
      const query = zql.kalakritiAttendee
        .where("editionId", args.editionId)
        .where("kind", args.kind)
        .where("archivedAt", "IS", null)
        .related("operations", (operations) =>
          operations.where("editionId", args.editionId)
        )
        .related("judgeAssignments", (assignment) =>
          (ctx
            ? scopedAssignments(assignment, args.editionId, ctx)
            : assignment.where("id", "00000000-0000-0000-0000-000000000000")
          ).related("competition")
        )
        .orderBy("name", "asc");
      if (ctx && can(ctx, "kalakriti.admin")) return query;
      if (!ctx)
        return query.where("id", "00000000-0000-0000-0000-000000000000");
      return query
        .whereExists("edition", (edition) =>
          edition.where("lifecycle", "!=", "archived")
        )
        .where(({ or, exists, and, cmp }) =>
          or(
            exists("edition", (edition) =>
              edition.whereExists("memberships", (membership) =>
                membership
                  .where("editionId", args.editionId)
                  .where("userId", ctx.userId)
                  .where("state", "active")
                  .where("kind", "volunteer")
                  .whereExists("assignments", (assignment) =>
                    assignment
                      .where("editionId", args.editionId)
                      .where(
                        "responsibility",
                        "IN",
                        args.kind === "judge"
                          ? [
                              "edition_admin",
                              "volunteer_coordinator",
                              "overall_events_lead",
                            ]
                          : ["edition_admin", "volunteer_coordinator"]
                      )
                  )
              )
            ),
            and(
              cmp("kind", "judge"),
              exists("judgeAssignments", (assignment) =>
                scopedAssignments(assignment, args.editionId, ctx)
              )
            )
          )
        );
    }
  ),
};
