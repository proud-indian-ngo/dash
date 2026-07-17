import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

function withEditionDetails(q: typeof zql.kalakritiEdition) {
  return q
    .related("teamEvent", (event) => event.related("team"))
    .related("memberships")
    .related("assignments");
}

function accessibleEditions(userId: string | undefined, isAdmin: boolean) {
  const query = withEditionDetails(zql.kalakritiEdition);
  return isAdmin
    ? query
    : query.whereExists("memberships", (membership) =>
        membership.where("userId", userId).where("state", "active")
      );
}

export const kalakritiEditionQueries = {
  accessible: defineQuery(({ ctx }) =>
    accessibleEditions(
      ctx?.userId,
      ctx !== null && can(ctx, "kalakriti.admin")
    ).orderBy("year", "desc")
  ),
  byTeamEventId: defineQuery(
    z.object({ teamEventId: z.string() }),
    ({ args, ctx }) =>
      accessibleEditions(
        ctx?.userId,
        ctx !== null && can(ctx, "kalakriti.admin")
      )
        .where("teamEventId", args.teamEventId)
        .one()
  ),
  byYear: defineQuery(z.object({ year: z.number().int() }), ({ args, ctx }) =>
    accessibleEditions(ctx?.userId, ctx !== null && can(ctx, "kalakriti.admin"))
      .where("year", args.year)
      .one()
  ),
};
