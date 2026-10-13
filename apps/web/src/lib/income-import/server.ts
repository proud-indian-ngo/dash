import { hasEncryptionKey } from "@pi-dash/db/encryption";
import {
  importedRowRetention,
  uploadedRowRetention,
} from "@pi-dash/db/import-retention";
import {
  claimImportBatch,
  countImportOutcomes,
  findBatchByFileHash,
  findContributorsByContact,
  findContributorsByIdentifier,
  findDuplicateCandidates,
  findExternalIdentities,
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
  type StoredIdentity,
  updateImportBatch,
  withImportTransaction,
} from "@pi-dash/db/queries/income-import";
import { savePartyInTransaction } from "@pi-dash/db/queries/party-private";
import type {
  ContributionChannel,
  ImportBatchSource,
} from "@pi-dash/shared/constants";
import { defaultReportingMode, todayInKolkata } from "@pi-dash/shared/income";
import { uuidv7 } from "uuidv7";

import { saveDonorSchema } from "@/lib/donor-schema";

import {
  type ClassifiedRow,
  type ClassifyRowInput,
  classifyRows,
  donorChoiceValue,
  type ExistingIdentity,
  planRows,
  type RowDecision,
  type RowPlan,
} from "./classify";
import {
  checkMapping,
  IMPORT_PARSER_VERSION,
  type ImportDateFormat,
  type ImportMapping,
  isMappingUsable,
  suggestMapping,
} from "./fields";
import {
  fileHash,
  identityKey,
  payloadHash,
  rawRowHash,
  rowIdentity,
} from "./identity";
import {
  maskIdentifier,
  type NormalizeResult,
  normalizeRow,
} from "./normalize";
import type { ParsedCsv } from "./parse-csv";
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

export class ImportInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportInputError";
  }
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
  const settings = await resolveImportSettings(input);
  const now = new Date();
  const today = todayInKolkata(now);
  const batchId = uuidv7();
  const hash = fileHash(input.csv);
  const mapping = suggestMapping(
    parsed.headers,
    await latestImportMapping(input.source)
  );
  await insertImportBatch(
    {
      createdAt: now,
      defaultChannel: input.defaultChannel,
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
  mapping: ImportMapping;
}

interface PreparedRow {
  identity: ReturnType<typeof rowIdentity> | null;
  normalized: NormalizeResult | null;
  payloadHash: string | null;
  record: ImportRowRecord;
}

interface Classification {
  classified: ClassifiedRow[];
  prepared: Map<string, PreparedRow>;
  storedIdentities: Map<string, StoredIdentity>;
}

function settingsOf(batch: ImportBatchRow): ClassifySettings | null {
  if (!(batch.mapping && batch.dateFormat)) {
    return null;
  }
  return {
    dateFormat: batch.dateFormat as ImportDateFormat,
    defaultChannel: batch.defaultChannel as ContributionChannel,
    mapping: batch.mapping as ImportMapping,
  };
}

/** Normalises every row and looks up what already exists, then classifies. */
async function classifyBatch(
  batch: ImportBatchRow,
  records: readonly ImportRowRecord[],
  settings: ClassifySettings
): Promise<Classification> {
  const today = todayInKolkata();
  const prepared = new Map<string, PreparedRow>();
  for (const record of records) {
    const normalized = record.raw
      ? normalizeRow(record.raw, settings.mapping, {
          dateFormat: settings.dateFormat,
          defaultChannel: settings.defaultChannel,
          today,
        })
      : null;
    const usable = normalized !== null && normalized.errors.length === 0;
    prepared.set(record.id, {
      identity: usable
        ? rowIdentity(normalized.row, batch.source, batch.orgAccountId)
        : null,
      normalized,
      payloadHash: usable ? payloadHash(normalized.row) : null,
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
        usable.map((p) => p.identity?.externalId ?? "")
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
    rows.map((r) => ({ idNumber: r.idNumber, idType: r.idType }))
  );
  const contact = await findContributorsByContact(
    rows.map((r) => r.email),
    rows.map((r) => r.phone)
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
      ? await findDuplicateCandidates({
          from: dates[0] ?? "",
          partyIds,
          references: rows.map((r) => r.reference).filter(Boolean),
          to: dates.at(-1) ?? "",
        })
      : [];

  const inputs: ClassifyRowInput[] = [...prepared.values()].map((p) => ({
    id: p.record.id,
    identityKey: p.identity ? identityKey(p.identity) : null,
    normalized: p.normalized,
    outcome: p.record.outcome,
    payloadHash: p.payloadHash,
    rowNumber: p.record.rowNumber,
  }));
  const classified = classifyRows(inputs, {
    emailMatches: contact.byEmail,
    existingContributions,
    identities,
    idMatches,
    phoneMatches: contact.byPhone,
  });
  return { classified, prepared, storedIdentities };
}

function toRowView(
  row: ClassifiedRow,
  prepared: PreparedRow | undefined,
  firstNewKeyRow: Map<string, string>
): ReviewRowView {
  const normalized = prepared?.normalized?.row ?? null;
  let donor: ReviewRowView["donor"] = { kind: "undecided" };
  if (row.donor.kind === "existing") {
    donor = row.donor;
  } else if (row.donor.kind === "new") {
    const first = firstNewKeyRow.get(row.donor.key);
    if (!first) {
      firstNewKeyRow.set(row.donor.key, row.rowId);
    }
    donor = { kind: "new", sharedWithEarlierRow: Boolean(first) };
  }
  return {
    amountPaise: normalized?.amountPaise ?? null,
    category: row.category,
    donor,
    donorName: normalized?.donorName || null,
    donorOptions: row.donorOptions.map((option) => ({
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
    email: normalized?.email || null,
    errors: row.errors,
    maskedId: normalized ? maskIdentifier(normalized.idNumber) : null,
    outcome: prepared?.record.outcome ?? "pending",
    outcomeReason: prepared?.record.outcomeReason ?? null,
    rawAvailable: Boolean(prepared?.record.raw),
    receivedOn: normalized?.receivedOn ?? null,
    reference: normalized?.reference || null,
    rowId: row.rowId,
    rowNumber: row.rowNumber,
    warnings: row.warnings,
  };
}

function toReviewResponse(
  batch: ImportBatchRow,
  settings: ClassifySettings,
  classification: Classification
): ReviewResponse {
  const firstNewKeyRow = new Map<string, string>();
  return {
    batch: {
      dateFormat: settings.dateFormat,
      defaultChannel: settings.defaultChannel,
      fileName: batch.fileName,
      id: batch.id,
      mapping: settings.mapping,
      rowCount: batch.rowCount,
      status: batch.status,
    },
    rows: classification.classified.map((row) =>
      toRowView(row, classification.prepared.get(row.rowId), firstNewKeyRow)
    ),
    weakIdentity: checkMapping(settings.mapping).weakIdentity,
  };
}

async function requireBatch(batchId: string): Promise<ImportBatchRow> {
  const batch = await getImportBatch(batchId);
  if (!batch) {
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
  const batch = await requireBatch(input.batchId);
  if (batch.status === "importing") {
    throw new ImportInputError("This batch is importing right now");
  }
  const records = await listImportRows(batch.id);
  const headers = new Set(Object.keys(records.find((r) => r.raw)?.raw ?? {}));
  const mapping = Object.fromEntries(
    Object.entries(input.mapping).filter(([header]) => headers.has(header))
  ) as ImportMapping;
  if (!isMappingUsable(checkMapping(mapping))) {
    throw new ImportInputError(
      "Map donor name, amount and received on, each to one column"
    );
  }
  const settings: ClassifySettings = {
    dateFormat: input.dateFormat,
    defaultChannel: input.defaultChannel,
    mapping,
  };
  const classification = await classifyBatch(batch, records, settings);
  const status = batch.status === "draft" ? "reviewed" : batch.status;
  await updateImportBatch(batch.id, {
    dateFormat: input.dateFormat,
    defaultChannel: input.defaultChannel,
    mapping,
    status,
  });
  return toReviewResponse({ ...batch, status }, settings, classification);
}

/** The batch page: a read-only classification with the saved mapping, or the columns if none is saved yet. */
export async function getImportBatchDetail(
  batchId: string
): Promise<BatchDetailResponse> {
  const batch = await getImportBatch(batchId);
  if (!batch) {
    throw new ImportInputError("Import not found");
  }
  const records = await listImportRows(batch.id);
  const withRaw = records.filter((r) => r.raw);
  const headers = Object.keys(withRaw[0]?.raw ?? {});
  const columns = headers.map((header) => ({
    header,
    samples: withRaw
      .map((r) => r.raw?.[header] ?? "")
      .filter(Boolean)
      .slice(0, 3),
  }));
  const settings = settingsOf(batch);
  if (!settings || batch.status === "expired") {
    return { columns, review: null };
  }
  const classification = await classifyBatch(batch, records, settings);
  return {
    columns,
    review: toReviewResponse(batch, settings, classification),
  };
}

const OUTCOME_FOR_PLAN = {
  conflict: { outcome: "conflict", reason: "changed_since_imported" },
  error: { outcome: "error", reason: "invalid_cells" },
} as const;

interface RunContext {
  actorId: string;
  batch: ImportBatchRow;
  canStoreIds: boolean;
  now: Date;
  programmeId: string | null;
  tx: ImportTx;
}

/** Creates the donor for a new-donor key through the audited party save path. */
async function createDonor(
  ctx: RunContext,
  normalized: NormalizeResult["row"]
): Promise<string | null> {
  const withId = ctx.canStoreIds && normalized.idType !== "none";
  const parsed = saveDonorSchema.safeParse({
    addressLine1: normalized.addressLine1,
    addressLine2: normalized.addressLine2,
    assessmentNote: "",
    city: normalized.city,
    country: normalized.country,
    displayName: normalized.donorName,
    email: normalized.email,
    expectedPartyUpdatedAt: null,
    expectedUpdatedAt: null,
    foreignSourceAssessment:
      normalized.country === "IN" ? "domestic" : "pending",
    id: uuidv7(),
    idNumber: withId ? normalized.idNumber : "",
    idType: withId ? normalized.idType : "none",
    kind: "person",
    legalName: "",
    mode: "create",
    nationality: "",
    phone: normalized.phone,
    pincode: normalized.pincode,
    roles: ["donor"],
    state: normalized.state,
  });
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
  const batch = await requireBatch(input.batchId);
  const settings = settingsOf(batch);
  if (!settings) {
    throw new ImportInputError("Review the rows before importing");
  }
  const { programmeId } = await resolveImportSettings(batch);
  const claimed = await claimImportBatch(
    batch.id,
    new Date(Date.now() - STALE_RUN_MS)
  );
  if (!claimed) {
    throw new ImportInputError("This batch is already importing");
  }
  try {
    return await withImportTransaction(async (tx) => {
      const now = new Date();
      const ctx: RunContext = {
        actorId,
        batch,
        canStoreIds: hasEncryptionKey(),
        now,
        programmeId,
        tx,
      };
      const records = await listImportRows(batch.id, tx);
      const classification = await classifyBatch(batch, records, settings);
      const plans = planRows(classification.classified, input.decisions);
      const result = await executePlans(ctx, classification, plans);
      const counts = await countImportOutcomes(tx, batch.id);
      await updateImportBatch(
        batch.id,
        {
          completedAt: now,
          conflictCount: counts.conflict,
          errorCount: counts.error,
          importedCount: counts.imported,
          linkedCount: counts.linked_existing,
          newDonorCount: batch.newDonorCount + result.newDonors,
          skippedCount: counts.skipped + counts.pending,
          status: "completed",
        },
        tx
      );
      await setImportRowsRetention(
        tx,
        batch.id,
        importedRowRetention(todayInKolkata(now))
      );
      return result;
    });
  } catch (error) {
    await updateImportBatch(batch.id, { status: "failed" });
    throw error;
  }
}

async function executePlans(
  ctx: RunContext,
  classification: Classification,
  plans: Map<string, RowPlan>
): Promise<RunResponse> {
  const result: RunResponse = {
    conflicts: 0,
    errors: 0,
    imported: 0,
    linked: 0,
    newDonors: 0,
    skipped: 0,
  };
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
      result.linked += 1;
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
    await recordImportCollectionEvent(ctx.tx, {
      channel: ctx.batch.source,
      createdBy: ctx.actorId,
      evidenceNote: GENERIC_CSV_COLLECTION_NOTE,
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
        id: contributionId,
        importBatchId: ctx.batch.id,
        notes: normalized.notes || null,
        orgAccountId: ctx.batch.orgAccountId,
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
