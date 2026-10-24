import { PROGRAMME_IDS } from "@pi-dash/shared/constants";
import { defineQuery, type Query } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { can, isExternalUser } from "../permissions";
import { type Schema, zql } from "../schema";

export function restrictToAccessibleEvents<R>(
  query: Query<"teamEvent", Schema, R>,
  ctx: Context | null
): Query<"teamEvent", Schema, R> {
  if (!(ctx && (can(ctx, "events.view_own") || can(ctx, "events.view_all")))) {
    return query.where("id", "00000000-0000-0000-0000-000000000000");
  }
  if (can(ctx, "events.view_all")) {
    return query;
  }
  return restrictEventVisibility(query, ctx);
}

/** Expense access grants a scalar event summary, without its people or content relations. */
export function restrictToExpenseEvents<R>(
  query: Query<"teamEvent", Schema, R>,
  ctx: Context | null
): Query<"teamEvent", Schema, R> {
  if (!ctx) return query.where("id", "__never_match__");
  if (can(ctx, "requests.view_all") || can(ctx, "events.view_all"))
    return query;
  return restrictEventVisibility(query, ctx, true);
}

function restrictEventVisibility<R>(
  query: Query<"teamEvent", Schema, R>,
  ctx: Context,
  includeProgrammeLead = false
): Query<"teamEvent", Schema, R> {
  return query.where(({ or, cmp, exists }) =>
    or(
      cmp("isPublic", true),
      exists("members", (member) => member.where("userId", ctx.userId)),
      exists("team", (team) =>
        team.whereExists("members", (member) =>
          member.where("userId", ctx.userId)
        )
      ),
      ...(includeProgrammeLead
        ? [
            exists("programme", (programme) =>
              programme
                .where("leadUserId", ctx.userId)
                .where("id", "!=", PROGRAMME_IDS.unallocated)
            ),
          ]
        : [])
    )
  );
}

function withBaseRelated(q: typeof zql.teamEvent, ctx: Context | null) {
  return q
    .related("members", (m) => m.related("user"))
    .related("whatsappGroup")
    .related("interests", (i) => {
      if (ctx && !isExternalUser(ctx) && can(ctx, "events.manage_interest")) {
        return i.related("user");
      }
      return i
        .where(({ or, cmp, exists }) =>
          or(
            cmp("userId", ctx?.userId ?? "__never_match__"),
            ...(!ctx || isExternalUser(ctx)
              ? []
              : [
                  exists("event", (event) =>
                    event.whereExists("team", (team) =>
                      team.whereExists("members", (member) =>
                        member.where("userId", ctx.userId).where("role", "lead")
                      )
                    )
                  ),
                ])
          )
        )
        .related("user");
    });
}

/** A series' materialized occurrences as every series consumer reads them. */
function withExceptionRelated(e: typeof zql.teamEvent, ctx: Context | null) {
  return restrictToAccessibleEvents(e, ctx)
    .related("members", (m) => m.related("user"))
    .related("whatsappGroup");
}

function withRelated(q: typeof zql.teamEvent, ctx: Context | null) {
  return withBaseRelated(q, ctx).related("exceptions", (e) =>
    withExceptionRelated(e, ctx)
  );
}

export const teamEventQueries = {
  /** All events the current user can access: public + private from their teams. */
  allAccessible: defineQuery(({ ctx }) =>
    restrictToAccessibleEvents(
      withRelated(zql.teamEvent, ctx).related("team"),
      ctx
    )
      .where("cancelledAt", "IS", null)
      .where("seriesId", "IS", null)
      .orderBy("startTime", "desc")
  ),
  byCurrentUser: defineQuery(({ ctx }) =>
    restrictToAccessibleEvents(
      withRelated(zql.teamEvent, ctx).related("team"),
      ctx
    )
      .whereExists("members", (m) => m.where("userId", ctx?.userId))
      .where("cancelledAt", "IS", null)
      .where("seriesId", "IS", null)
      .orderBy("startTime", "desc")
  ),
  /** Like byCurrentUser but includes cancelled events (for activity feed). */
  byCurrentUserAll: defineQuery(({ ctx }) =>
    restrictToAccessibleEvents(
      withRelated(zql.teamEvent, ctx).related("team"),
      ctx
    )
      .whereExists("members", (m) => m.where("userId", ctx?.userId))
      .where("seriesId", "IS", null)
      .orderBy("startTime", "desc")
  ),
  byId: defineQuery(z.object({ id: z.string() }), ({ args: { id }, ctx }) =>
    restrictToAccessibleEvents(
      withRelated(zql.teamEvent, ctx)
        .related("team")
        .related("programme")
        // Event detail lists partners and prefills the edit form.
        .related("partners", (p) => p.orderBy("createdAt", "asc")),
      ctx
    )
      .where("id", id)
      .one()
  ),
  // No page uses this today; the event page reads `reimbursement.byEvent`
  // and `vendorPayment.byEvent`. Its expenses follow the same rule: every
  // request with `requests.view_all`, otherwise only the caller's own, so
  // line items (and voucher payees) never reach other event viewers.
  byIdWithExpenses: defineQuery(
    z.object({ id: z.string() }),
    ({ args: { id }, ctx }) => {
      const viewAll = ctx !== null && can(ctx, "requests.view_all");
      return restrictToAccessibleEvents(withRelated(zql.teamEvent, ctx), ctx)
        .where("id", id)
        .related("reimbursements", (r) => {
          const scoped = viewAll ? r : r.where("userId", ctx?.userId ?? "");
          return scoped
            .related("lineItems", (li) => li.orderBy("sortOrder", "asc"))
            .related("user")
            .orderBy("createdAt", "desc");
        })
        .related("vendorPayments", (vp) => {
          const scoped = viewAll ? vp : vp.where("userId", ctx?.userId ?? "");
          return scoped
            .related("lineItems", (li) => li.orderBy("sortOrder", "asc"))
            .related("user")
            .related("vendor")
            .orderBy("createdAt", "desc");
        })
        .one();
    }
  ),
  byTeam: defineQuery(
    z.object({ teamId: z.string() }),
    ({ args: { teamId }, ctx }) =>
      restrictToAccessibleEvents(
        // The team page's events table shows and filters by programme, and
        // its edit form prefills partners. An edited occurrence can carry
        // its own of both, so exceptions load them too.
        withBaseRelated(zql.teamEvent, ctx)
          .related("programme")
          .related("partners", (p) => p.orderBy("createdAt", "asc"))
          .related("exceptions", (e) =>
            withExceptionRelated(e, ctx)
              .related("programme")
              .related("partners", (p) => p.orderBy("createdAt", "asc"))
          ),
        ctx
      )
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
      .related("exceptions", (e) =>
        restrictToAccessibleEvents(e, ctx).related("members")
      )
      .orderBy("startTime", "desc")
  ),
};
