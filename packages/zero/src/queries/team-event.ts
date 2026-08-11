import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import type { Context } from "../context";
import { can } from "../permissions";
import { zql } from "../schema";

export function restrictToAccessibleEvents<T extends typeof zql.teamEvent>(
  query: T,
  ctx: Context | null
): T {
  if (!(ctx && (can(ctx, "events.view_own") || can(ctx, "events.view_all")))) {
    return query.where("id", "00000000-0000-0000-0000-000000000000") as T;
  }
  if (can(ctx, "events.view_all")) {
    return query;
  }
  return query.where(({ or, cmp, exists }) =>
    or(
      cmp("isPublic", true),
      exists("members", (member) => member.where("userId", ctx.userId)),
      exists("team", (team) =>
        team.whereExists("members", (member) =>
          member.where("userId", ctx.userId)
        )
      )
    )
  ) as T;
}

function withRelated(q: typeof zql.teamEvent) {
  return q
    .related("members", (m) => m.related("user"))
    .related("whatsappGroup")
    .related("interests", (i) => i.related("user"))
    .related("exceptions", (e) =>
      e.related("members", (m) => m.related("user")).related("whatsappGroup")
    );
}

export const teamEventQueries = {
  /** All events the current user can access: public + private from their teams. */
  allAccessible: defineQuery(({ ctx }) =>
    restrictToAccessibleEvents(withRelated(zql.teamEvent).related("team"), ctx)
      .where("cancelledAt", "IS", null)
      .where("seriesId", "IS", null)
      .orderBy("startTime", "desc")
  ),
  byCurrentUser: defineQuery(({ ctx }) =>
    restrictToAccessibleEvents(withRelated(zql.teamEvent).related("team"), ctx)
      .whereExists("members", (m) => m.where("userId", ctx?.userId))
      .where("cancelledAt", "IS", null)
      .where("seriesId", "IS", null)
      .orderBy("startTime", "desc")
  ),
  /** Like byCurrentUser but includes cancelled events (for activity feed). */
  byCurrentUserAll: defineQuery(({ ctx }) =>
    restrictToAccessibleEvents(withRelated(zql.teamEvent).related("team"), ctx)
      .whereExists("members", (m) => m.where("userId", ctx?.userId))
      .where("seriesId", "IS", null)
      .orderBy("startTime", "desc")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    restrictToAccessibleEvents(withRelated(zql.teamEvent).related("team"), ctx)
      .where("id", id)
      .one()
  ),
  byIdWithExpenses: defineQuery(
    z.object({ id: z.string() }),
    ({ args: { id }, ctx }) =>
      restrictToAccessibleEvents(withRelated(zql.teamEvent), ctx)
        .where("id", id)
        .related("reimbursements", (r) =>
          r
            .related("lineItems", (li) => li.orderBy("sortOrder", "asc"))
            .related("user")
            .orderBy("createdAt", "desc")
        )
        .related("vendorPayments", (vp) =>
          vp
            .related("lineItems", (li) => li.orderBy("sortOrder", "asc"))
            .related("user")
            .related("vendor")
            .orderBy("createdAt", "desc")
        )
        .one()
  ),
  byTeam: defineQuery(
    z.object({ teamId: z.string() }),
    ({ args: { teamId }, ctx }) =>
      restrictToAccessibleEvents(withRelated(zql.teamEvent), ctx)
        .where("teamId", teamId)
        .where("cancelledAt", "IS", null)
        .where("seriesId", "IS", null)
        .orderBy("startTime", "desc")
  ),
  public: defineQuery(({ ctx }) =>
    restrictToAccessibleEvents(zql.teamEvent, ctx)
      .where("isPublic", true)
      .where("cancelledAt", "IS", null)
      .where("seriesId", "IS", null)
      .related("members")
      .related("team")
      .related("exceptions", (e) => e.related("members"))
      .orderBy("startTime", "desc")
  ),
};
