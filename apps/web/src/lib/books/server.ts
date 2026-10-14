import { db } from "@pi-dash/db";
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

export const loadYearCloseChecklist = (
  fiscalYearId: string
): Promise<YearCloseChecklist> =>
  safely("checklist", () =>
    db.transaction((tx) => yearCloseChecklist(tx, fiscalYearId))
  );

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
  safely("close", () =>
    db.transaction((tx) => closeYear(tx, fiscalYearId, { actorId }))
  );

export const reopenFiscalYear = (
  input: { fiscalYearId: string; reason: string },
  actorId: string
) =>
  safely("reopen", () =>
    db.transaction((tx) => reopenYear(tx, input, { actorId }))
  );
