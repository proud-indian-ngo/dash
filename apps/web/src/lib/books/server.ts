import { db } from "@pi-dash/db";
import type { SweepResult } from "@pi-dash/db/ledger/income-posting";
import {
  postPendingForYear,
  postPendingIncome,
} from "@pi-dash/db/ledger/income-runner";
import {
  type OpeningBalanceInput,
  postOpeningBalance,
  reverseOpeningBalance,
} from "@pi-dash/db/ledger/opening-balance";
import { LedgerError } from "@pi-dash/db/ledger/rules";
import {
  closeYear,
  reopenYear,
  type YearCloseChecklist,
  yearCloseChecklist,
} from "@pi-dash/db/ledger/year-close";

import { queueLedgerSweep } from "@/lib/ledger-posting";
import { withSafeErrors } from "@/lib/safe-errors";

/**
 * Server-only. The treasurer's book-keeping commands, each in one
 * transaction through the posting engine. Refusals from the engine
 * (`LedgerError`) reach the browser as written; anything else is logged by
 * code only and replaced with a generic message.
 */

const MESSAGES = {
  checklist: "The year-close checklist couldn't be loaded.",
  close: "The year couldn't be closed.",
  postOpening: "The opening balances couldn't be posted.",
  postPending: "The waiting records couldn't be posted.",
  reopen: "The year couldn't be reopened.",
  reverseOpening: "The opening balances couldn't be reversed.",
} as const;

const safely = <T>(step: keyof typeof MESSAGES, work: () => Promise<T>) =>
  withSafeErrors(
    {
      fields: { event: "books_failed", step },
      isUserFacing: (error) => error instanceof LedgerError,
      message: MESSAGES[step],
      path: "books",
    },
    work
  );

/** How long the year's posting may run before its checklist is read. */
const YEAR_POSTING_BUDGET_MS = 15_000;

/**
 * Posts the year's income records first (bounded), so the checklist's
 * "waiting to post" reflects the records as they are now; anything not
 * reached still counts as not looked at.
 */
const postYearFirst = async (fiscalYearId: string, actorId: string | null) => {
  await postPendingForYear(fiscalYearId, {
    actorId,
    deadline: Date.now() + YEAR_POSTING_BUDGET_MS,
  });
};

export const loadYearCloseChecklist = (
  fiscalYearId: string,
  actorId: string | null = null
): Promise<YearCloseChecklist> =>
  safely("checklist", async () => {
    await postYearFirst(fiscalYearId, actorId);
    return await db.transaction((tx) => yearCloseChecklist(tx, fiscalYearId));
  });

export const postOpeningBalances = (
  input: OpeningBalanceInput,
  actorId: string
) =>
  safely("postOpening", () =>
    db.transaction((tx) => postOpeningBalance(tx, input, { actorId }))
  );

export const reverseOpeningBalances = (
  input: { id: string; reason: string },
  actorId: string
) =>
  safely("reverseOpening", () =>
    db.transaction((tx) => reverseOpeningBalance(tx, input, { actorId }))
  );

export const closeFiscalYear = (fiscalYearId: string, actorId: string) =>
  safely("close", async () => {
    await postYearFirst(fiscalYearId, actorId);
    return await db.transaction((tx) =>
      closeYear(tx, fiscalYearId, { actorId })
    );
  });

export const reopenFiscalYear = (
  input: { fiscalYearId: string; reason: string },
  actorId: string
) =>
  safely("reopen", () =>
    db.transaction((tx) => reopenYear(tx, input, { actorId }))
  );

/** How long "Post pending" works in the request before the job takes over. */
const POST_PENDING_BUDGET_MS = 20_000;

/**
 * "Post pending": posts every income record not up to date in the books,
 * one transaction per record, for up to 20 seconds; what is left is handed
 * to the `ledger-post-pending` job, so a large backfill never times out.
 */
export const postPendingNow = (actorId: string): Promise<SweepResult> =>
  safely("postPending", async () => {
    // Records unchanged since their last look are skipped; the Sunday run
    // and the year close look at everything.
    const result = await postPendingIncome({
      actorId,
      deadline: Date.now() + POST_PENDING_BUDGET_MS,
      incremental: true,
    });
    if (result.remaining > 0) {
      queueLedgerSweep("manual", actorId);
    }
    return result;
  });

/** After a year reopens, what waited for it posts. */
export const queuePostingAfterReopen = (actorId: string) => {
  queueLedgerSweep("manual", actorId);
};
