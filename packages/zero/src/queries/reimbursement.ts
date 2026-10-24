import { PROGRAMME_IDS } from "@pi-dash/shared/constants";
import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { can } from "../permissions";
import { zql } from "../schema";
import { restrictToExpenseEvents } from "./team-event";

/**
 * `viewerId` limits files to receipts unless the viewer is the claimant: a
 * programme lead never syncs payment proof, vouchers, signed vouchers or
 * payee signatures.
 */
function withBase(q: typeof zql.reimbursement, viewerId?: string) {
  return (
    q
      .related("lineItems", (li) =>
        li.orderBy("sortOrder", "asc").related("category")
      )
      .related("attachments", (a) =>
        (viewerId === undefined
          ? a
          : a.where(({ cmp, exists, or }) =>
              or(
                cmp("purpose", "receipt"),
                exists("reimbursement", (r) => r.where("userId", viewerId))
              )
            )
        ).orderBy("createdAt", "asc")
      )
      .related("history", (h) => h.orderBy("createdAt", "asc"))
      .related("user")
      // "Raised by X for Y" when finance raised it for someone else.
      .related("creator")
  );
}

function withRelated(q: typeof zql.reimbursement, ctx: Context | null) {
  return withBase(q).related("event", (e) => restrictToExpenseEvents(e, ctx));
}

/**
 * Analytics, the tables and the request header show the programme the request
 * is charged to: the event's programme, or the one chosen without an event.
 */
function withProgramme(
  q: typeof zql.reimbursement,
  ctx: Context | null,
  viewerId?: string
) {
  return (
    withBase(q, viewerId)
      // The programme's lead approves before finance ("Approval policy").
      .related("event", (e) =>
        restrictToExpenseEvents(e, ctx).related("programme", (p) =>
          p.related("lead")
        )
      )
      .related("chargedProgramme", (p) => p.related("lead"))
      .related("leadApprover")
  );
}

/**
 * Without `requests.view_all`: your own requests, and those charged to a
 * programme you lead, which you approve before finance.
 */
function visibleTo(q: typeof zql.reimbursement, userId: string | undefined) {
  if (!userId) {
    return q.where("userId", "__never_match__");
  }
  return q.where(({ cmp, exists, or }) =>
    or(
      cmp("userId", userId),
      // The Unallocated holder has no lead step, so no lead sees its requests.
      exists("chargedProgramme", (p) =>
        p
          .where("leadUserId", userId)
          .where("id", "!=", PROGRAMME_IDS.unallocated)
      ),
      exists("event", (e) =>
        e.whereExists("programme", (p) =>
          p
            .where("leadUserId", userId)
            .where("id", "!=", PROGRAMME_IDS.unallocated)
        )
      )
    )
  );
}

export const reimbursementQueries = {
  all: defineQuery(({ ctx }) =>
    ctx !== null && can(ctx, "requests.view_all")
      ? withProgramme(zql.reimbursement, ctx).orderBy("createdAt", "desc")
      : withProgramme(
          visibleTo(zql.reimbursement, ctx?.userId),
          ctx,
          ctx?.userId ?? "__never_match__"
        ).orderBy("createdAt", "desc")
  ),
  byCurrentUser: defineQuery(({ ctx }) =>
    withRelated(zql.reimbursement, ctx)
      .where("userId", ctx?.userId)
      .orderBy("createdAt", "desc")
  ),
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) => {
      const query = zql.reimbursement
        .where("eventId", eventId)
        .related("lineItems")
        .related("user")
        .orderBy("createdAt", "desc");
      return ctx !== null && can(ctx, "requests.view_all")
        ? query
        : query.where("userId", ctx?.userId);
    }
  ),
  byId: defineQuery(
    z.object({
      id: z.string(),
    }),
    ({ args: { id }, ctx }) =>
      ctx !== null && can(ctx, "requests.view_all")
        ? withProgramme(zql.reimbursement, ctx).where("id", id).one()
        : withProgramme(
            visibleTo(zql.reimbursement, ctx?.userId),
            ctx,
            ctx?.userId ?? "__never_match__"
          )
            .where("id", id)
            .one()
  ),
};
