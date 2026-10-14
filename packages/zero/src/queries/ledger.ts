import { defineQuery } from "@rocicorp/zero";

import { zql } from "../schema";
import { canSeeSettlements } from "./gateway-settlement";

/**
 * The books: postings, recognition entries, cash-book movements, opening
 * balances and year close history. Finance records, so only finance.view
 * and finance.manage holders read them (not donors.view). Read-only: every
 * write goes through the server-side posting engine.
 *
 * The books views sum across years (a balance is everything up to a date),
 * so each list is the whole book, newest first. A volunteer-run trust
 * writes a few thousand rows a year; the limit leaves decades of headroom.
 */
export const canSeeBooks = canSeeSettlements;

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
  /** Year close and reopen history, with who did it (name only is read). */
  yearEvents: defineQuery(({ ctx }) => {
    const events = zql.fiscalYearEvent
      .related("actor")
      .orderBy("occurredAt", "desc");
    return canSeeBooks(ctx) ? events : events.where("id", NEVER);
  }),
};
