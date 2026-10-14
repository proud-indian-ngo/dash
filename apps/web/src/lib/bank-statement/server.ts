import {
  IMPORT_RUN_LOCK,
  importedRowRetention,
  uploadedRowRetention,
} from "@pi-dash/db/import-retention";
import {
  claimImportBatch,
  countImportBatchRows,
  findBatchByFileHash,
  getImportBatch,
  type ImportBatchRow,
  type ImportRowRecord,
  insertImportBatch,
  listImportRows,
  setImportRowsRetention,
  updateImportBatch,
} from "@pi-dash/db/queries/income-import";
import {
  DIRECT_DEPOSIT_CHANNELS,
  findBankAccount,
  findContributionForMatch,
  findExistingLineHashes,
  findLinkCandidates,
  findSettlementForMatch,
  getStatementLine,
  insertStatementLines,
  isTargetMatched,
  type LineMatchWrite,
  latestBankMapping,
  loadMatchInputs,
  lockStatementLine,
  matchLine,
  resetStatementLine,
  setLineSuggestion,
  setStatementRowOutcomes,
  type StatementLineRecord,
  type StatementTx,
  updateStatementLine,
  withStatementTransaction,
} from "@pi-dash/db/queries/statement-lines";
import { GENERAL_FUND_ID } from "@pi-dash/shared/constants";
import {
  CONTRIBUTION_RECEIVED_STATUSES,
  todayInKolkata,
} from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";
import { uuidv7 } from "uuidv7";

import {
  DATE_FORMAT_VALUES,
  type ImportDateFormat,
} from "@/lib/income-import/fields";
import { fileHash, rawRowHash } from "@/lib/income-import/identity";
import { maskIdentifiers } from "@/lib/income-import/normalize";
import { CsvParseError, type ParsedCsv } from "@/lib/income-import/parse-csv";
import { withSafeErrors } from "@/lib/safe-errors";

import {
  type AmountLayout,
  BANK_PARSER_VERSION,
  type BankMapping,
  checkBankMapping,
  suggestBankMapping,
} from "./fields";
import { statementLineHashes } from "./identity";
import {
  candidateWindow,
  GIVEINDIA_DISMISS_KEY,
  type LinePlan,
  planStatementMatches,
} from "./match";
import {
  type NormalizedStatementLine,
  normalizeStatementRow,
  type StatementRowResult,
} from "./normalize";
import type {
  CreateStatementBatchResponse,
  LinkCandidatesResponse,
  MatchRunResult,
  StatementLineAction,
  StatementReviewResponse,
  StatementReviewRow,
  StatementRowCategory,
  StatementRunResponse,
} from "./types";

/**
 * Server side of bank statement imports and matching. Uploads reuse the
 * contribution import's batch and row tables, retention and hashing: rows
 * stay in `private.import_row` for 30 days unimported or 180 after a run.
 * A run turns rows into statement lines, never into donations, and then
 * matches the account's open lines. Called only from
 * `functions/bank-statements.ts`, which checks finance.manage and audits.
 */

/** A run left `importing` this long ago is assumed dead and may be taken over. */
const STALE_RUN_MS = 15 * 60 * 1000;

export class StatementInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatementInputError";
  }
}

export const STATEMENT_SAVE_FAILED_MESSAGE =
  "The bank statement couldn't be saved. Nothing was changed.";

async function withStatementSafeErrors<T>(
  step: string,
  work: () => Promise<T>
): Promise<T> {
  return await withSafeErrors(
    {
      fields: { event: "bank_statement_step_failed", step },
      isUserFacing: (error) =>
        error instanceof StatementInputError || error instanceof CsvParseError,
      message: STATEMENT_SAVE_FAILED_MESSAGE,
      path: "bank-statements",
    },
    work
  );
}

async function requireBankAccount(orgAccountId: string): Promise<void> {
  const account = await findBankAccount(orgAccountId);
  if (!(account?.active && account.kind === "bank")) {
    throw new StatementInputError("Pick an active bank account");
  }
}

const isDateFormat = (value: string | null): value is ImportDateFormat =>
  (DATE_FORMAT_VALUES as readonly string[]).includes(value ?? "");

/** A column's first three values, masked: they go back to the browser. */
function columnsOf(parsed: ParsedCsv) {
  return parsed.headers.map((header) => ({
    header,
    samples: parsed.rows
      .map((row) => row[header] ?? "")
      .filter(Boolean)
      .slice(0, 3)
      .map(maskIdentifiers),
  }));
}

/** Stores an upload as a draft `bank_csv` batch. */
export async function createStatementBatch(
  input: { csv: string; fileName: string; orgAccountId: string },
  parsed: ParsedCsv,
  actorId: string
): Promise<CreateStatementBatchResponse> {
  return await withStatementSafeErrors("create", async () => {
    await requireBankAccount(input.orgAccountId);
    const batchId = uuidv7();
    const now = new Date();
    const today = todayInKolkata(now);
    const hash = fileHash(input.csv);
    const previous = await latestBankMapping(input.orgAccountId);
    const mapping = suggestBankMapping(
      parsed.headers,
      previous?.mapping ?? null
    );
    const dateFormat = isDateFormat(previous?.dateFormat ?? null)
      ? (previous?.dateFormat as ImportDateFormat)
      : null;
    await insertImportBatch(
      {
        createdAt: now,
        dateFormat,
        // Not used by statements; the column is required for contribution batches.
        defaultChannel: "neft",
        fileHash: hash,
        fileName: input.fileName,
        fundId: GENERAL_FUND_ID,
        id: batchId,
        orgAccountId: input.orgAccountId,
        parserVersion: BANK_PARSER_VERSION,
        rowCount: parsed.rows.length,
        source: "bank_csv",
        status: "draft",
        updatedAt: now,
        uploadedBy: actorId,
      },
      parsed.rows.map((raw, index) => ({
        ...uploadedRowRetention(today),
        batchId,
        createdAt: now,
        id: uuidv7(),
        parseIssue: parsed.rowIssues[index] ?? null,
        raw,
        rawHash: rawRowHash(raw),
        rowNumber: index + 1,
      }))
    );
    const earlier = await findBatchByFileHash(hash, batchId);
    return {
      batchId,
      columns: columnsOf(parsed),
      dateFormat,
      earlierUpload: earlier
        ? { batchId: earlier.id, createdAt: earlier.createdAt.getTime() }
        : null,
      mapping,
      rowCount: parsed.rows.length,
    };
  });
}

async function requireStatementBatch(batchId: string): Promise<ImportBatchRow> {
  const batch = await getImportBatch(batchId);
  if (!(batch && batch.source === "bank_csv" && batch.orgAccountId)) {
    throw new StatementInputError("Bank statement upload not found");
  }
  if (batch.status === "expired") {
    throw new StatementInputError(
      "This upload has expired and its rows were deleted. Upload the file again."
    );
  }
  return batch;
}

interface ClassifiedStatementRow {
  category: StatementRowCategory;
  hash: string | null;
  line: NormalizedStatementLine | null;
  record: ImportRowRecord;
  result: StatementRowResult | null;
}

const PREVIEW_LENGTH = 160;

/** A skipped row's filled cells, masked, for the reviewer to recognise it. */
const previewOf = (raw: Readonly<Record<string, string>> | null) =>
  raw
    ? maskIdentifiers(Object.values(raw).filter(Boolean).join(" · ")).slice(
        0,
        PREVIEW_LENGTH
      )
    : null;

/** Normalises every row and tells new lines from ones the account already has. */
async function classifyStatementRows(
  batch: ImportBatchRow,
  records: readonly ImportRowRecord[],
  settings: {
    dateFormat: ImportDateFormat;
    layout: AmountLayout;
    mapping: BankMapping;
  },
  executor?: StatementTx
): Promise<ClassifiedStatementRow[]> {
  const orgAccountId = batch.orgAccountId ?? "";
  const today = todayInKolkata();
  const results = records.map((record): StatementRowResult | null => {
    if (!record.raw) {
      return null;
    }
    if (record.parseIssue) {
      return {
        errors: [
          {
            field: "row",
            message:
              "The row could not be read as CSV; check quotes and commas",
          },
        ],
        kind: "error",
      };
    }
    return normalizeStatementRow(record.raw, settings.mapping, {
      dateFormat: settings.dateFormat,
      layout: settings.layout,
      today,
    });
  });
  const lines = results.map((r) => (r?.kind === "line" ? r.line : null));
  const hashes = statementLineHashes(orgAccountId, lines);
  const existing = await findExistingLineHashes(
    orgAccountId,
    hashes.filter((h): h is string => h !== null),
    executor
  );
  return records.map((record, index) => {
    const result = results[index] ?? null;
    const hash = hashes[index] ?? null;
    let category: StatementRowCategory = "error";
    if (result?.kind === "skip") {
      category = "skipped";
    } else if (result?.kind === "line" && hash) {
      category = existing.has(hash) ? "existing" : "new";
    }
    // A row decided by an earlier run keeps its outcome's category.
    if (record.outcome === "imported") {
      category = "existing";
    }
    return { category, hash, line: lines[index] ?? null, record, result };
  });
}

function toReviewRow(row: ClassifiedStatementRow): StatementReviewRow {
  const { line, record, result } = row;
  return {
    amountPaise: line?.amountPaise ?? null,
    balancePaise: line?.balancePaise ?? null,
    category: row.category,
    direction: line?.direction ?? null,
    errors: result?.kind === "error" ? result.errors : [],
    narration: line?.narration ?? null,
    outcome: record.outcome,
    preview: result?.kind === "skip" ? previewOf(record.raw) : null,
    reference: line?.reference || null,
    rowId: record.id,
    rowNumber: record.rowNumber,
    skipReason: result?.kind === "skip" ? result.reason : null,
    valueOn: line?.valueOn ?? null,
    warnings: result?.kind === "line" ? result.warnings : [],
  };
}

function settingsOf(batch: ImportBatchRow) {
  const mapping = (batch.mapping ?? null) as BankMapping | null;
  if (!(mapping && isDateFormat(batch.dateFormat))) {
    return null;
  }
  const { layout } = checkBankMapping(mapping);
  return layout ? { dateFormat: batch.dateFormat, layout, mapping } : null;
}

function reviewResponse(
  batch: ImportBatchRow,
  settings: {
    dateFormat: ImportDateFormat;
    layout: AmountLayout;
    mapping: BankMapping;
  },
  rows: readonly ClassifiedStatementRow[]
): StatementReviewResponse {
  const counts: Record<StatementRowCategory, number> = {
    error: 0,
    existing: 0,
    new: 0,
    skipped: 0,
  };
  for (const row of rows) {
    counts[row.category] += 1;
  }
  return {
    batch: {
      dateFormat: settings.dateFormat,
      fileName: batch.fileName,
      id: batch.id,
      mapping: settings.mapping,
      orgAccountId: batch.orgAccountId ?? "",
      rowCount: batch.rowCount,
      status: batch.status,
    },
    counts,
    layout: settings.layout,
    rows: rows.map(toReviewRow),
  };
}

/** Saves the mapping and date format, and classifies every row with them. */
export async function reviewStatementBatch(input: {
  batchId: string;
  dateFormat: ImportDateFormat;
  mapping: BankMapping;
}): Promise<StatementReviewResponse> {
  return await withStatementSafeErrors("review", async () => {
    const batch = await requireStatementBatch(input.batchId);
    if (batch.status === "importing") {
      throw new StatementInputError("This statement is importing right now");
    }
    const records = await listImportRows(batch.id);
    const headers = new Set(Object.keys(records.find((r) => r.raw)?.raw ?? {}));
    const mapping = Object.fromEntries(
      Object.entries(input.mapping).filter(([header]) => headers.has(header))
    ) as BankMapping;
    const check = checkBankMapping(mapping);
    if (check.problem || !check.layout) {
      throw new StatementInputError(check.problem ?? "Map the amounts");
    }
    const settings = {
      dateFormat: input.dateFormat,
      layout: check.layout,
      mapping,
    };
    const rows = await classifyStatementRows(batch, records, settings);
    const status = batch.status === "draft" ? "reviewed" : batch.status;
    await updateImportBatch(batch.id, {
      dateFormat: input.dateFormat,
      mapping,
      status,
    });
    return reviewResponse({ ...batch, status }, settings, rows);
  });
}

/**
 * Lines in file order oldest first: a file listed newest first is turned
 * round, so `position` always grows with time within a file.
 */
function positionsFor(
  rows: readonly ClassifiedStatementRow[]
): Map<string, number> {
  const lines = rows.filter((r) => r.line);
  const first = lines[0]?.line?.valueOn ?? "";
  const last = lines.at(-1)?.line?.valueOn ?? "";
  const newestFirst = first > last;
  const positions = new Map<string, number>();
  for (const row of rows) {
    positions.set(
      row.record.id,
      newestFirst
        ? rows.length - row.record.rowNumber + 1
        : row.record.rowNumber
    );
  }
  return positions;
}

/** Imports the batch's undecided rows as statement lines, then matches the account. */
export async function runStatementBatch(
  input: { batchId: string },
  actorId: string
): Promise<StatementRunResponse> {
  return await withStatementSafeErrors("run", async () => {
    const current = await requireStatementBatch(input.batchId);
    if (!settingsOf(current)) {
      throw new StatementInputError("Map the columns before importing");
    }
    await requireBankAccount(current.orgAccountId ?? "");
    const batch = await claimImportBatch(
      current.id,
      new Date(Date.now() - STALE_RUN_MS)
    );
    if (!batch) {
      throw new StatementInputError("This statement is already importing");
    }
    try {
      const settings = settingsOf(batch);
      if (!(settings && batch.orgAccountId)) {
        throw new StatementInputError("Map the columns before importing");
      }
      const orgAccountId = batch.orgAccountId;
      return await withStatementTransaction(async (tx) => {
        // The retention expiry takes this lock too, so it never sees the run half done.
        await tx.execute(IMPORT_RUN_LOCK);
        const now = new Date();
        const rows = await classifyStatementRows(
          batch,
          await listImportRows(batch.id, tx),
          settings,
          tx
        );
        const positions = positionsFor(rows);
        const open = rows.filter(
          (r) => r.record.raw && r.record.outcome === "pending"
        );
        const toInsert = open.filter((r) => r.category === "new");
        const inserted = await insertStatementLines(
          tx,
          toInsert.flatMap((r) =>
            r.line && r.hash
              ? [
                  {
                    ...r.line,
                    createdAt: now,
                    id: uuidv7(),
                    importBatchId: batch.id,
                    lineHash: r.hash,
                    orgAccountId,
                    position: positions.get(r.record.id) ?? r.record.rowNumber,
                    reference: r.line.reference || null,
                    updatedAt: now,
                  },
                ]
              : []
          )
        );
        const decided = { decidedAt: now, decidedBy: actorId };
        const imported = toInsert.filter((r) => r.hash && inserted.has(r.hash));
        const existing = open.filter(
          (r) =>
            r.category === "existing" ||
            (r.category === "new" && !(r.hash && inserted.has(r.hash)))
        );
        const skipped = open.filter((r) => r.category === "skipped");
        const errors = open.filter((r) => r.category === "error");
        await setStatementRowOutcomes(
          tx,
          imported.map((r) => r.record.id),
          { ...decided, outcome: "imported", outcomeReason: null }
        );
        await setStatementRowOutcomes(
          tx,
          existing.map((r) => r.record.id),
          {
            ...decided,
            outcome: "linked_existing",
            outcomeReason: "already_imported",
          }
        );
        for (const reason of ["no_date", "no_amount"] as const) {
          await setStatementRowOutcomes(
            tx,
            skipped
              .filter(
                (r) => r.result?.kind === "skip" && r.result.reason === reason
              )
              .map((r) => r.record.id),
            { ...decided, outcome: "skipped", outcomeReason: reason }
          );
        }
        await setStatementRowOutcomes(
          tx,
          errors.map((r) => r.record.id),
          { ...decided, outcome: "error", outcomeReason: "invalid_cells" }
        );
        await updateImportBatch(
          batch.id,
          {
            ...(await countImportBatchRows(tx, batch.id)),
            completedAt: now,
            status: "completed",
          },
          tx
        );
        await setImportRowsRetention(
          tx,
          batch,
          importedRowRetention(todayInKolkata(now))
        );
        const matches = await refreshMatches(tx, orgAccountId, actorId, now);
        return {
          ...matches,
          errors: errors.length,
          existing: existing.length,
          imported: imported.length,
          skipped: skipped.length,
        };
      });
    } catch (error) {
      await updateImportBatch(batch.id, { status: "failed" });
      throw error;
    }
  });
}

const planTarget = (plan: LinePlan): LineMatchWrite | null =>
  plan.kind === "none"
    ? null
    : {
        kind: plan.target.kind,
        reason: plan.target.reason,
        targetId: plan.target.targetId,
      };

/**
 * Matches the account's open credit lines: exact evidence matches, the rest
 * get a suggestion or lose a stale one. `actorId` is who ran the import or
 * "Find matches".
 */
export async function refreshMatches(
  tx: StatementTx,
  orgAccountId: string,
  actorId: string | null,
  now: Date = new Date()
): Promise<MatchRunResult> {
  const inputs = await loadMatchInputs(tx, orgAccountId, candidateWindow);
  const plans = planStatementMatches({
    contributions: inputs.contributions,
    lines: inputs.lines.map((line) => ({
      amountPaise: line.amountPaise,
      direction: line.direction,
      dismissed: line.dismissedSuggestions ?? [],
      id: line.id,
      narration: line.narration,
      reference: line.reference,
      valueOn: line.valueOn,
    })),
    settlements: inputs.settlements,
  });
  const result: MatchRunResult = { matched: 0, suggested: 0 };
  for (const line of inputs.lines) {
    const plan = plans.get(line.id) ?? { kind: "none" };
    const target = planTarget(plan);
    if (plan.kind === "match" && target) {
      if (await matchLine(tx, line.id, target, actorId, now)) {
        result.matched += 1;
      }
      continue;
    }
    if (plan.kind === "suggest") {
      result.suggested += 1;
    }
    const unchanged =
      (line.suggestedKind ?? null) === (target?.kind ?? null) &&
      (line.suggestedSettlementId ?? null) ===
        (target?.kind === "settlement" ? target.targetId : null) &&
      (line.suggestedContributionId ?? null) ===
        (target?.kind === "contribution" ? target.targetId : null) &&
      (line.suggestionReason ?? null) === (target?.reason ?? null);
    if (!unchanged) {
      await setLineSuggestion(tx, line.id, target, now);
    }
  }
  return result;
}

/** "Find matches" for one bank account. */
export async function findStatementMatches(
  orgAccountId: string,
  actorId: string
): Promise<MatchRunResult> {
  return await withStatementSafeErrors(
    "match",
    async () =>
      await withStatementTransaction(
        async (tx) => await refreshMatches(tx, orgAccountId, actorId)
      )
  );
}

/** Checks that a credit line can be tied to this settlement or contribution. */
async function assertTarget(
  tx: StatementTx,
  line: StatementLineRecord,
  kind: "contribution" | "settlement",
  targetId: string
): Promise<void> {
  if (line.direction !== "credit") {
    throw new StatementInputError(
      "Only money in can match a settlement or a contribution"
    );
  }
  const amountsDiffer = (amountPaise: number) =>
    new StatementInputError(
      `The amounts differ (${formatPaise(amountPaise)} against ${formatPaise(line.amountPaise)} in the bank). Matching part of a line comes with the ledger.`
    );
  if (kind === "settlement") {
    const settlement = await findSettlementForMatch(tx, targetId);
    if (!settlement || settlement.status !== "processed") {
      throw new StatementInputError("Settlement not found or not paid out");
    }
    if (settlement.amountPaise !== line.amountPaise) {
      throw amountsDiffer(settlement.amountPaise);
    }
  } else {
    const contribution = await findContributionForMatch(tx, targetId);
    if (
      !contribution ||
      contribution.orgAccountId !== line.orgAccountId ||
      !(DIRECT_DEPOSIT_CHANNELS as readonly string[]).includes(
        contribution.channel
      ) ||
      !CONTRIBUTION_RECEIVED_STATUSES.includes(
        contribution.status as (typeof CONTRIBUTION_RECEIVED_STATUSES)[number]
      )
    ) {
      throw new StatementInputError(
        "Pick a received contribution deposited into this account"
      );
    }
    if (contribution.amountPaise !== line.amountPaise) {
      throw amountsDiffer(contribution.amountPaise);
    }
  }
  if (await isTargetMatched(tx, kind, targetId)) {
    throw new StatementInputError("Another bank line is already matched to it");
  }
}

const requireUnmatched = (line: StatementLineRecord) => {
  if (line.matchStatus !== "unmatched") {
    throw new StatementInputError(
      "This line is already matched or ignored; unmatch it first"
    );
  }
};

const trimNote = (note: string | null) => {
  const value = note?.trim();
  return value ? value : null;
};

/** What a line's current match or suggestion points at, to remember a "no". */
function dismissKey(
  kind: string | null,
  settlementId: string | null,
  contributionId: string | null
): string | null {
  if (kind === "settlement") {
    return settlementId;
  }
  if (kind === "contribution") {
    return contributionId;
  }
  return kind === "giveindia_payout" ? GIVEINDIA_DISMISS_KEY : null;
}

const withDismissed = (line: StatementLineRecord, key: string | null) =>
  key && !(line.dismissedSuggestions ?? []).includes(key)
    ? [...(line.dismissedSuggestions ?? []), key]
    : (line.dismissedSuggestions ?? []);

async function applyAction(
  tx: StatementTx,
  line: StatementLineRecord,
  input: StatementLineAction,
  actorId: string,
  now: Date
): Promise<void> {
  const matched = { matchedAt: now, matchedBy: actorId, updatedAt: now };
  switch (input.action) {
    case "accept": {
      requireUnmatched(line);
      const kind = line.suggestedKind;
      if (!kind || kind === "transfer" || kind === "other") {
        throw new StatementInputError("This line has no suggestion to accept");
      }
      const targetId =
        kind === "settlement"
          ? line.suggestedSettlementId
          : kind === "contribution"
            ? line.suggestedContributionId
            : null;
      if (kind !== "giveindia_payout") {
        if (!targetId) {
          throw new StatementInputError("The suggested record is gone");
        }
        await assertTarget(tx, line, kind, targetId);
      }
      await matchLine(
        tx,
        line.id,
        { kind, reason: line.suggestionReason ?? "manual", targetId },
        actorId,
        now
      );
      return;
    }
    case "dismiss": {
      requireUnmatched(line);
      await updateStatementLine(tx, line.id, {
        dismissedSuggestions: withDismissed(
          line,
          dismissKey(
            line.suggestedKind,
            line.suggestedSettlementId,
            line.suggestedContributionId
          )
        ),
        suggestedContributionId: null,
        suggestedKind: null,
        suggestedSettlementId: null,
        suggestionReason: null,
        updatedAt: now,
      });
      return;
    }
    case "link": {
      requireUnmatched(line);
      await assertTarget(tx, line, input.kind, input.targetId);
      await matchLine(
        tx,
        line.id,
        { kind: input.kind, reason: "manual", targetId: input.targetId },
        actorId,
        now
      );
      return;
    }
    case "giveindia": {
      requireUnmatched(line);
      if (line.direction !== "credit") {
        throw new StatementInputError("A give.do payout is money in");
      }
      await matchLine(
        tx,
        line.id,
        { kind: "giveindia_payout", reason: "manual", targetId: null },
        actorId,
        now
      );
      return;
    }
    case "transfer": {
      requireUnmatched(line);
      await updateStatementLine(tx, line.id, {
        ...matched,
        ignoredReason: null,
        matchKind: "transfer",
        matchReason: "manual",
        matchStatus: "matched",
        note: trimNote(input.note) ?? line.note,
        suggestedContributionId: null,
        suggestedKind: null,
        suggestedSettlementId: null,
        suggestionReason: null,
      });
      return;
    }
    case "ignore": {
      requireUnmatched(line);
      const note = trimNote(input.note);
      if (input.reason === "other" && !note) {
        throw new StatementInputError("Say why in a note");
      }
      await updateStatementLine(tx, line.id, {
        ...matched,
        ignoredReason: input.reason,
        matchStatus: "ignored",
        note: note ?? line.note,
        suggestedContributionId: null,
        suggestedKind: null,
        suggestedSettlementId: null,
        suggestionReason: null,
      });
      return;
    }
    case "unmatch": {
      if (line.matchStatus === "unmatched") {
        throw new StatementInputError("This line is not matched or ignored");
      }
      // Not matched to the same record again by the next "Find matches".
      const dismissed = withDismissed(
        line,
        dismissKey(
          line.matchKind,
          line.matchedSettlementId,
          line.matchedContributionId
        )
      );
      await resetStatementLine(tx, line.id, now);
      await updateStatementLine(tx, line.id, {
        dismissedSuggestions: dismissed,
      });
      return;
    }
    case "note": {
      await updateStatementLine(tx, line.id, {
        note: trimNote(input.note),
        updatedAt: now,
      });
      return;
    }
    default:
      throw new StatementInputError("Unknown action");
  }
}

/** A reviewer's match, ignore, transfer, note or unmatch on one line. */
export async function actOnStatementLine(
  input: StatementLineAction,
  actorId: string
): Promise<{ lineId: string }> {
  return await withStatementSafeErrors(
    `action_${input.action}`,
    async () =>
      await withStatementTransaction(async (tx) => {
        const line = await lockStatementLine(tx, input.lineId);
        if (!line) {
          throw new StatementInputError("Bank statement line not found");
        }
        await applyAction(tx, line, input, actorId, new Date());
        return { lineId: line.id };
      })
  );
}

/** Records a credit line could be linked to by hand. */
export async function statementLinkCandidates(
  lineId: string
): Promise<LinkCandidatesResponse> {
  return await withStatementSafeErrors("candidates", async () => {
    const line = await getStatementLine(lineId);
    if (!line) {
      throw new StatementInputError("Bank statement line not found");
    }
    if (line.direction !== "credit") {
      return { contributions: [], settlements: [] };
    }
    return await findLinkCandidates(line.orgAccountId, line.valueOn);
  });
}
