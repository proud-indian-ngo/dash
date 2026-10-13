import { directoryRoleValues } from "@pi-dash/shared/constants";
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

/**
 * Parties with an active directory role. Vendors are parties too, but they
 * belong to the vendors page and stay out of the donor directory unless they
 * also hold a directory role.
 */
const directoryParties = () =>
  zql.party.whereExists("roles", (role) =>
    role.where("active", true).where("role", "IN", [...directoryRoleValues])
  );

/** Identity rows only; contact, ID and bank details come from server functions. */
export const partyQueries = {
  all: defineQuery(({ ctx }) =>
    canSeeParties(ctx)
      ? directoryParties().related("roles").orderBy("displayName", "asc")
      : zql.party.where("id", "__never_match__").related("roles")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    canSeeParties(ctx)
      ? directoryParties().where("id", id).related("roles").one()
      : zql.party.where("id", "__never_match__").related("roles").one()
  ),
};
