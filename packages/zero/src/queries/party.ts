import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

function canSeeParties(ctx: Parameters<typeof can>[0] | null | undefined) {
  return (
    ctx !== null &&
    ctx !== undefined &&
    (can(ctx, "donors.view") || can(ctx, "finance.view"))
  );
}

/** Identity rows only; contact, ID and bank details come from server functions. */
export const partyQueries = {
  all: defineQuery(({ ctx }) =>
    canSeeParties(ctx)
      ? zql.party.related("roles").orderBy("displayName", "asc")
      : zql.party.where("id", "__never_match__").related("roles")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    canSeeParties(ctx)
      ? zql.party.where("id", id).related("roles").one()
      : zql.party.where("id", "__never_match__").related("roles").one()
  ),
};
