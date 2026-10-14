import { hasEncryptionKey } from "@pi-dash/db/encryption";
import {
  importedRowRetention,
  uploadedRowRetention,
} from "@pi-dash/db/import-retention";
import { linkGiveDoSettlementPaymentsIn } from "@pi-dash/db/queries/give-do-payouts";
import {
  claimImportBatch,
  countImportBatchRows,
  ensureGiveIndiaParty,
  findBatchByFileHash,
  findContributorsByContact,
  findContributorsByIdentifier,
  findDuplicateCandidates,
  findExternalIdentities,
  findPartyDetailGaps,
  getImportBatch,
  type ImportBatchRow,
  type ImportRowRecord,
  type ImportTx,
  insertImportBatch,
  insertImportedContribution,
  latestImportMapping,
  listImportRows,
  recordImportCollectionEvent,
  resolveImportSettings,
  setImportRowOutcome,
  setImportRowsRetention,
  startDecidedRowsRetention,
  type StoredIdentity,
  updateImportBatch,
  withImportTransaction,
} from "@pi-dash/db/queries/income-import";
import {
  fillMissingPartyDetails,
  fillValuesPresent,
  savePartyInTransaction,
} from "@pi-dash/db/queries/party-private";
import {
  findClearingAccount,
  markImportRowWaiting,
} from "@pi-dash/db/queries/razorpay-import";
import { applyPendingRefunds } from "@pi-dash/db/queries/razorpay-refunds";
import { linkSettlementLinesForPayment } from "@pi-dash/db/queries/razorpay-settlements";
import {
  type ContributionChannel,
  type ImportBatchSource,
  type PartyFillField,
  partyFillFieldValues,
  type PartyIdType,
} from "@pi-dash/shared/constants";
import { defaultReportingMode, todayInKolkata } from "@pi-dash/shared/income";
import { uuidv7 } from "uuidv7";

import { saveDonorSchema } from "@/lib/donor-schema";
import { queueRefundChecks } from "@/lib/razorpay/after-review";
import { razorpayRowRules } from "@/lib/razorpay/rules";
import { withSafeErrors } from "@/lib/safe-errors";

import {
  type ClassifiedRow,
  type ClassifyRowInput,
  classifyRows,
  donorChoiceValue,
  type ExistingIdentity,
  planRows,
  type ReviewCategory,
  type RowDecision,
  type RowPlan,
} from "./classify";
import {
  checkMapping,
  IMPORT_PARSER_VERSION,
  type ImportDateFormat,
  type ImportMapping,
  mappingProblem,
  sourceRules,
  suggestMapping,
} from "./fields";
import {
  fileHash,
  identityKey,
  payloadHash,
  type RowIdentity,
  rawRowHash,
  rowIdentity,
} from "./identity";
import {
  type CellIssue,
  donorSaveInput,
  maskIdentifier,
  maskIdentifiers,
  type NormalizedRow,
  type NormalizeResult,
  normalizeRow,
} from "./normalize";
import {
  CSV_ROW_ISSUE_MESSAGES,
  CsvParseError,
  type CsvRowIssue,
  type ParsedCsv,
} from "./parse-csv";
import type {
  BatchDetailResponse,
  CreateBatchResponse,
  ReviewResponse,
  ReviewRowView,
  RunResponse,
} from "./review-types";

/**
 * Server side of the CSV import: parsing and storing an upload, classifying
 * its rows against existing identities and donors, and importing them in one
 * transaction. Called only from the server functions in
 * `functions/income-import.ts`, which check permissions and audit.
 */

/** A run left `importing` this long ago is assumed dead and may be taken over. */
const STALE_RUN_MS = 15 * 60 * 1000;

export const COLLECTION_PURPOSE = "donation receipt and statutory filing";
export const GENERIC_CSV_COLLECTION_NOTE =
  "collected directly by the organisation; notice version not recorded";
export const GIVE_DO_COLLECTION_NOTE =
  "donor gave details to give.do (GiveIndia) and saw GiveIndia's notice, not ours";
export const RAZORPAY_COLLECTION_NOTE =
  "donor submitted details on our Razorpay Payment Page";

/** How each source's donors came to give their details (DPDP collection record). */
const COLLECTION_BY_SOURCE: Record<
  ImportBatchSource,
  { channel: string; note: string }
> = {
  // Never used: statement lines create no donors.
  bank_csv: { channel: "bank_csv", note: GENERIC_CSV_COLLECTION_NOTE },
  generic_csv: { channel: "generic_csv", note: GENERIC_CSV_COLLECTION_NOTE },
  give_do_csv: { channel: "give_do_csv", note: GIVE_DO_COLLECTION_NOTE },
  give_do_payout: { channel: "give_do_csv", note: GIVE_DO_COLLECTION_NOTE },
  razorpay_api: {
    channel: "razorpay_payment_page",
    note: RAZORPAY_COLLECTION_NOTE,
  },
};

export class ImportInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportInputError";
  }
}

export const IMPORT_SAVE_FAILED_MESSAGE =
  "The import couldn't be saved. Nothing was changed.";
export const IMPORT_LOAD_FAILED_MESSAGE = "The import couldn't be loaded.";

/**
 * Runs one step of an import and lets only messages written for the user
 * through; anything else, typically a query error quoting row cells, is
 * logged by code and constraint only and replaced by a generic error.
 */
async function withImportSafeErrors<T>(
  step: "create" | "review" | "run" | "detail",
  batchId: string,
  work: () => Promise<T>
): Promise<T> {
  return await withSafeErrors(
    {
      fields: { batchId, event: "import_step_failed", step },
      isUserFacing: (error) =>
        error instanceof ImportInputError || error instanceof CsvParseError,
      message:
        step === "detail"
          ? IMPORT_LOAD_FAILED_MESSAGE
          : IMPORT_SAVE_FAILED_MESSAGE,
      path: "income-import",
    },
    work
  );
}

export interface CreateBatchInput {
  csv: string;
  defaultChannel: ContributionChannel;
  fileName: string;
  fundId: string;
  orgAccountId: string;
  programmeId: string | null;
  projectId: string | null;
  source: ImportBatchSource;
}

/** Stores an upload as a draft batch; `parsed` is `parseCsv(input.csv)`, parsed by the caller for its audit count. */
export async function createImportBatch(
  input: CreateBatchInput,
  parsed: ParsedCsv,
  actorId: string
): Promise<CreateBatchResponse> {
  const batchId = uuidv7();
  return await withImportSafeErrors(
    "create",
    batchId,
    async () => await storeImportBatch(batchId, input, parsed, actorId)
  );
}

async function storeImportBatch(
  batchId: string,
  input: CreateBatchInput,
  parsed: ParsedCsv,
  actorId: string
): Promise<CreateBatchResponse> {
  const settings = await resolveImportSettings(input);
  const rules = sourceRules(input.source);
  const now = new Date();
  const today = todayInKolkata(now);
  const hash = fileHash(input.csv);
  const mapping = suggestMapping(
    parsed.headers,
    await latestImportMapping(input.source),
    input.source
  );
  await insertImportBatch(
    {
      createdAt: now,
      dateFormat: rules.fixedDateFormat,
      defaultChannel: rules.fixedChannel ?? input.defaultChannel,
      fileHash: hash,
      fileName: input.fileName,
      fundId: input.fundId,
      id: batchId,
      orgAccountId: input.orgAccountId,
      parserVersion: IMPORT_PARSER_VERSION,
      programmeId: settings.programmeId,
      projectId: input.projectId,
      rowCount: parsed.rows.length,
      source: input.source,
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
    earlierUpload: earlier
      ? { batchId: earlier.id, createdAt: earlier.createdAt.getTime() }
      : null,
    headers: parsed.headers,
    mapping,
    rowCount: parsed.rows.length,
  };
}

interface ClassifySettings {
  dateFormat: ImportDateFormat;
  defaultChannel: ContributionChannel;
  /** ID type for ID numbers without an ID type cell; give.do's column holds PANs. */
  idType: PartyIdType | null;
  mapping: ImportMapping;
}

/**
 * How a batch's stored rows become contributions. CSV batches read their
 * cells through the saved mapping; Razorpay batches read a flattened payment
 * and identify it by payment ID.
 */
export interface RowRules {
  identity: (row: NormalizedRow) => RowIdentity;
  normalize: (raw: Readonly<Record<string, string>>) => NormalizeResult;
  payloadHash: (
    row: NormalizedRow,
    raw: Readonly<Record<string, string>>
  ) => string;
  /** No provider ID, so re-uploads are matched by a fingerprint. */
  weakIdentity: boolean;
  linkExistingById?: boolean;
}

function csvRowRules(
  batch: ImportBatchRow,
  settings: ClassifySettings,
  today: string
): RowRules {
  const { orgAccountId } = batch;
  return {
    identity: (row) => {
      if (!orgAccountId) {
        throw new Error("A CSV batch always has an account");
      }
      return rowIdentity(row, batch.source, orgAccountId);
    },
    normalize: (raw) =>
      normalizeRow(raw, settings.mapping, {
        dateFormat: settings.dateFormat,
        defaultChannel: settings.defaultChannel,
        idType: settings.idType,
        today,
      }),
    payloadHash: (row) => payloadHash(row),
    weakIdentity: checkMapping(settings.mapping).weakIdentity,
    linkExistingById: batch.source === "give_do_payout",
  };
}

async function rowRulesFor(
  batch: ImportBatchRow,
  settings: ClassifySettings
): Promise<RowRules> {
  return batch.source === "razorpay_api"
    ? await razorpayRowRules(batch)
    : csvRowRules(batch, settings, todayInKolkata());
}

interface PreparedRow {
  identity: RowIdentity | null;
  normalized: NormalizeResult | null;
  payloadHash: string | null;
  record: ImportRowRecord;
}

interface Classification {
  classified: ClassifiedRow[];
  /** For donors proposed by email or phone: the details each has no value for. */
  gaps: Map<string, Record<PartyFillField, boolean>>;
  prepared: Map<string, PreparedRow>;
  storedIdentities: Map<string, StoredIdentity>;
}

/**
 * The date format and channel the reviewer chose, unless the source fixes
 * them, as give.do does.
 */
function withSourceRules(
  source: ImportBatchSource,
  chosen: Omit<ClassifySettings, "idType">
): ClassifySettings {
  const rules = sourceRules(source);
  return {
    dateFormat: rules.fixedDateFormat ?? chosen.dateFormat,
    defaultChannel: rules.fixedChannel ?? chosen.defaultChannel,
    idType: rules.idType,
    mapping: chosen.mapping,
  };
}

function settingsOf(batch: ImportBatchRow): ClassifySettings | null {
  // Razorpay rows are payments, not mapped cells.
  if (batch.source === "razorpay_api") {
    return {
      dateFormat: "ymd",
      defaultChannel: "razorpay",
      idType: null,
      mapping: {},
    };
  }
  if (!(batch.mapping && batch.dateFormat)) {
    return null;
  }
  return withSourceRules(batch.source, {
    dateFormat: batch.dateFormat as ImportDateFormat,
    defaultChannel: batch.defaultChannel as ContributionChannel,
    mapping: batch.mapping as ImportMapping,
  });
}

/** The row's normalised values, with a parse problem of the CSV row as an error. */
function normalizeRecord(
  record: ImportRowRecord,
  rules: RowRules
): NormalizeResult | null {
  if (!record.raw) {
    return null;
  }
  const normalized = rules.normalize(record.raw);
  const issue = record.parseIssue as CsvRowIssue | null;
  if (issue && CSV_ROW_ISSUE_MESSAGES[issue]) {
    normalized.errors.unshift({
      field: "row",
      message: CSV_ROW_ISSUE_MESSAGES[issue],
    });
  }
  return normalized;
}

/**
 * Normalises every row and looks up what already exists, then classifies.
 * During a run `executor` is the run's transaction, so the lookups see the
 * state the run's lock protects.
 */
async function classifyBatch(
  records: readonly ImportRowRecord[],
  rules: RowRules,
  executor?: ImportTx
): Promise<Classification> {
  const prepared = new Map<string, PreparedRow>();
  for (const record of records) {
    const normalized = normalizeRecord(record, rules);
    const usable =
      record.raw !== null &&
      normalized !== null &&
      normalized.errors.length === 0;
    prepared.set(record.id, {
      identity: usable ? rules.identity(normalized.row) : null,
      normalized,
      payloadHash:
        usable && record.raw
          ? rules.payloadHash(normalized.row, record.raw)
          : null,
      record,
    });
  }
  const usable = [...prepared.values()].filter(
    (p): p is PreparedRow & { normalized: NormalizeResult } =>
      p.identity !== null && p.normalized !== null
  );
  const firstIdentity = usable[0]?.identity;
  const stored = firstIdentity
    ? await findExternalIdentities(
        {
          entityType: firstIdentity.entityType,
          provider: firstIdentity.provider,
          providerAccount: firstIdentity.providerAccount,
        },
        usable.map((p) => p.identity?.externalId ?? ""),
        executor
      )
    : [];
  const storedIdentities = new Map<string, StoredIdentity>();
  const identities = new Map<string, ExistingIdentity>();
  if (firstIdentity) {
    for (const s of stored) {
      const key = identityKey({ ...firstIdentity, externalId: s.externalId });
      storedIdentities.set(key, s);
      identities.set(key, {
        contributionId: s.contributionId,
        payloadHash: s.payloadHash,
      });
    }
  }

  const rows = usable.map((p) => p.normalized.row);
  const idMatches = await findContributorsByIdentifier(
    rows.map((r) => ({ idNumber: r.idNumber, idType: r.idType })),
    executor
  );
  const contact = await findContributorsByContact(
    rows.map((r) => r.email),
    rows.map((r) => r.phone),
    executor
  );
  const partyIds = [
    ...[...idMatches.values()].flat(),
    ...[...contact.byEmail.values()].flat(),
    ...[...contact.byPhone.values()].flat(),
  ].map((p) => p.partyId);
  const dates = rows
    .map((r) => r.receivedOn)
    .filter((d): d is string => d !== null)
    .sort();
  const existingContributions =
    dates.length > 0
      ? await findDuplicateCandidates(
          {
            from: dates[0] ?? "",
            partyIds,
            references: rows.map((r) => r.reference).filter(Boolean),
            to: dates.at(-1) ?? "",
          },
          executor
        )
      : [];

  const inputs: ClassifyRowInput[] = [...prepared.values()].map((p) => ({
    id: p.record.id,
    identityKey: p.identity ? identityKey(p.identity) : null,
    normalized: p.normalized,
    outcome: p.record.outcome,
    payloadHash:
      rules.linkExistingById && p.identity
        ? (storedIdentities.get(identityKey(p.identity))?.payloadHash ??
          p.payloadHash)
        : p.payloadHash,
    rowNumber: p.record.rowNumber,
  }));
  const classified = classifyRows(inputs, {
    emailMatches: contact.byEmail,
    existingContributions,
    identities,
    idMatches,
    phoneMatches: contact.byPhone,
  });
  const proposed = classified.flatMap((row) =>
    row.donorOptions.flatMap((o) =>
      o.kind === "existing" && o.reason !== "id_number" ? [o.partyId] : []
    )
  );
  const gaps = await findPartyDetailGaps(proposed, executor);
  return { classified, gaps, prepared, storedIdentities };
}

const maskIssue = (issue: CellIssue): CellIssue => ({
  ...issue,
  message: maskIdentifiers(issue.message),
});

/** A cell value for the browser: never a whole PAN or Aadhaar-shaped number, wherever it sits. */
const shown = (value: string | undefined) =>
  value ? maskIdentifiers(value) : null;

/**
 * Which of a proposed donor's empty details this row would fill: field
 * names only, never the values.
 */
function fillsFor(
  partyId: string,
  row: NormalizeResult["row"] | null,
  gaps: Classification["gaps"]
): PartyFillField[] {
  const missing = gaps.get(partyId);
  if (!(row && missing)) {
    return [];
  }
  const present = fillValuesPresent(row, { canStoreIds: hasEncryptionKey() });
  return partyFillFieldValues.filter(
    (field) => missing[field] && present[field]
  );
}

/**
 * One row for the review and batch pages. Names, emails and references are
 * shown to donor viewers as in the Donors directory; identifiers only ever
 * as their last four characters, and any PAN- or Aadhaar-shaped text in
 * another cell or message is masked the same way.
 */
function toRowView(
  row: ClassifiedRow,
  prepared: PreparedRow | undefined,
  firstNewKeyRow: Map<string, { rowId: string; rowNumber: number }>,
  repeatOf: ReviewRowView["repeatOf"],
  gaps: Classification["gaps"]
): ReviewRowView {
  const normalized = prepared?.normalized?.row ?? null;
  let donor: ReviewRowView["donor"] = { kind: "undecided" };
  if (row.donor.kind === "existing") {
    donor = row.donor;
  } else if (row.donor.kind === "new") {
    const first = firstNewKeyRow.get(row.donor.key) ?? null;
    if (!first) {
      firstNewKeyRow.set(row.donor.key, {
        rowId: row.rowId,
        rowNumber: row.rowNumber,
      });
    }
    donor = { createdOnRow: first, kind: "new" };
  }
  return {
    amountPaise: normalized?.amountPaise ?? null,
    category: row.category,
    donor,
    donorName: shown(normalized?.donorName),
    donorOptions: row.donorOptions.map((option) => ({
      fills:
        option.kind === "existing" && option.reason !== "id_number"
          ? fillsFor(option.partyId, normalized, gaps)
          : [],
      label:
        option.kind === "existing"
          ? option.name
          : `New donor from row ${option.rowNumber}`,
      reason: option.reason,
      value: donorChoiceValue(option),
    })),
    duplicate: row.duplicate
      ? {
          amountPaise: row.duplicate.amountPaise,
          reason: row.duplicate.reason,
          receivedOn: row.duplicate.receivedOn,
        }
      : null,
    email: shown(normalized?.email),
    errors: row.errors.map(maskIssue),
    maskedId: normalized ? maskIdentifier(normalized.idNumber) : null,
    outcome: prepared?.record.outcome ?? "pending",
    outcomeReason: prepared?.record.outcomeReason ?? null,
    rawAvailable: Boolean(prepared?.record.raw),
    receivedOn: normalized?.receivedOn ?? null,
    reference: shown(normalized?.reference),
    repeatOf,
    rowId: row.rowId,
    rowNumber: row.rowNumber,
    sameDonorAs: row.sameDonorAs,
    warnings: row.warnings.map(maskIssue),
  };
}

function toReviewResponse(
  batch: ImportBatchRow,
  settings: ClassifySettings,
  classification: Classification,
  weakIdentity: boolean
): ReviewResponse {
  const firstNewKeyRow = new Map<
    string,
    { rowId: string; rowNumber: number }
  >();
  // After a run, a row that repeated an earlier row of the file is linked to
  // the contribution that row imported.
  const importedBy = new Map<string, number>();
  for (const { record } of classification.prepared.values()) {
    if (record.outcome === "imported" && record.contributionId) {
      importedBy.set(record.contributionId, record.rowNumber);
    }
  }
  const repeatOf = (row: ClassifiedRow): ReviewRowView["repeatOf"] => {
    if (row.repeatOf) {
      return { rowNumber: row.repeatOf.rowNumber };
    }
    const record = classification.prepared.get(row.rowId)?.record;
    const earlier =
      record?.outcome === "linked_existing" && record.contributionId
        ? importedBy.get(record.contributionId)
        : undefined;
    return earlier === undefined ? null : { rowNumber: earlier };
  };
  return {
    batch: {
      dateFormat: settings.dateFormat,
      defaultChannel: settings.defaultChannel,
      fileName: batch.fileName,
      id: batch.id,
      mapping: settings.mapping,
      rowCount: batch.rowCount,
      source: batch.source,
      status: batch.status,
    },
    rows: classification.classified.map((row) =>
      toRowView(
        row,
        classification.prepared.get(row.rowId),
        firstNewKeyRow,
        repeatOf(row),
        classification.gaps
      )
    ),
    weakIdentity,
  };
}

async function requireBatch(batchId: string): Promise<ImportBatchRow> {
  const batch = await getImportBatch(batchId);
  if (
    !batch ||
    batch.source === "bank_csv" ||
    batch.source === "give_do_payout"
  ) {
    throw new ImportInputError("Import not found");
  }
  if (batch.status === "expired") {
    throw new ImportInputError(
      "This upload has expired and its rows were deleted. Upload the file again."
    );
  }
  return batch;
}

export interface ReviewInput {
  batchId: string;
  dateFormat: ImportDateFormat;
  defaultChannel: ContributionChannel;
  mapping: ImportMapping;
}

/** Saves the mapping and classifies every row with it. */
export async function reviewImportBatch(
  input: ReviewInput
): Promise<ReviewResponse> {
  return await withImportSafeErrors(
    "review",
    input.batchId,
    async () => await saveReview(input)
  );
}

async function saveReview(input: ReviewInput): Promise<ReviewResponse> {
  const batch = await requireBatch(input.batchId);
  if (batch.status === "importing") {
    throw new ImportInputError("This batch is importing right now");
  }
  if (batch.source === "razorpay_api") {
    throw new ImportInputError("Razorpay payments have no columns to map");
  }
  const records = await listImportRows(batch.id);
  const headers = new Set(Object.keys(records.find((r) => r.raw)?.raw ?? {}));
  const mapping = Object.fromEntries(
    Object.entries(input.mapping).filter(([header]) => headers.has(header))
  ) as ImportMapping;
  const problem = mappingProblem(checkMapping(mapping));
  if (problem) {
    throw new ImportInputError(problem);
  }
  const settings = withSourceRules(batch.source, {
    dateFormat: input.dateFormat,
    defaultChannel: input.defaultChannel,
    mapping,
  });
  const rules = await rowRulesFor(batch, settings);
  const classification = await classifyBatch(records, rules);
  const status = batch.status === "draft" ? "reviewed" : batch.status;
  await updateImportBatch(batch.id, {
    dateFormat: settings.dateFormat,
    defaultChannel: settings.defaultChannel,
    mapping,
    status,
  });
  return toReviewResponse(
    { ...batch, status },
    settings,
    classification,
    rules.weakIdentity
  );
}

/** An identifier cell for display: its last four characters at most. */
const maskIdSample = (value: string) =>
  maskIdentifier(value.replaceAll(/\s/g, "").toUpperCase()) ?? "••••";

/**
 * Column headers with up to three sample values, for continuing the mapping.
 * Values of a column mapped (or that would be auto-mapped) to the ID number
 * are masked, and so is any PAN- or Aadhaar-shaped value in another column.
 */
function columnSamples(
  batch: ImportBatchRow,
  withRaw: readonly ImportRowRecord[]
): BatchDetailResponse["columns"] {
  const headers = Object.keys(withRaw[0]?.raw ?? {});
  const saved = (batch.mapping ?? {}) as ImportMapping;
  const suggested = suggestMapping(headers, null, batch.source);
  return headers.map((header) => {
    const isId =
      saved[header] === "idNumber" || suggested[header] === "idNumber";
    return {
      header,
      samples: withRaw
        .map((r) => r.raw?.[header] ?? "")
        .filter(Boolean)
        .slice(0, 3)
        .map((value) => (isId ? maskIdSample(value) : maskIdentifiers(value))),
    };
  });
}

/**
 * The batch page: a read-only classification with the saved mapping, and
 * for donor managers the columns to continue or retry the import with.
 * Columns carry sample cells, so they are sent only while there is
 * something left to import, and never to donor viewers.
 */
export async function getImportBatchDetail(
  batchId: string,
  access: { canManage: boolean }
): Promise<BatchDetailResponse> {
  return await withImportSafeErrors(
    "detail",
    batchId,
    async () => await loadBatchDetail(batchId, access)
  );
}

async function loadBatchDetail(
  batchId: string,
  access: { canManage: boolean }
): Promise<BatchDetailResponse> {
  const batch = await getImportBatch(batchId);
  if (!batch) {
    throw new ImportInputError("Import not found");
  }
  if (batch.source === "bank_csv") {
    throw new ImportInputError(
      "This is a bank statement; open it from Bank statements"
    );
  }
  if (batch.source === "give_do_payout") {
    throw new ImportInputError(
      "This is a give.do payout; open it from Settlements"
    );
  }
  const records = await listImportRows(batch.id);
  const withRaw = records.filter((r) => r.raw);
  const resumable =
    batch.status !== "expired" &&
    batch.status !== "importing" &&
    withRaw.some(
      (r) => r.outcome !== "imported" && r.outcome !== "linked_existing"
    );
  // Razorpay rows are payments with nothing to map, so their cells are
  // never sent as samples.
  const columns =
    access.canManage && resumable && batch.source !== "razorpay_api"
      ? columnSamples(batch, withRaw)
      : [];
  const settings = settingsOf(batch);
  if (!settings || batch.status === "expired") {
    return { columns, review: null };
  }
  const rules = await rowRulesFor(batch, settings);
  const classification = await classifyBatch(records, rules);
  return {
    columns,
    review: toReviewResponse(
      batch,
      settings,
      classification,
      rules.weakIdentity
    ),
  };
}

const OUTCOME_FOR_PLAN = {
  conflict: { outcome: "conflict", reason: "changed_since_imported" },
  error: { outcome: "error", reason: "invalid_cells" },
} as const;

interface RunContext {
  /** Null when the system imports (a Razorpay payment on arrival). */
  actorId: string | null;
  batch: ImportBatchRow;
  canStoreIds: boolean;
  /** Razorpay payment IDs this run imported or linked, to check their refunds after it. */
  imported?: string[];
  /** The platform that passed the money on: GiveIndia for give.do batches. */
  intermediaryPartyId: string | null;
  now: Date;
  orgAccountId: string;
  programmeId: string | null;
  tx: ImportTx;
}

/**
 * Creates the donor for a new-donor key through the audited party save path.
 * normalizeRow already ran the same rules, so a failure here is unexpected.
 */
async function createDonor(
  ctx: RunContext,
  normalized: NormalizeResult["row"]
): Promise<string | null> {
  const parsed = saveDonorSchema.safeParse(
    donorSaveInput(normalized, { id: uuidv7(), withId: ctx.canStoreIds })
  );
  if (!parsed.success) {
    return null;
  }
  const result = await savePartyInTransaction(ctx.tx, parsed.data, ctx.actorId);
  return result.partyId;
}

/**
 * Imports the batch's unresolved rows with the reviewer's decisions. The
 * whole run is one transaction: either every decided row is written or none
 * is, and a retry processes whatever is still unresolved.
 */
export async function runImportBatch(
  input: { batchId: string; decisions: Record<string, RowDecision> },
  actorId: string
): Promise<RunResponse> {
  return await withImportSafeErrors(
    "run",
    input.batchId,
    async () => await runClaimedBatch(input, actorId)
  );
}

/**
 * How many rows the decisions would fill an existing donor's empty details
 * on, planned from the stored rows exactly as the run plans them, so the
 * run's audit count reflects the server's plan rather than the request.
 * Counts only. A batch that cannot run counts none; the run reports why.
 */
export async function countChosenFills(input: {
  batchId: string;
  decisions: Record<string, RowDecision>;
}): Promise<number> {
  // Only an accepted existing donor can fill, so most runs skip the pass.
  const choosesExisting = Object.values(input.decisions).some((d) =>
    d.donor?.startsWith("party:")
  );
  if (!choosesExisting) {
    return 0;
  }
  return await withImportSafeErrors("run", input.batchId, async () => {
    const batch = await getImportBatch(input.batchId);
    const settings =
      batch && batch.status !== "expired" ? settingsOf(batch) : null;
    if (!(batch && settings)) {
      return 0;
    }
    const classification = await classifyBatch(
      await listImportRows(batch.id),
      await rowRulesFor(batch, settings)
    );
    let fills = 0;
    for (const plan of planRows(
      classification.classified,
      input.decisions
    ).values()) {
      if (plan.action === "import" && plan.fill) {
        fills += 1;
      }
    }
    return fills;
  });
}

async function runClaimedBatch(
  input: { batchId: string; decisions: Record<string, RowDecision> },
  actorId: string
): Promise<RunResponse> {
  const current = await requireBatch(input.batchId);
  if (!settingsOf(current)) {
    throw new ImportInputError("Review the rows before importing");
  }
  if (!current.orgAccountId) {
    throw new ImportInputError(
      "Choose the Razorpay clearing account in Settings first"
    );
  }
  const claimed = await claimImportBatch(
    current.id,
    new Date(Date.now() - STALE_RUN_MS)
  );
  if (!claimed) {
    throw new ImportInputError("This batch is already importing");
  }
  // From here on the claimed row is the truth: a review that saved a new
  // mapping between the read above and the claim is what gets imported.
  const batch = claimed;
  const settings = settingsOf(batch);
  try {
    if (!settings) {
      throw new ImportInputError("Review the rows before importing");
    }
    // An account is only ever attached, never removed, so the check above holds.
    const orgAccountId = batch.orgAccountId ?? current.orgAccountId;
    const { programmeId } = await resolveImportSettings({
      ...batch,
      orgAccountId,
    });
    const imported: string[] = [];
    const response = await withImportTransaction(async (tx) => {
      const now = new Date();
      const ctx: RunContext = {
        actorId,
        batch,
        canStoreIds: hasEncryptionKey(),
        imported,
        intermediaryPartyId:
          batch.source === "give_do_csv"
            ? await ensureGiveIndiaParty(tx, actorId, now)
            : null,
        now,
        orgAccountId,
        programmeId,
        tx,
      };
      const records = await listImportRows(batch.id, tx);
      const classification = await classifyBatch(
        records,
        await rowRulesFor(batch, settings),
        tx
      );
      const plans = planRows(classification.classified, input.decisions);
      const result = await executePlans(ctx, classification, plans);
      await updateImportBatch(
        batch.id,
        {
          ...(await countImportBatchRows(tx, batch.id)),
          completedAt: now,
          newDonorCount: batch.newDonorCount + result.newDonors,
          status: "completed",
        },
        tx
      );
      await setImportRowsRetention(
        tx,
        batch,
        importedRowRetention(todayInKolkata(now))
      );
      return result;
    });
    if (batch.source === "razorpay_api") {
      // Refunds that came while these payments waited for review.
      queueRefundChecks(batch.fileHash, imported);
    }
    return response;
  } catch (error) {
    // A Razorpay batch stays `completed`: its payments keep arriving.
    await updateImportBatch(batch.id, {
      status: batch.source === "razorpay_api" ? "completed" : "failed",
    });
    throw error;
  }
}

/**
 * Once a Razorpay payment's row is imported or linked: apply the refunds
 * held for that payment and link the settlement lines that waited for it,
 * in this same transaction, and remember its ID so its refunds can be
 * checked against the API after the run.
 */
async function afterContribution(
  ctx: RunContext,
  identity: { externalId: string; provider: string; providerAccount: string }
): Promise<void> {
  if (identity.provider === "give_do") {
    await linkGiveDoSettlementPaymentsIn(
      ctx.tx,
      identity.providerAccount,
      identity.externalId
    );
    return;
  }
  if (ctx.batch.source !== "razorpay_api" || identity.provider !== "razorpay") {
    return;
  }
  await applyPendingRefunds(
    ctx.tx,
    identity.providerAccount,
    identity.externalId,
    (at) => todayInKolkata(at),
    ctx.now
  );
  // Settlement lines that were waiting for this payment.
  await linkSettlementLinesForPayment(
    ctx.tx,
    identity.providerAccount,
    identity.externalId
  );
  ctx.imported?.push(identity.externalId);
}

async function executePlans(
  ctx: RunContext,
  classification: Classification,
  plans: Map<string, RowPlan>
): Promise<RunResponse> {
  const result: RunResponse = {
    conflicts: 0,
    errors: 0,
    filledDonors: 0,
    imported: 0,
    linked: 0,
    newDonors: 0,
    repeated: 0,
    skipped: 0,
  };
  const filledParties = new Set<string>();
  const partyByKey = new Map<string, string>();
  const createdByRow = new Map<
    string,
    { contributionId: string; identityId: string }
  >();
  const decided = { decidedAt: ctx.now, decidedBy: ctx.actorId };

  for (const row of classification.classified) {
    const plan = plans.get(row.rowId);
    const prepared = classification.prepared.get(row.rowId);
    // Rows whose cells the retention job removed keep the outcome they had.
    if (!(plan && prepared?.record.raw) || plan.action === "done") {
      continue;
    }
    if (plan.action === "error" || plan.action === "conflict") {
      const { outcome, reason } = OUTCOME_FOR_PLAN[plan.action];
      await setImportRowOutcome(ctx.tx, row.rowId, {
        ...decided,
        outcome,
        outcomeReason: reason,
      });
      result[plan.action === "error" ? "errors" : "conflicts"] += 1;
      continue;
    }
    if (
      plan.action === "skip" &&
      plan.reason === "undecided" &&
      ctx.batch.source === "razorpay_api"
    ) {
      // A payment left undecided keeps waiting, with its values, for review.
      await markImportRowWaiting(ctx.tx, row.rowId, "needs_review");
      continue;
    }
    if (plan.action === "skip") {
      await setImportRowOutcome(ctx.tx, row.rowId, {
        ...decided,
        outcome: "skipped",
        outcomeReason: plan.reason,
      });
      result.skipped += 1;
      continue;
    }
    if (plan.action === "link") {
      const target =
        "contributionId" in plan.to
          ? {
              contributionId: plan.to.contributionId,
              identityId:
                (row.identityKey &&
                  classification.storedIdentities.get(row.identityKey)?.id) ||
                null,
            }
          : (createdByRow.get(plan.to.rowId) ?? null);
      if (!target) {
        await setImportRowOutcome(ctx.tx, row.rowId, {
          ...decided,
          outcome: "skipped",
          outcomeReason: "duplicate_of_skipped_row",
        });
        result.skipped += 1;
        continue;
      }
      await setImportRowOutcome(ctx.tx, row.rowId, {
        ...decided,
        contributionId: target.contributionId,
        externalIdentityId: target.identityId,
        outcome: "linked_existing",
        outcomeReason: null,
      });
      result["contributionId" in plan.to ? "linked" : "repeated"] += 1;
      if (prepared.identity) {
        await afterContribution(ctx, prepared.identity);
      }
      continue;
    }

    const normalized = prepared.normalized?.row;
    const identity = prepared.identity;
    if (!(normalized && identity && prepared.payloadHash)) {
      continue;
    }
    let partyId: string | null = null;
    if (plan.donor.kind === "existing") {
      partyId = plan.donor.partyId;
      if (plan.fill) {
        const filled = await fillMissingPartyDetails(
          ctx.tx,
          partyId,
          normalized,
          ctx.actorId,
          { canStoreIds: ctx.canStoreIds }
        );
        if (filled.length > 0 && !filledParties.has(partyId)) {
          filledParties.add(partyId);
          result.filledDonors += 1;
        }
      }
    } else {
      partyId = partyByKey.get(plan.donor.key) ?? null;
      if (!partyId) {
        partyId = await createDonor(ctx, normalized);
        if (partyId) {
          partyByKey.set(plan.donor.key, partyId);
          result.newDonors += 1;
        }
      }
    }
    if (!partyId) {
      await setImportRowOutcome(ctx.tx, row.rowId, {
        ...decided,
        outcome: "error",
        outcomeReason: "donor_details_invalid",
      });
      result.errors += 1;
      continue;
    }
    const collection = COLLECTION_BY_SOURCE[ctx.batch.source];
    await recordImportCollectionEvent(ctx.tx, {
      channel: collection.channel,
      createdBy: ctx.actorId,
      evidenceNote: collection.note,
      id: uuidv7(),
      importBatchId: ctx.batch.id,
      noticeVersion: null,
      occurredAt: ctx.now,
      partyId,
      processingBasis: "voluntary_provision_7a",
      purpose: COLLECTION_PURPOSE,
    });
    const contributionId = uuidv7();
    const identityId = uuidv7();
    await insertImportedContribution(
      ctx.tx,
      {
        amountPaise: normalized.amountPaise ?? 0,
        channel: normalized.channel,
        createdAt: ctx.now,
        createdBy: ctx.actorId,
        donationType: normalized.donationType,
        fundId: ctx.batch.fundId,
        gatewayFeePaise: normalized.gatewayFeePaise ?? 0,
        gatewayTaxPaise: normalized.gatewayTaxPaise ?? 0,
        id: contributionId,
        importBatchId: ctx.batch.id,
        intermediaryPartyId: ctx.intermediaryPartyId,
        notes: normalized.notes || null,
        orgAccountId: ctx.orgAccountId,
        partyId,
        programmeId: ctx.programmeId,
        projectId: ctx.batch.projectId,
        receivedOn: normalized.receivedOn ?? "",
        reference: normalized.reference || null,
        reportingMode: defaultReportingMode(normalized.channel),
        source: "import",
        status: "received",
        updatedAt: ctx.now,
      },
      {
        contributionId,
        createdAt: ctx.now,
        entityType: identity.entityType,
        externalId: identity.externalId,
        id: identityId,
        payloadHash: prepared.payloadHash,
        provider: identity.provider,
        providerAccount: identity.providerAccount,
      }
    );
    createdByRow.set(row.rowId, { contributionId, identityId });
    await afterContribution(ctx, identity);
    await setImportRowOutcome(ctx.tx, row.rowId, {
      ...decided,
      contributionId,
      externalIdentityId: identityId,
      outcome: "imported",
      outcomeReason: null,
      partyId,
    });
    result.imported += 1;
  }
  return result;
}

/** What happened to one staged row of an API batch. */
export type StagedRowResult =
  | ReviewCategory
  | "clearing_account_inactive"
  | "no_clearing_account"
  | "already_decided";

/**
 * Imports staged rows of an API batch as the system, inside the caller's
 * import transaction. Rows that need no decision (a known donor by PAN, or
 * a new donor) import at once; rows that need a reviewer stay pending with
 * reason `needs_review`, conflicts and errors are recorded, and without a
 * clearing account, or when the batch's account has since been deactivated,
 * every row waits. Rows that reached an outcome start their retention, and
 * the batch's counters are refreshed.
 */
export async function importStagedRows(
  tx: ImportTx,
  batch: ImportBatchRow,
  rowIds: ReadonlySet<string>,
  now: Date = new Date()
): Promise<Map<string, StagedRowResult>> {
  const results = new Map<string, StagedRowResult>();
  const settings = settingsOf(batch);
  const records = await listImportRows(batch.id, tx);
  const waiting = records.filter(
    (r) => rowIds.has(r.id) && r.outcome === "pending" && r.raw
  );
  for (const id of rowIds) {
    results.set(id, "already_decided");
  }
  let newDonors = 0;
  const account = batch.orgAccountId
    ? await findClearingAccount(batch.orgAccountId, tx)
    : null;
  if (!(batch.orgAccountId && settings && account)) {
    const reason = batch.orgAccountId
      ? "clearing_account_inactive"
      : "no_clearing_account";
    for (const record of waiting) {
      await markImportRowWaiting(tx, record.id, reason);
      results.set(record.id, reason);
    }
  } else if (waiting.length > 0) {
    const classification = await classifyBatch(
      records,
      await rowRulesFor(batch, settings),
      tx
    );
    const plans = planRows(classification.classified, {});
    const auto = new Map<string, RowPlan>();
    for (const row of classification.classified) {
      const plan = plans.get(row.rowId);
      if (!(plan && waiting.some((r) => r.id === row.rowId))) {
        continue;
      }
      results.set(row.rowId, row.category);
      if (row.category === "needs_review") {
        await markImportRowWaiting(tx, row.rowId, "needs_review");
      } else if (row.category !== "done") {
        auto.set(row.rowId, plan);
      }
    }
    const result = await executePlans(
      {
        actorId: null,
        batch,
        canStoreIds: hasEncryptionKey(),
        intermediaryPartyId: null,
        now,
        orgAccountId: batch.orgAccountId,
        programmeId: batch.programmeId,
        tx,
      },
      classification,
      auto
    );
    newDonors = result.newDonors;
  }
  await startDecidedRowsRetention(
    tx,
    batch.id,
    importedRowRetention(todayInKolkata(now))
  );
  const counts = await countImportBatchRows(tx, batch.id);
  await updateImportBatch(
    batch.id,
    {
      ...counts,
      ...(counts.importedCount + counts.linkedCount >
      batch.importedCount + batch.linkedCount
        ? { completedAt: now }
        : {}),
      newDonorCount: batch.newDonorCount + newDonors,
    },
    tx
  );
  return results;
}

/** Reuses donor classification for the separately authorized payout importer. */
export async function reviewPayoutContributions(
  batch: ImportBatchRow
): Promise<ReviewResponse> {
  const settings = settingsOf(batch);
  if (batch.source !== "give_do_payout" || !settings) {
    throw new ImportInputError("Payout import not found");
  }
  const rules = await rowRulesFor(batch, settings);
  return toReviewResponse(
    batch,
    settings,
    await classifyBatch(await listImportRows(batch.id), rules),
    false
  );
}

/** Imports the chosen gifts inside the payout's transaction and shared import lock. */
export async function importPayoutContributionsIn(
  tx: ImportTx,
  batch: ImportBatchRow,
  actorId: string,
  decisions: Record<string, RowDecision>,
  importUnknown: boolean,
  now: Date
): Promise<RunResponse> {
  const settings = settingsOf(batch);
  if (!(batch.source === "give_do_payout" && settings && batch.orgAccountId)) {
    throw new ImportInputError("Payout import not found");
  }
  const classification = await classifyBatch(
    await listImportRows(batch.id, tx),
    await rowRulesFor(batch, settings),
    tx
  );
  const plans = planRows(classification.classified, decisions);
  for (const [id, plan] of plans) {
    if (!importUnknown && plan.action !== "link" && plan.action !== "done") {
      plans.set(id, { action: "skip", reason: "skipped_by_user" });
    } else if (
      importUnknown &&
      (plan.action === "error" ||
        plan.action === "conflict" ||
        (plan.action === "skip" && plan.reason === "undecided"))
    ) {
      throw new ImportInputError(
        "Resolve the donation rows before importing this payout, or leave unknown donations unlinked."
      );
    }
  }
  return executePlans(
    {
      actorId,
      batch,
      canStoreIds: hasEncryptionKey(),
      intermediaryPartyId: await ensureGiveIndiaParty(tx, actorId, now),
      now,
      orgAccountId: batch.orgAccountId,
      programmeId: batch.programmeId,
      tx,
    },
    classification,
    plans
  );
}
