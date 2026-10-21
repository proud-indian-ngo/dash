import { PROGRAMME_IDS } from "@pi-dash/shared/constants";
import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

/**
 * `ownerId` limits payments (method, UTR) to the requests that person
 * raised: a programme lead sees their programme's requests, not how the
 * vendor was paid.
 */
function withBase(q: typeof zql.vendorPayment, ownerId?: string) {
  return q
    .related("lineItems", (li) =>
      li.orderBy("sortOrder", "asc").related("category")
    )
    .related("attachments", (a) => a.orderBy("createdAt", "asc"))
    .related("history", (h) => h.orderBy("createdAt", "asc"))
    .related("user")
    .related("vendor")
    .related("invoiceReviewer")
    .related("transactions", (t) =>
      (ownerId === undefined
        ? t
        : t.whereExists("vendorPayment", (vp) => vp.where("userId", ownerId))
      )
        .orderBy("createdAt", "desc")
        .related("user")
        .related("attachments", (a) => a.orderBy("createdAt", "asc"))
        .related("history", (h) => h.orderBy("createdAt", "asc"))
    );
}

function withRelated(q: typeof zql.vendorPayment) {
  return withBase(q).related("event");
}

/**
 * Analytics, the tables and the request header show the programme the request
 * is charged to: the event's programme, or the one chosen without an event.
 */
function withProgramme(q: typeof zql.vendorPayment, ownerId?: string) {
  return (
    withBase(q, ownerId)
      // The programme's lead approves before finance ("Approval policy").
      .related("event", (e) => e.related("programme", (p) => p.related("lead")))
      .related("chargedProgramme", (p) => p.related("lead"))
      .related("leadApprover")
  );
}

/**
 * Without `requests.view_all`: your own requests, and those charged to a
 * programme you lead, which you approve before finance.
 */
function visibleTo(q: typeof zql.vendorPayment, userId: string | undefined) {
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

export const vendorPaymentQueries = {
  all: defineQuery(({ ctx }) =>
    ctx !== null && can(ctx, "requests.view_all")
      ? withProgramme(zql.vendorPayment).orderBy("createdAt", "desc")
      : withProgramme(
          visibleTo(zql.vendorPayment, ctx?.userId),
          ctx?.userId ?? "__never_match__"
        ).orderBy("createdAt", "desc")
  ),
  byCurrentUser: defineQuery(({ ctx }) =>
    withRelated(zql.vendorPayment)
      .where("userId", ctx?.userId)
      .orderBy("createdAt", "desc")
  ),
  byEvent: defineQuery(
    z.object({ eventId: z.string() }),
    ({ args: { eventId }, ctx }) => {
      const query = zql.vendorPayment
        .where("eventId", eventId)
        .related("lineItems")
        .related("user")
        .related("vendor")
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
        ? withProgramme(zql.vendorPayment).where("id", id).one()
        : withProgramme(
            visibleTo(zql.vendorPayment, ctx?.userId),
            ctx?.userId ?? "__never_match__"
          )
            .where("id", id)
            .one()
  ),
};
