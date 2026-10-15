import { defineQuery } from "@rocicorp/zero";
import z from "zod";

import { can } from "../permissions";
import { zql } from "../schema";

/**
 * The books: postings, recognition entries, cash-book movements, opening
 * balances and year close history. Finance records, so only finance.view
 * and finance.manage holders, and whoever may post the opening balances,
 * read them (not donors.view). Read-only: every write goes through the
 * server-side posting engine.
 *
 * The books views sum across years (a balance is everything up to a date),
 * so each list is the whole book, newest first. A volunteer-run trust
 * writes a few thousand rows a year; the limit leaves decades of headroom.
 */
export function canSeeBooks(
  ctx: Parameters<typeof can>[0] | null | undefined
): boolean {
  return (
    ctx !== null &&
    ctx !== undefined &&
    (can(ctx, "finance.view") ||
      can(ctx, "finance.manage") ||
      can(ctx, "finance.post_opening"))
  );
}

const BOOK_LIST_LIMIT = 50_000;
const NEVER = "__never_match__";

export const ledgerQueries = {
  /** Recognition entries, for income and expenditure and the balance summary. */
  entries: defineQuery(({ ctx }) =>
    canSeeBooks(ctx)
      ? zql.ledgerEntry
          .orderBy("economicOn", "desc")
          .orderBy("id", "desc")
          .limit(BOOK_LIST_LIMIT)
      : zql.ledgerEntry.where("id", NEVER)
  ),
  /** Cash-book movements of every account, for balances and the cash book. */
  movements: defineQuery(({ ctx }) =>
    canSeeBooks(ctx)
      ? zql.accountMovement
          .orderBy("occurredOn", "desc")
          .orderBy("id", "desc")
          .limit(BOOK_LIST_LIMIT)
      : zql.accountMovement.where("id", NEVER)
  ),
  /** Opening-balance documents, newest first; at most one stands per year. */
  openingBalances: defineQuery(({ ctx }) =>
    canSeeBooks(ctx)
      ? zql.openingBalance.orderBy("createdAt", "desc")
      : zql.openingBalance.where("id", NEVER)
  ),
  /** Postings, for each line's source and reversal. */
  postings: defineQuery(({ ctx }) =>
    canSeeBooks(ctx)
      ? zql.posting
          .orderBy("createdAt", "desc")
          .orderBy("id", "desc")
          .limit(BOOK_LIST_LIMIT)
      : zql.posting.where("id", NEVER)
  ),
  /**
   * Where income sources stand in the books: waiting ones for the Books
   * page's "Waiting to post" list (a handful, never the whole table).
   */
  waiting: defineQuery(({ ctx }) =>
    canSeeBooks(ctx)
      ? zql.ledgerSourceState
          .where("status", "waiting")
          .orderBy("economicOn", "asc")
          .orderBy("id", "asc")
          .limit(BOOK_LIST_LIMIT)
      : zql.ledgerSourceState.where("id", NEVER)
  ),
  /** Payouts with lines the books can't use (adjustments, lines linked to no gift). */
  needsAttention: defineQuery(({ ctx }) =>
    canSeeBooks(ctx)
      ? zql.ledgerSourceState
          .where("attentionCount", ">", 0)
          .orderBy("economicOn", "asc")
          .orderBy("id", "asc")
          .limit(BOOK_LIST_LIMIT)
      : zql.ledgerSourceState.where("id", NEVER)
  ),
  /** One source's state in the books, for its sheet. */
  sourceState: defineQuery(
    z.object({ sourceId: z.string(), sourceType: z.string() }),
    ({ args, ctx }) =>
      canSeeBooks(ctx)
        ? zql.ledgerSourceState
            .where("sourceType", args.sourceType)
            .where("sourceId", args.sourceId)
            .one()
        : zql.ledgerSourceState.where("id", NEVER).one()
  ),
  /**
   * The sources of one type that stand in the books, so a list can offer
   * Void instead of Delete on them (finance Option B). IDs and status only.
   */
  postedSources: defineQuery(
    z.object({ sourceType: z.string() }),
    ({ args, ctx }) =>
      canSeeBooks(ctx)
        ? zql.ledgerSourceState
            .where("status", "posted")
            .where("sourceType", args.sourceType)
            .limit(BOOK_LIST_LIMIT)
        : zql.ledgerSourceState.where("id", NEVER)
  ),
  /** Year close and reopen history, with who did it (name only is read). */
  yearEvents: defineQuery(({ ctx }) => {
    const events = zql.fiscalYearEvent
      .related("actor")
      // Time-ordered IDs give the order the events happened in.
      .orderBy("id", "desc");
    return canSeeBooks(ctx) ? events : events.where("id", NEVER);
  }),
};
