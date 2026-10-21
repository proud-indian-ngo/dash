import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

const canSeeGrants = (ctx: Parameters<typeof can>[0] | null | undefined) =>
  ctx !== null && ctx !== undefined && can(ctx, "finance.view");

/** Grants are finance data: finance.view only. A handful of rows, so every grant syncs. */
export const grantQueries = {
  all: defineQuery(({ ctx }) =>
    (canSeeGrants(ctx)
      ? zql.grantAgreement
      : zql.grantAgreement.where("id", "__never_match__")
    )
      .related("party")
      .related("programme")
      .related("project")
      .related("tranches")
      .orderBy("startsOn", "desc")
      .orderBy("id", "asc")
  ),
  /** The grant page: its tranches, budget and the contributions linked to it. */
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    (canSeeGrants(ctx)
      ? zql.grantAgreement.where("id", id)
      : zql.grantAgreement.where("id", "__never_match__")
    )
      .related("party")
      .related("programme")
      .related("project")
      .related("tranches", (t) => t.orderBy("expectedOn", "asc"))
      .related("budgetLines")
      .related("contributions", (c) =>
        c.related("refunds").orderBy("receivedOn", "asc").orderBy("id", "asc")
      )
      .one()
  ),
};
