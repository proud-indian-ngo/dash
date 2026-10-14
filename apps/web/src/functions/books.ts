import type { SweepResult } from "@pi-dash/db/ledger/income-posting";
import type { YearCloseChecklist } from "@pi-dash/db/ledger/year-close";
import { countWaitingLedgerSources } from "@pi-dash/db/queries/ledger-sources";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import {
  assertServerAnyPermission,
  assertServerPermission,
} from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import {
  closeFiscalYear,
  loadYearCloseChecklist,
  postOpeningBalances,
  postPendingNow,
  queuePostingAfterReopen,
  reopenFiscalYear,
  reverseOpeningBalances,
} from "@/lib/books/server";
import { authMiddleware } from "@/middleware/auth";

/**
 * The books (Finance → Books). Reading the year-close checklist is a read
 * for finance.view holders and the treasurer. Posting and reversing the
 * opening balances (finance.post_opening), closing (finance.close_year) and
 * reopening the year (finance.reopen_year) are audited with IDs and counts
 * only; amounts, names and reasons stay in the books, never in the audit
 * metadata.
 */

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-MM-dd");
const paise = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const reason = z.string().trim().min(5, "Say why").max(500);

const openingLine = z.object({
  accountHeadId: z.uuid().nullish(),
  amountPaise: paise,
  fundId: z.uuid().nullish(),
  kind: z.enum(["account", "asset", "liability", "fund"]),
  memo: z.string().trim().max(120).nullish(),
  orgAccountId: z.uuid().nullish(),
});

export const getYearCloseChecklist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ fiscalYearId: z.uuid() }))
  .handler(async ({ context, data }): Promise<YearCloseChecklist> => {
    await assertServerAnyPermission(context.session, [
      "finance.view",
      "finance.manage",
      "finance.close_year",
    ]);
    return await loadYearCloseChecklist(data.fiscalYearId);
  });

export const postOpeningBalancesFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      caConfirmedOn: isoDay,
      caName: z.string().trim().min(1).max(120),
      fiscalYearId: z.uuid(),
      id: z.uuid(),
      lines: z.array(openingLine).min(1).max(60),
    })
  )
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.post_opening");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    const count = (kind: string) =>
      data.lines.filter((line) => line.kind === kind).length;
    const document = await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "books.opening_balance.post",
        metadata: {
          accountLineCount: count("account"),
          assetLineCount: count("asset"),
          fundLineCount: count("fund"),
          liabilityLineCount: count("liability"),
        },
        target: { id: data.id, type: "opening_balance" },
      },
      () => postOpeningBalances(data, session.user.id)
    );
    return { id: document.id };
  });

export const reverseOpeningBalancesFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.uuid(), reason }))
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.post_opening");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "books.opening_balance.reverse",
        target: { id: data.id, type: "opening_balance" },
      },
      () => reverseOpeningBalances(data, session.user.id)
    );
    return { id: data.id };
  });

export const closeFiscalYearFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ fiscalYearId: z.uuid() }))
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.close_year");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "books.year.close",
        target: { id: data.fiscalYearId, type: "fiscal_year" },
      },
      () => closeFiscalYear(data.fiscalYearId, session.user.id)
    );
  });

export const reopenFiscalYearFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ fiscalYearId: z.uuid(), reason }))
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.reopen_year");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    const result = await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "books.year.reopen",
        target: { id: data.fiscalYearId, type: "fiscal_year" },
      },
      () => reopenFiscalYear(data, session.user.id)
    );
    queuePostingAfterReopen(session.user.id);
    return result;
  });

/**
 * "Post pending" on the Books page: posts every income record that isn't
 * up to date in the books (finance.post_pending). Audited with the number
 * of records waiting when it started; what it posted stays in the books.
 */
export const postPendingFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SweepResult> => {
    await assertServerPermission(context.session, "finance.post_pending");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    const waitingCount = await countWaitingLedgerSources();
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "books.post_pending",
        metadata: { waitingCount },
        target: { type: "books" },
      },
      () => postPendingNow(session.user.id)
    );
  });
