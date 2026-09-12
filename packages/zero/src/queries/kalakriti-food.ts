import { KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES } from "@pi-dash/shared/kalakriti";
import { defineQuery, type Query } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { can } from "../permissions";
import { type schema, zql } from "../schema";

const input = z.object({ editionId: z.string() });
const NO_ACCESS_ID = "00000000-0000-0000-0000-000000000000";
const FOOD_OPERATIONS = [
  "breakfast",
  "lunch",
  "pickup",
  "volunteer_check_in",
] as const;

function foodEdition(
  edition: typeof zql.kalakritiEdition,
  ctx: Context | null,
  editionId: string
) {
  let query = edition.where("id", editionId);
  if (!ctx) return query.where("id", NO_ACCESS_ID);
  if (can(ctx, "kalakriti.admin")) return query;
  query = query
    .where("lifecycle", "!=", "archived")
    .whereExists("memberships", (membership) =>
      membership
        .where("editionId", editionId)
        .where("userId", ctx.userId)
        .where("kind", "volunteer")
        .where("state", "active")
        .whereExists("assignments", (assignment) =>
          assignment
            .where("editionId", editionId)
            .where("responsibility", "IN", [
              "edition_admin",
              "food_lead",
              "food_member",
            ])
        )
    );
  return query;
}

function foodCenter<R>(
  center: Query<"kalakritiCenter", typeof schema, R>,
  ctx: Context | null,
  editionId: string
) {
  const query = center.where("editionId", editionId);
  if (!ctx) return query.where("id", NO_ACCESS_ID);
  if (can(ctx, "kalakriti.admin")) return query;
  return query.where(({ or, exists }) =>
    or(
      exists("edition", (edition) => foodEdition(edition, ctx, editionId)),
      exists("edition", (edition) =>
        edition
          .where("id", editionId)
          .whereExists("memberships", (membership) =>
            membership
              .where("editionId", editionId)
              .where("userId", ctx.userId)
              .where("kind", "volunteer")
              .where("state", "active")
              .whereExists("assignments", (assignment) =>
                assignment
                  .where("editionId", editionId)
                  .where("responsibility", "liaison_lead")
              )
          )
      ),
      exists("guardianCenters", (guardianCenter) =>
        guardianCenter
          .where("editionId", editionId)
          .whereExists("membership", (membership) =>
            membership
              .where("editionId", editionId)
              .where("userId", ctx.userId)
              .where("state", "active")
              .where("kind", "guardian")
          )
      ),
      exists("assignments", (assignment) =>
        assignment
          .where("editionId", editionId)
          .where(
            "responsibility",
            "IN",
            KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES
          )
          .whereExists("membership", (membership) =>
            membership
              .where("editionId", editionId)
              .where("userId", ctx.userId)
              .where("state", "active")
              .where("kind", "volunteer")
          )
      )
    )
  );
}

export const kalakritiFoodQueries = {
  students: defineQuery(input, ({ args, ctx }) => {
    const query = zql.kalakritiStudent
      .where("editionId", args.editionId)
      .related("center")
      .related("operations", (operations) =>
        operations
          .where("editionId", args.editionId)
          .where("type", "IN", FOOD_OPERATIONS)
      );
    if (!ctx || (!can(ctx, "kalakriti.admin") && !can(ctx, "kalakriti.view")))
      return query.where("id", NO_ACCESS_ID);
    return query
      .whereExists("edition", (edition) =>
        can(ctx, "kalakriti.admin")
          ? edition
          : edition.where("lifecycle", "!=", "archived")
      )
      .whereExists("center", (center) =>
        foodCenter(center, ctx, args.editionId)
      )
      .orderBy("name", "asc");
  }),
  memberships: defineQuery(input, ({ args, ctx }) => {
    const query = zql.kalakritiEditionMembership
      .where("editionId", args.editionId)
      .where(({ or, cmp, exists }) =>
        or(
          cmp("state", "active"),
          exists("operations", (operations) =>
            operations
              .where("editionId", args.editionId)
              .where("type", "IN", ["breakfast", "lunch"])
              .where("supersededByOperationId", "IS", null)
          )
        )
      )
      .related("operations", (operations) =>
        operations
          .where("editionId", args.editionId)
          .where("type", "IN", FOOD_OPERATIONS)
      )
      .related("assignments", (assignments) =>
        assignments
          .where("editionId", args.editionId)
          .whereExists("center", (center) =>
            foodCenter(center, ctx, args.editionId)
          )
          .related("center", (center) =>
            foodCenter(center, ctx, args.editionId)
          )
      )
      .related("guardianCenters", (guardianCenters) =>
        guardianCenters
          .where("editionId", args.editionId)
          .whereExists("center", (center) =>
            foodCenter(center, ctx, args.editionId)
          )
          .related("center", (center) =>
            foodCenter(center, ctx, args.editionId)
          )
      );
    if (!ctx || (!can(ctx, "kalakriti.admin") && !can(ctx, "kalakriti.view")))
      return query.where("id", NO_ACCESS_ID);
    return query
      .whereExists("edition", (edition) =>
        can(ctx, "kalakriti.admin")
          ? edition
          : edition.where("lifecycle", "!=", "archived")
      )
      .where(({ or, and, cmp, exists }) =>
        or(
          exists("edition", (edition) =>
            foodEdition(edition, ctx, args.editionId)
          ),
          and(
            cmp("kind", "guardian"),
            cmp("userId", ctx.userId),
            cmp("state", "active")
          ),
          and(
            cmp("kind", "guardian"),
            exists("guardianCenters", (guardianCenters) =>
              guardianCenters
                .where("editionId", args.editionId)
                .whereExists("center", (center) =>
                  foodCenter(center, ctx, args.editionId)
                )
            )
          ),
          and(
            cmp("kind", "volunteer"),
            exists("assignments", (assignment) =>
              assignment
                .where("editionId", args.editionId)
                .whereExists("center", (center) =>
                  foodCenter(center, ctx, args.editionId)
                )
            )
          )
        )
      )
      .orderBy("snapshotName", "asc");
  }),
};
