import { razorpaySettlementSummary } from "@pi-dash/db/queries/razorpay-settlements";
import { statementSummary } from "@pi-dash/db/queries/statement-lines";
import { statementLineIgnoreReasonValues } from "@pi-dash/shared/constants";
import { currentFinancialYear } from "@pi-dash/shared/income";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import {
  assertServerAnyPermission,
  assertServerPermission,
} from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import {
  BANK_FIELD_KEYS,
  BANK_IGNORE_FIELD,
  findStatementHeaderRow,
} from "@/lib/bank-statement/fields";
import {
  actOnStatementLine,
  createStatementBatch,
  describeStatementAction,
  findStatementMatches,
  previewStatementMatches,
  previewStatementRun,
  reviewStatementBatch,
  runStatementBatch,
  statementLinkCandidates,
} from "@/lib/bank-statement/server";
import type {
  BankStatementSummaryResponse,
  CreateStatementBatchResponse,
  LinkCandidatesResponse,
  MatchRunResult,
  StatementReviewResponse,
  StatementRunResponse,
} from "@/lib/bank-statement/types";
import {
  DATE_FORMAT_VALUES,
  MAX_IMPORT_FILE_BYTES,
} from "@/lib/income-import/fields";
import { parseCsv } from "@/lib/income-import/parse-csv";
import { razorpaySetup } from "@/lib/razorpay/config";
import { withSafeErrors } from "@/lib/safe-errors";
import { authMiddleware } from "@/middleware/auth";

/**
 * Bank statements: upload, map and import a statement, find matches, and a
 * reviewer's actions on its lines. Writes need finance.manage and are
 * audited with IDs, kinds and counts only: never file names, narrations,
 * references or amounts. Reads need finance.view or finance.manage.
 */

const FINANCE_READ = ["finance.view", "finance.manage"] as const;

const mappingSchema = z.record(
  z.string().max(200),
  z.enum([...BANK_FIELD_KEYS, BANK_IGNORE_FIELD])
);

const noteSchema = z.string().trim().max(200).nullable();

export const createBankStatementImport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      csv: z.string().min(1).max(MAX_IMPORT_FILE_BYTES),
      fileName: z.string().trim().min(1).max(200),
      orgAccountId: z.uuid(),
    })
  )
  .handler(async ({ context, data }): Promise<CreateStatementBatchResponse> => {
    await assertServerPermission(context.session, "finance.manage");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    const parsed = parseCsv(data.csv, {
      findHeaderRow: findStatementHeaderRow,
    });
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "import_batch.create",
        metadata: { rowCount: parsed.rows.length, source: "bank_csv" },
        target: { type: "import_batch" },
      },
      async () => await createStatementBatch(data, parsed, session.user.id),
      undefined,
      (result) => ({ id: result.batchId, type: "import_batch" })
    );
  });

export const reviewBankStatementImport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      batchId: z.uuid(),
      dateFormat: z.enum(DATE_FORMAT_VALUES),
      mapping: mappingSchema,
    })
  )
  .handler(async ({ context, data }): Promise<StatementReviewResponse> => {
    await assertServerPermission(context.session, "finance.manage");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "import_batch.review",
        metadata: {
          mappedColumnCount: Object.keys(data.mapping).length,
          source: "bank_csv",
        },
        target: { id: data.batchId, type: "import_batch" },
      },
      async () => await reviewStatementBatch(data)
    );
  });

export const runBankStatementImport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ batchId: z.uuid() }))
  .handler(async ({ context, data }): Promise<StatementRunResponse> => {
    await assertServerPermission(context.session, "finance.manage");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    // Counts the run is about to write, planned from the stored rows.
    const planned = await previewStatementRun(data.batchId);
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "import_batch.run",
        metadata: {
          errorCount: planned.error,
          existingCount: planned.existing,
          newLineCount: planned.new,
          skippedCount: planned.skipped,
          source: "bank_csv",
        },
        target: { id: data.batchId, type: "import_batch" },
      },
      async () => await runStatementBatch(data, session.user.id)
    );
  });

export const findBankStatementMatches = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ orgAccountId: z.uuid() }))
  .handler(async ({ context, data }): Promise<MatchRunResult> => {
    await assertServerPermission(context.session, "finance.manage");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    const planned = await previewStatementMatches(data.orgAccountId);
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "statement_line.find_matches",
        metadata: {
          matchCount: planned.matched,
          suggestionCount: planned.suggested,
        },
        target: { id: data.orgAccountId, type: "org_account" },
      },
      async () => await findStatementMatches(data.orgAccountId, session.user.id)
    );
  });

const lineId = z.uuid();
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), lineId }),
  z.object({ action: z.literal("dismiss"), lineId }),
  z.object({
    action: z.literal("link"),
    kind: z.enum(["contribution", "settlement"]),
    lineId,
    targetId: z.uuid(),
  }),
  z.object({ action: z.literal("giveindia"), lineId }),
  z.object({ action: z.literal("transfer"), lineId, note: noteSchema }),
  z.object({
    action: z.literal("ignore"),
    lineId,
    note: noteSchema,
    reason: z.enum(statementLineIgnoreReasonValues),
  }),
  z.object({ action: z.literal("unmatch"), lineId }),
  z.object({ action: z.literal("note"), lineId, note: noteSchema }),
]);

type ActionInput = z.infer<typeof actionSchema>;

const relatedIdKey = (kind: string) =>
  kind === "settlement" ? "settlementId" : "contributionId";

/**
 * Audit metadata for an action: kinds, reasons and record IDs, never the
 * note or line content. Accept and unmatch name what they tie or untie,
 * read from the line before the action.
 */
async function actionMetadata(
  input: ActionInput
): Promise<Record<string, string | Record<string, string>>> {
  if (input.action === "link") {
    return {
      kind: input.kind,
      relatedIds: { [relatedIdKey(input.kind)]: input.targetId },
    };
  }
  if (input.action === "ignore") {
    return { reason: input.reason };
  }
  const { kind, targetId } = await describeStatementAction(input);
  return {
    ...(kind ? { kind } : {}),
    ...(kind && targetId
      ? { relatedIds: { [relatedIdKey(kind)]: targetId } }
      : {}),
  };
}

/**
 * Accept or turn down a suggestion, link by hand, mark as a give.do payout
 * or a transfer, ignore, add a note, or unmatch: one line, finance.manage,
 * audited as `statement_line.<action>`.
 */
export const updateStatementLine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(actionSchema)
  .handler(async ({ context, data }): Promise<{ lineId: string }> => {
    await assertServerPermission(context.session, "finance.manage");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: `statement_line.${data.action}`,
        metadata: await actionMetadata(data),
        target: { id: data.lineId, type: "statement_line" },
      },
      async () => await actOnStatementLine(data, session.user.id)
    );
  });

/** Records a credit line could be linked to. A read, so not audited. */
export const getStatementLinkCandidates = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ lineId: z.uuid() }))
  .handler(async ({ context, data }): Promise<LinkCandidatesResponse> => {
    await assertServerPermission(context.session, "finance.manage");
    return await statementLinkCandidates(data.lineId);
  });

/**
 * The Bank statements page's figures for one account, with the Razorpay
 * and give.do clearing balances. A read, so not audited.
 */
export const getBankStatementSummary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ orgAccountId: z.uuid() }))
  .handler(async ({ context, data }): Promise<BankStatementSummaryResponse> => {
    await assertServerAnyPermission(context.session, FINANCE_READ);
    return await withSafeErrors(
      {
        fields: { event: "bank_statement_summary_failed" },
        isUserFacing: () => false,
        message: "Bank statement figures couldn't be loaded.",
        path: "bank-statements",
      },
      async () => {
        const summary = await statementSummary(data.orgAccountId);
        const setup = razorpaySetup();
        const razorpay = setup.enabled
          ? await razorpaySettlementSummary(setup.mode, currentFinancialYear())
          : null;
        return {
          ...summary,
          razorpayClearingPaise: razorpay?.awaitingPaise ?? null,
        };
      }
    );
  });
