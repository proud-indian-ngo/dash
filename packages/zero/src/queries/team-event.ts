import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

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
  byTeam: defineQuery(
    z.object({ teamId: z.string() }),
    ({ args: { teamId }, ctx }) =>
      ctx != null && can(ctx, "events.view_all")
        ? withRelated(zql.teamEvent)
            .where("teamId", teamId)
            .where("cancelledAt", "IS", null)
            .where("seriesId", "IS", null)
            .orderBy("startTime", "desc")
        : withRelated(zql.teamEvent)
            .where("teamId", teamId)
            .where("cancelledAt", "IS", null)
            .where("seriesId", "IS", null)
            .where(({ or, cmp, exists }) =>
              or(
                cmp("isPublic", true),
                exists("members", (m) => m.where("userId", ctx?.userId)),
                exists("team", (t) =>
                  t.whereExists("members", (m) =>
                    m.where("userId", ctx?.userId)
                  )
                )
              )
            )
            .orderBy("startTime", "desc")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    ctx != null && can(ctx, "events.view_all")
      ? withRelated(zql.teamEvent).where("id", id).one()
      : withRelated(zql.teamEvent)
          .where("id", id)
          .where(({ or, cmp, exists }) =>
            or(
              cmp("isPublic", true),
              exists("members", (m) => m.where("userId", ctx?.userId)),
              exists("team", (t) =>
                t.whereExists("members", (m) => m.where("userId", ctx?.userId))
              )
            )
          )
          .one()
  ),
  public: defineQuery(() =>
    zql.teamEvent
      .where("isPublic", true)
      .where("cancelledAt", "IS", null)
      .where("seriesId", "IS", null)
      .related("members")
      .related("team")
      .related("exceptions", (e) => e.related("members"))
      .orderBy("startTime", "desc")
  ),
  byCurrentUser: defineQuery(({ ctx }) =>
    withRelated(zql.teamEvent)
      .related("team")
      .whereExists("members", (m) => m.where("userId", ctx?.userId))
      .where("cancelledAt", "IS", null)
      .where("seriesId", "IS", null)
      .orderBy("startTime", "desc")
  ),
  /** Like byCurrentUser but includes cancelled events (for activity feed). */
  byCurrentUserAll: defineQuery(({ ctx }) =>
    withRelated(zql.teamEvent)
      .related("team")
      .whereExists("members", (m) => m.where("userId", ctx?.userId))
      .where("seriesId", "IS", null)
      .orderBy("startTime", "desc")
  ),
  byIdWithExpenses: defineQuery(
    z.object({ id: z.string() }),
    ({ args: { id }, ctx }) =>
      ctx != null && can(ctx, "events.view_all")
        ? withRelated(zql.teamEvent)
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
        : withRelated(zql.teamEvent)
            .where("id", id)
            .where(({ or, cmp, exists }) =>
              or(
                cmp("isPublic", true),
                exists("members", (m) => m.where("userId", ctx?.userId)),
                exists("team", (t) =>
                  t.whereExists("members", (m) =>
                    m.where("userId", ctx?.userId)
                  )
                )
              )
            )
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
  /** All events the current user can access: public + private from their teams. */
  allAccessible: defineQuery(({ ctx }) =>
    ctx != null && can(ctx, "events.view_all")
      ? withRelated(zql.teamEvent)
          .related("team")
          .where("cancelledAt", "IS", null)
          .where("seriesId", "IS", null)
          .orderBy("startTime", "desc")
      : withRelated(zql.teamEvent)
          .related("team")
          .where("cancelledAt", "IS", null)
          .where("seriesId", "IS", null)
          .where(({ or, cmp, exists }) =>
            or(
              cmp("isPublic", true),
              exists("members", (m) => m.where("userId", ctx?.userId)),
              exists("team", (t) =>
                t.whereExists("members", (m) => m.where("userId", ctx?.userId))
              )
            )
          )
          .orderBy("startTime", "desc")
  ),
};
