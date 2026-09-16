import { KALAKRITI_INVENTORY_RESPONSIBILITIES } from "@pi-dash/shared/kalakriti-inventory";
import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { can } from "../permissions";
import { zql } from "../schema";

const input = z.object({ editionId: z.uuid() });
const NO_ACCESS_ID = "00000000-0000-0000-0000-000000000000";

function inventoryEdition(
  edition: typeof zql.kalakritiEdition,
  ctx: Context | null,
  editionId: string
) {
  const query = edition.where("id", editionId);
  if (!ctx) return query.where("id", NO_ACCESS_ID);
  if (can(ctx, "kalakriti.admin")) return query;
  if (!can(ctx, "kalakriti.view")) return query.where("id", NO_ACCESS_ID);
  return query
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
              ...KALAKRITI_INVENTORY_RESPONSIBILITIES,
            ])
        )
    );
}

function history(editionId: string, ctx: Context | null) {
  return zql.kalakritiInventoryTransaction
    .where("editionId", editionId)
    .whereExists("edition", (edition) =>
      inventoryEdition(edition, ctx, editionId)
    )
    .related("item")
    .related("volunteer", (membership) => membership.related("user"))
    .related("competition")
    .related("actor")
    .orderBy("createdAt", "desc")
    .orderBy("id", "asc");
}

export const kalakritiInventoryQueries = {
  items: defineQuery(input, ({ args, ctx }) =>
    zql.kalakritiInventoryItem
      .where("editionId", args.editionId)
      .whereExists("edition", (edition) =>
        inventoryEdition(edition, ctx, args.editionId)
      )
      .orderBy("name", "asc")
      .orderBy("id", "asc")
  ),
  transactions: defineQuery(input, ({ args, ctx }) =>
    history(args.editionId, ctx)
  ),
  byItem: defineQuery(input.extend({ itemId: z.uuid() }), ({ args, ctx }) =>
    history(args.editionId, ctx).where("itemId", args.itemId)
  ),
  volunteers: defineQuery(input, ({ args, ctx }) =>
    zql.kalakritiEditionMembership
      .where("editionId", args.editionId)
      .where("kind", "volunteer")
      .where("state", "active")
      .whereExists("edition", (edition) =>
        inventoryEdition(edition, ctx, args.editionId)
      )
      .related("user")
      .orderBy("id", "asc")
  ),
  assignments: defineQuery(
    input.extend({ volunteerMembershipId: z.uuid() }),
    ({ args, ctx }) =>
      zql.kalakritiEditionMembership
        .where("id", args.volunteerMembershipId)
        .where("editionId", args.editionId)
        .where("kind", "volunteer")
        .where("state", "active")
        .whereExists("edition", (edition) =>
          inventoryEdition(edition, ctx, args.editionId)
        )
        .related("assignments", (assignment) =>
          assignment.where("editionId", args.editionId).related("competition")
        )
        .one()
  ),
};
