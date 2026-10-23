import type { SweepResult } from "@pi-dash/db/ledger/income-posting";
import type { YearCloseChecklist } from "@pi-dash/db/ledger/year-close";
import { countWaitingLedgerSources } from "@pi-dash/db/queries/ledger-sources";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import z from "zod";

import {
  assertServerAnyPermission,
  assertServerPermission,
  buildSessionContext,
} from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import {
  issueAuditPackToken,
  liftIdleTimeout,
  prepareAuditPack as prepareAuditPackFor,
  preparedAuditMetadata,
} from "@/lib/audit-pack/server";
import {
  closeFiscalYear,
  loadYearCloseChecklist,
  postAuditedFiguresNow,
  postOpeningBalances,
  postPendingNow,
  queuePostingAfterReopen,
  reopenFiscalYear,
  reverseAuditedFiguresNow,
  reverseOpeningBalances,
  skipAuditedFiguresNow,
} from "@/lib/books/server";
import { buildCaWorkbook, type CaWorkbookFile } from "@/lib/ca-workbook/server";
import { HttpError } from "@/lib/http-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { authMiddleware } from "@/middleware/auth";

/**
 * The books (Finance → Books). Reading the year-close checklist is a read
 * for finance.view holders and the treasurer. Posting and reversing the
 * opening balances (finance.post_opening), closing (finance.close_year) and
 * reopening the year (finance.reopen_year), and matching, skipping or
 * reversing a year's audited figures (finance.adjust) are audited with IDs
 * and counts only; amounts, names and reasons stay in the books, never in
 * the audit metadata.
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

const signedPaise = z
  .number()
  .int()
  .min(-Number.MAX_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);

const auditedFiguresInput = z.object({
  added: z
    .array(
      z.object({
        accountHeadId: z.uuid(),
        auditedPaise: signedPaise,
        counterHeadId: z.uuid().nullish(),
        kind: z.enum(["asset", "liability"]),
        memo: z.string().trim().max(120).nullish(),
      })
    )
    .max(30),
  caName: z.string().trim().min(1).max(120),
  fiscalYearId: z.uuid(),
  id: z.uuid(),
  lines: z
    .array(
      z.object({
        auditedPaise: signedPaise,
        booksPaise: signedPaise,
        counterHeadId: z.uuid().nullish(),
        key: z.string().min(1).max(300),
      })
    )
    .min(1)
    .max(500),
  signedOn: isoDay,
  transfers: z
    .array(
      z.object({
        amountPaise: paise,
        fromFundId: z.uuid(),
        reason,
        toFundId: z.uuid(),
      })
    )
    .max(20),
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
      throw new HttpError(401, "Unauthorized");
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
      throw new HttpError(401, "Unauthorized");
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

/**
 * Matches a year's books to its audited figures (finance.adjust): one
 * posting dated the year's last day. Audited with the line counts only.
 */
export const postAuditedFiguresFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(auditedFiguresInput)
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.adjust");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    const document = await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "books.audited_figures.post",
        metadata: {
          addedLineCount: data.added.length,
          differenceCount:
            data.lines.filter((l) => l.auditedPaise !== l.booksPaise).length +
            data.added.filter((l) => l.auditedPaise !== 0).length,
          lineCount: data.lines.length,
          transferCount: data.transfers.length,
        },
        target: { id: data.id, type: "audited_figures" },
      },
      () => postAuditedFiguresNow(data, session.user.id)
    );
    return { id: document.id };
  });

export const skipAuditedFiguresFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ fiscalYearId: z.uuid(), id: z.uuid(), reason }))
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.adjust");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "books.audited_figures.skip",
        target: { id: data.id, type: "audited_figures" },
      },
      () => skipAuditedFiguresNow(data, session.user.id)
    );
    return { id: data.id };
  });

export const reverseAuditedFiguresFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.uuid(), reason }))
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.adjust");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "books.audited_figures.reverse",
        target: { id: data.id, type: "audited_figures" },
      },
      () => reverseAuditedFiguresNow(data, session.user.id)
    );
    // What waited for the matched year posts now.
    queuePostingAfterReopen(session.user.id);
    return { id: data.id };
  });

export const closeFiscalYearFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ fiscalYearId: z.uuid() }))
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.close_year");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
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
      throw new HttpError(401, "Unauthorized");
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
      throw new HttpError(401, "Unauthorized");
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

/**
 * The CA handoff workbook (XLSX) for one financial year: the books and the
 * donations return's gift list. Needs `finance.view` or `finance.manage`.
 * Donor IDs are always masked to their last four characters (the Form 113
 * upload file is where full IDs go). The donor list sheet is included only
 * for holders of a donor permission or `finance.view_sensitive`; for
 * anyone else it is a one-line note. Audited as `books.ca_workbook.export`
 * with the year, the row counts and whether the donor list was included,
 * because it can carry donor data in bulk.
 */
const DONOR_LIST_PERMISSIONS = [
  "donors.view",
  "donors.manage",
  "finance.view_sensitive",
];

export const exportCaWorkbook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ fiscalYearId: z.uuid() }))
  .handler(async ({ context, data }): Promise<CaWorkbookFile> => {
    await assertServerAnyPermission(context.session, [
      "finance.view",
      "finance.manage",
    ]);
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    const { permissions } = await buildSessionContext(session);
    // Built in memory first so the ledger row can carry the counts; nothing
    // leaves the server until the audited action returns it.
    const built = await buildCaWorkbook({
      fiscalYearId: data.fiscalYearId,
      includeDonors: DONOR_LIST_PERMISSIONS.some((p) =>
        permissions.includes(p)
      ),
    });
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "books.ca_workbook.export",
        metadata: {
          ...built.counts,
          donorListIncluded: built.donorListIncluded,
          financialYear: built.financialYear,
        },
        target: { id: data.fiscalYearId, type: "fiscal_year" },
      },
      async () => built.file
    );
  });

/** Each pack reads every file of a year; a few a quarter-hour is plenty. */
const AUDIT_PACK_RATE_LIMIT = 5;
const AUDIT_PACK_RATE_WINDOW_MS = 15 * 60_000;

/**
 * Prepares a year's audit pack (finance-books.md#audit-pack) and returns a
 * single-use token for `GET /api/audit-pack`. It carries full ID numbers
 * and bank details, so it needs finance.view_sensitive on top of reading
 * the books, and is audited as `books.audit_pack.download` with the counts
 * as prepared; the stream records how it ended as `books.audit_pack.stream`.
 */
export const prepareAuditPack = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ fiscalYearId: z.uuid() }))
  .handler(async ({ context, data }): Promise<{ token: string }> => {
    await assertServerAnyPermission(context.session, [
      "finance.view",
      "finance.manage",
    ]);
    await assertServerPermission(context.session, "finance.view_sensitive");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    const limit = checkRateLimit(
      `audit-pack:${session.user.id}`,
      AUDIT_PACK_RATE_LIMIT,
      AUDIT_PACK_RATE_WINDOW_MS
    );
    if (!limit.allowed) {
      throw new Error(
        "Too many audit packs in a short time. Try again in a few minutes."
      );
    }
    const request = getRequest();
    liftIdleTimeout(request);
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "books.audit_pack.download",
        target: { id: data.fiscalYearId, type: "fiscal_year" },
      },
      async () => {
        const pack = await prepareAuditPackFor(
          data.fiscalYearId,
          request.signal
        );
        return { pack, token: issueAuditPackToken(session.user.id, pack) };
      },
      undefined,
      undefined,
      (result) => preparedAuditMetadata(result.pack)
    ).then((result) => ({ token: result.token }));
  });
