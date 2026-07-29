import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

function withEditionDetails(q: typeof zql.kalakritiEdition) {
  return q;
}

function accessibleEditions(
  userId: string | undefined,
  isAdmin: boolean,
  canView: boolean
) {
  const query = withEditionDetails(zql.kalakritiEdition);
  if (isAdmin) {
    return query;
  }
  if (!canView) {
    return query.where("year", -1);
  }
  return query.whereExists("memberships", (membership) =>
    membership.where("userId", userId).where("state", "active")
  );
}

export const kalakritiEditionQueries = {
  accessible: defineQuery(({ ctx }) =>
    accessibleEditions(
      ctx?.userId,
      ctx !== null && can(ctx, "kalakriti.admin"),
      ctx !== null && can(ctx, "kalakriti.view")
    ).orderBy("year", "desc")
  ),
  byTeamEventId: defineQuery(
    z.object({ teamEventId: z.string() }),
    ({ args, ctx }) =>
      accessibleEditions(
        ctx?.userId,
        ctx !== null && can(ctx, "kalakriti.admin"),
        ctx !== null && can(ctx, "kalakriti.view")
      )
        .where("teamEventId", args.teamEventId)
        .one()
  ),
  byYear: defineQuery(z.object({ year: z.number().int() }), ({ args, ctx }) =>
    accessibleEditions(
      ctx?.userId,
      ctx !== null && can(ctx, "kalakriti.admin"),
      ctx !== null && can(ctx, "kalakriti.view")
    )
      .where("year", args.year)
      .one()
  ),
};
