import type {
  ExternalIdentityEntityType,
  ExternalIdentityProvider,
  ImportBatchSource,
  ImportRowOutcome,
  PartyFillField,
  PartyIdType,
} from "@pi-dash/shared/constants";
import {
  GIVE_INDIA_PARTY_ID,
  GIVE_INDIA_PARTY_NAME,
  PROGRAMME_IDS,
} from "@pi-dash/shared/constants";
import { RAZORPAY_CLEARING_ACCOUNT_CONFIG_KEY } from "@pi-dash/shared/contribution-channel";
import {
  CONTRIBUTOR_ROLES,
  GIVER_ROLES,
  PLATFORM_INTERMEDIARY_PARTY_IDS,
} from "@pi-dash/shared/income";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { decryptSecret, hasEncryptionKey } from "../encryption";
import { IMPORT_RUN_LOCK } from "../import-retention";
import { appConfig } from "../schema/app-config";
import {
  fund,
  orgAccount,
  programme,
  project,
} from "../schema/finance-dimensions";
import { importBatch } from "../schema/import-batch";
import { contribution } from "../schema/income";
import { party, partyRole } from "../schema/party";
import {
  collectionEvent,
  externalIdentity,
  importRow,
} from "../schema/private/imports";
import {
  emailKey,
  partyPrivate,
  phoneDigitsKey,
} from "../schema/private/party-private";
import { partyDetailGaps, partyIdNumberContext } from "./party-private";

/**
 * Database access for CSV imports of contributions. Raw rows and donor
 * identifiers stay in this module and the server functions that call it;
 * callers get party IDs and display names, never stored contact details.
 */

export type ImportTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type ImportBatchRow = typeof importBatch.$inferSelect;
export type ImportRowRecord = typeof importRow.$inferSelect;
/** The pooled connection, or the run's transaction so reads see its writes and lock. */
type Reader = Pick<typeof db, "select">;

const INSERT_CHUNK = 500;

export async function insertImportBatch(
  batch: typeof importBatch.$inferInsert,
  rows: (typeof importRow.$inferInsert)[]
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(importBatch).values(batch);
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await tx.insert(importRow).values(rows.slice(i, i + INSERT_CHUNK));
    }
  });
}

/**
 * What the channel rules read for a batch: its account's ID and kind (null
 * when it has none or it is gone) and the Razorpay clearing account chosen
 * in Settings. Pass the import transaction to read them inside it.
 */
export async function findChannelRuleContext(
  orgAccountId: string | null,
  reader: Pick<typeof db, "select"> = db
): Promise<{
  account: { id: string; kind: string } | null;
  razorpayClearingAccountId: string | null;
}> {
  const [account] = orgAccountId
    ? await reader
        .select({ id: orgAccount.id, kind: orgAccount.kind })
        .from(orgAccount)
        .where(eq(orgAccount.id, orgAccountId))
        .limit(1)
    : [];
  const [setting] = await reader
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, RAZORPAY_CLEARING_ACCOUNT_CONFIG_KEY))
    .limit(1);
  return {
    account: account ?? null,
    razorpayClearingAccountId: setting?.value || null,
  };
}

/**
 * Checks the account, fund, programme and project every row of a batch
 * gets, with the rules of the contribution form: all active, a project fixes
 * its programme, and the Unallocated holder is refused. Returns the
 * programme to store.
 */
export async function resolveImportSettings(input: {
  fundId: string;
  orgAccountId: string;
  programmeId: string | null;
  projectId: string | null;
}): Promise<{ programmeId: string | null }> {
  const [account] = await db
    .select({ active: orgAccount.active, kind: orgAccount.kind })
    .from(orgAccount)
    .where(eq(orgAccount.id, input.orgAccountId));
  // A fixed deposit gets money only by transfer, never a donation.
  if (!account?.active || account.kind === "deposit") {
    throw new Error("Pick an active account the money was deposited into");
  }
  const [fundRow] = await db
    .select({ active: fund.active })
    .from(fund)
    .where(eq(fund.id, input.fundId));
  if (!fundRow?.active) {
    throw new Error("Pick an active fund");
  }
  let { programmeId } = input;
  if (input.projectId) {
    const [projectRow] = await db
      .select({ programmeId: project.programmeId, status: project.status })
      .from(project)
      .where(eq(project.id, input.projectId));
    if (!projectRow || projectRow.status === "closed") {
      throw new Error("Pick an open project");
    }
    if (programmeId && programmeId !== projectRow.programmeId) {
      throw new Error("The project belongs to a different programme");
    }
    programmeId = projectRow.programmeId;
  }
  if (programmeId === PROGRAMME_IDS.unallocated) {
    throw new Error(
      "Choose a real programme, or leave it blank, not the Unallocated holder"
    );
  }
  if (programmeId) {
    const [programmeRow] = await db
      .select({ active: programme.active })
      .from(programme)
      .where(eq(programme.id, programmeId));
    if (!programmeRow?.active) {
      throw new Error("Pick an active programme");
    }
  }
  return { programmeId };
}

export async function getImportBatch(
  id: string
): Promise<ImportBatchRow | null> {
  const [row] = await db
    .select()
    .from(importBatch)
    .where(eq(importBatch.id, id))
    .limit(1);
  return row ?? null;
}

export async function updateImportBatch(
  id: string,
  patch: Partial<typeof importBatch.$inferInsert>,
  executor: Pick<typeof db, "update"> = db
): Promise<void> {
  await executor
    .update(importBatch)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(importBatch.id, id));
}

/** The mapping the most recent reviewed batch from this source used, so the next file starts from it. */
export async function latestImportMapping(
  source: ImportBatchSource
): Promise<Record<string, string> | null> {
  const [row] = await db
    .select({ mapping: importBatch.mapping })
    .from(importBatch)
    .where(and(eq(importBatch.source, source), isNotNull(importBatch.mapping)))
    .orderBy(desc(importBatch.updatedAt))
    .limit(1);
  return (row?.mapping as Record<string, string> | null) ?? null;
}

/** An earlier batch with the same file content, if any. */
export async function findBatchByFileHash(
  fileHash: string,
  excludeId: string
): Promise<{ createdAt: Date; id: string } | null> {
  const [row] = await db
    .select({ createdAt: importBatch.createdAt, id: importBatch.id })
    .from(importBatch)
    .where(
      and(eq(importBatch.fileHash, fileHash), ne(importBatch.id, excludeId))
    )
    .orderBy(desc(importBatch.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listImportRows(
  batchId: string,
  executor: Pick<typeof db, "select"> = db
): Promise<ImportRowRecord[]> {
  return await executor
    .select()
    .from(importRow)
    .where(eq(importRow.batchId, batchId))
    .orderBy(importRow.rowNumber);
}

export interface StoredIdentity {
  contributionId: string;
  externalId: string;
  id: string;
  payloadHash: string;
}

export async function findExternalIdentities(
  key: {
    entityType: ExternalIdentityEntityType;
    provider: ExternalIdentityProvider;
    providerAccount: string;
  },
  externalIds: readonly string[],
  executor: Pick<typeof db, "select"> = db
): Promise<StoredIdentity[]> {
  if (externalIds.length === 0) {
    return [];
  }
  const found: StoredIdentity[] = [];
  const ids = [...new Set(externalIds)];
  for (let i = 0; i < ids.length; i += INSERT_CHUNK) {
    const rows = await executor
      .select({
        contributionId: externalIdentity.contributionId,
        externalId: externalIdentity.externalId,
        id: externalIdentity.id,
        payloadHash: externalIdentity.payloadHash,
      })
      .from(externalIdentity)
      .where(
        and(
          eq(externalIdentity.provider, key.provider),
          eq(externalIdentity.providerAccount, key.providerAccount),
          eq(externalIdentity.entityType, key.entityType),
          inArray(externalIdentity.externalId, ids.slice(i, i + INSERT_CHUNK))
        )
      );
    found.push(...rows);
  }
  return found;
}

export interface MatchedParty {
  name: string;
  partyId: string;
}

/**
 * Parties that can give: an active donor, sponsor, grantor or intermediary
 * role, except that a donation platform such as GiveIndia needs a giver role
 * of its own (`canGive`).
 */
const isContributor = sql`exists (
  select 1 from ${partyRole}
  where ${partyRole.partyId} = ${partyPrivate.partyId}
    and ${partyRole.active} = true
    and ${inArray(partyRole.role, [...CONTRIBUTOR_ROLES])}
    and (${inArray(partyRole.role, [...GIVER_ROLES])}
      or ${notInArray(partyRole.partyId, [...PLATFORM_INTERMEDIARY_PARTY_IDS])})
)`;

/**
 * Exact matches of stored identifiers. Identifiers are encrypted with a
 * random IV, so equality cannot run in SQL: candidates are narrowed by ID
 * type and the clear last four characters, then only those are decrypted
 * here and compared. Returns nothing when the encryption key is missing.
 */
export async function findContributorsByIdentifier(
  identifiers: readonly { idNumber: string; idType: PartyIdType }[],
  executor: Reader = db
): Promise<Map<string, MatchedParty[]>> {
  const matches = new Map<string, MatchedParty[]>();
  const wanted = identifiers.filter((i) => i.idType !== "none" && i.idNumber);
  if (wanted.length === 0 || !hasEncryptionKey()) {
    return matches;
  }
  const tails = [
    ...new Set(
      wanted.map((i) => (i.idNumber.length >= 8 ? i.idNumber.slice(-4) : ""))
    ),
  ];
  const types = [...new Set(wanted.map((i) => i.idType))];
  const candidates = await executor
    .select({
      encrypted: partyPrivate.idNumberEncrypted,
      idType: partyPrivate.idType,
      name: party.displayName,
      partyId: partyPrivate.partyId,
    })
    .from(partyPrivate)
    .innerJoin(party, eq(party.id, partyPrivate.partyId))
    .where(
      and(
        inArray(partyPrivate.idType, types),
        isNotNull(partyPrivate.idNumberEncrypted),
        or(
          inArray(partyPrivate.idNumberLast4, tails.filter(Boolean)),
          sql`${partyPrivate.idNumberLast4} is null`
        ),
        isContributor
      )
    );
  const wantedKeys = new Set(wanted.map((i) => `${i.idType}:${i.idNumber}`));
  for (const candidate of candidates) {
    if (!candidate.encrypted) {
      continue;
    }
    let plain: string;
    try {
      plain = decryptSecret(
        candidate.encrypted,
        partyIdNumberContext(candidate.partyId)
      ).toUpperCase();
    } catch {
      continue;
    }
    const key = `${candidate.idType}:${plain}`;
    if (wantedKeys.has(key)) {
      const list = matches.get(key) ?? [];
      list.push({ name: candidate.name, partyId: candidate.partyId });
      matches.set(key, list);
    }
  }
  return matches;
}

const digits = (phone: string) => phone.replaceAll(/\D/g, "");

/** Contributors whose stored email or phone equals one in the file; these only become proposals. */
export async function findContributorsByContact(
  emails: readonly string[],
  phones: readonly string[],
  executor: Reader = db
): Promise<{
  byEmail: Map<string, MatchedParty[]>;
  byPhone: Map<string, MatchedParty[]>;
}> {
  const byEmail = new Map<string, MatchedParty[]>();
  const byPhone = new Map<string, MatchedParty[]>();
  const emailSet = [...new Set(emails.filter(Boolean))];
  const phoneByDigits = new Map(
    phones.filter(Boolean).map((p) => [digits(p), p] as const)
  );
  if (emailSet.length === 0 && phoneByDigits.size === 0) {
    return { byEmail, byPhone };
  }
  // The same expressions as the party_private indexes, so the lookups use them.
  const email = emailKey(partyPrivate.email);
  const phoneDigits = phoneDigitsKey(partyPrivate.phone);
  const conditions = [
    emailSet.length > 0 ? inArray(email, emailSet) : undefined,
    phoneByDigits.size > 0
      ? inArray(phoneDigits, [...phoneByDigits.keys()])
      : undefined,
  ].filter((c) => c !== undefined);
  const rows = await executor
    .select({
      email: sql<string | null>`${email}`,
      name: party.displayName,
      partyId: partyPrivate.partyId,
      phoneDigits: sql<string>`${phoneDigits}`,
    })
    .from(partyPrivate)
    .innerJoin(party, eq(party.id, partyPrivate.partyId))
    .where(and(or(...conditions), isContributor));
  const add = (
    map: Map<string, MatchedParty[]>,
    key: string,
    value: MatchedParty
  ) => map.set(key, [...(map.get(key) ?? []), value]);
  for (const row of rows) {
    const ref = { name: row.name, partyId: row.partyId };
    if (row.email && emailSet.includes(row.email)) {
      add(byEmail, row.email, ref);
    }
    const phone = phoneByDigits.get(row.phoneDigits);
    if (phone) {
      add(byPhone, phone, ref);
    }
  }
  return { byEmail, byPhone };
}

/** For each party, which fill fields it has no value for. */
export async function findPartyDetailGaps(
  partyIds: readonly string[],
  executor: Reader = db
): Promise<Map<string, Record<PartyFillField, boolean>>> {
  const ids = [...new Set(partyIds)];
  const gaps = new Map<string, Record<PartyFillField, boolean>>();
  if (ids.length === 0) {
    return gaps;
  }
  const rows = await executor
    .select({
      addressLine1: partyPrivate.addressLine1,
      addressLine2: partyPrivate.addressLine2,
      city: partyPrivate.city,
      email: partyPrivate.email,
      idNumberEncrypted: partyPrivate.idNumberEncrypted,
      partyId: partyPrivate.partyId,
      phone: partyPrivate.phone,
      pincode: partyPrivate.pincode,
      state: partyPrivate.state,
    })
    .from(partyPrivate)
    .where(inArray(partyPrivate.partyId, ids));
  const byParty = new Map(rows.map((row) => [row.partyId, row]));
  for (const id of ids) {
    gaps.set(id, partyDetailGaps(byParty.get(id) ?? null));
  }
  return gaps;
}

/**
 * Makes sure GiveIndia exists as an organisation with an active intermediary
 * role, under its fixed ID. Safe to call on every give.do run: an existing
 * party and role are left as they are, even if renamed or deactivated.
 */
export async function ensureGiveIndiaParty(
  tx: ImportTx,
  actorId: string,
  now: Date
): Promise<string> {
  await tx
    .insert(party)
    .values({
      createdAt: now,
      createdBy: actorId,
      displayName: GIVE_INDIA_PARTY_NAME,
      id: GIVE_INDIA_PARTY_ID,
      kind: "organisation",
      legalName: null,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: party.id });
  await tx
    .insert(partyRole)
    .values({
      active: true,
      id: uuidv7(),
      partyId: GIVE_INDIA_PARTY_ID,
      role: "intermediary",
      since: now,
    })
    .onConflictDoNothing({ target: [partyRole.partyId, partyRole.role] });
  return GIVE_INDIA_PARTY_ID;
}

export interface DuplicateCandidate {
  amountPaise: number;
  id: string;
  partyId: string;
  receivedOn: string;
  reference: string | null;
}

/**
 * Contributions that could be the same gift as a row: from a candidate
 * donor in the file's date range, or with a matching reference.
 */
export async function findDuplicateCandidates(
  input: {
    from: string;
    partyIds: readonly string[];
    references: readonly string[];
    to: string;
  },
  executor: Reader = db
): Promise<DuplicateCandidate[]> {
  const conditions = [
    input.partyIds.length > 0
      ? and(
          inArray(contribution.partyId, [...new Set(input.partyIds)]),
          gte(contribution.receivedOn, input.from),
          lte(contribution.receivedOn, input.to)
        )
      : undefined,
    input.references.length > 0
      ? // Matches the contribution_reference_lower_idx expression.
        inArray(sql`lower(${contribution.reference})`, [
          ...new Set(input.references.map((r) => r.toLowerCase())),
        ])
      : undefined,
  ].filter((c) => c !== undefined);
  if (conditions.length === 0) {
    return [];
  }
  return await executor
    .select({
      amountPaise: contribution.amountPaise,
      id: contribution.id,
      partyId: contribution.partyId,
      receivedOn: contribution.receivedOn,
      reference: contribution.reference,
    })
    .from(contribution)
    .where(or(...conditions));
}

/**
 * Moves a batch into `importing` unless another run holds it. A run that died
 * without finishing leaves `importing` behind, so one older than
 * `staleBefore` may be taken over.
 */
export async function claimImportBatch(
  id: string,
  staleBefore: Date
): Promise<ImportBatchRow | null> {
  const [row] = await db
    .update(importBatch)
    .set({ status: "importing", updatedAt: new Date() })
    .where(
      and(
        eq(importBatch.id, id),
        or(
          inArray(importBatch.status, [
            "draft",
            "reviewed",
            "completed",
            "failed",
          ]),
          and(
            eq(importBatch.status, "importing"),
            lte(importBatch.updatedAt, staleBefore)
          )
        )
      )
    )
    .returning();
  return row ?? null;
}

/**
 * One transaction for a whole run, serialised against every other import
 * run, so identity checks made at the start still hold when rows are
 * written. A failure rolls back every row of the run.
 */
export async function withImportTransaction<T>(
  run: (tx: ImportTx) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(IMPORT_RUN_LOCK);
    return await run(tx);
  });
}

export async function insertImportedContribution(
  tx: ImportTx,
  values: typeof contribution.$inferInsert,
  identity: typeof externalIdentity.$inferInsert
): Promise<void> {
  await tx.insert(contribution).values(values);
  await tx.insert(externalIdentity).values(identity);
}

/** One collection record per donor per batch (a unique index); a retried run adds none. */
export async function recordImportCollectionEvent(
  tx: ImportTx,
  values: typeof collectionEvent.$inferInsert & { importBatchId: string }
): Promise<boolean> {
  const inserted = await tx
    .insert(collectionEvent)
    .values(values)
    .onConflictDoNothing({
      target: [collectionEvent.partyId, collectionEvent.importBatchId],
    })
    .returning({ id: collectionEvent.id });
  return inserted.length > 0;
}

export async function setImportRowOutcome(
  tx: ImportTx,
  id: string,
  patch: {
    contributionId?: string | null;
    decidedAt: Date;
    /** Null when the system decided (a Razorpay payment imported on arrival). */
    decidedBy: string | null;
    externalIdentityId?: string | null;
    outcome: ImportRowOutcome;
    outcomeReason: string | null;
    partyId?: string | null;
  }
): Promise<void> {
  await tx.update(importRow).set(patch).where(eq(importRow.id, id));
}

interface Retention {
  retainUntil: string;
  retentionBasis: string;
  retentionPolicyVersion: string;
}

/**
 * Rows a run's retention applies to. A CSV batch is one upload, so a run
 * moves every dated row of it to the imported rows' date. A Razorpay day
 * batch keeps taking payments, so a run only starts the clock for rows that
 * have just reached an outcome: a payment decided months later never extends
 * the rows decided before it. Rows still pending with no date keep waiting.
 */
export function runRetentionScope(
  batchId: string,
  source: ImportBatchSource,
  retainUntil: string
) {
  const decidedWithoutDate = and(
    isNull(importRow.retainUntil),
    ne(importRow.outcome, "pending")
  );
  return and(
    eq(importRow.batchId, batchId),
    source === "razorpay_api"
      ? decidedWithoutDate
      : or(lt(importRow.retainUntil, retainUntil), decidedWithoutDate)
  );
}

/** After a run: sets retention on the rows `runRetentionScope` selects. */
export async function setImportRowsRetention(
  tx: ImportTx,
  batch: { id: string; source: ImportBatchSource },
  retention: Retention
): Promise<void> {
  await tx
    .update(importRow)
    .set(retention)
    .where(runRetentionScope(batch.id, batch.source, retention.retainUntil));
}

/** Starts retention for a Razorpay batch's rows that have just reached an outcome. */
export async function startDecidedRowsRetention(
  tx: ImportTx,
  batchId: string,
  retention: Retention
): Promise<void> {
  await setImportRowsRetention(
    tx,
    { id: batchId, source: "razorpay_api" },
    retention
  );
}

/**
 * Outcome reasons of rows that wait for a decision. Razorpay payments wait
 * while queued for their sync job, after the job gave up (`sync_failed`),
 * for a reviewer, or for an active clearing account; a CSV row a reviewer
 * left undecided is `skipped` with reason `undecided` and waits too.
 */
export const NEEDS_REVIEW_REASONS = [
  "clearing_account_inactive",
  "needs_review",
  "no_clearing_account",
  "queued",
  "sync_failed",
  "undecided",
] as const;
export type WaitingReason = (typeof NEEDS_REVIEW_REASONS)[number];

export interface ImportBatchCounts {
  conflictCount: number;
  errorCount: number;
  importedCount: number;
  linkedCount: number;
  pendingCount: number;
  skippedCount: number;
}

/**
 * The batch's counters from its outcome counts. Every pending row waits,
 * whatever its reason, and so do skipped rows left undecided; each row is
 * counted exactly once.
 */
export function batchCounts(
  counts: Readonly<Record<ImportRowOutcome, number>>,
  skippedWaiting: number
): ImportBatchCounts {
  return {
    conflictCount: counts.conflict,
    errorCount: counts.error,
    importedCount: counts.imported,
    linkedCount: counts.linked_existing,
    pendingCount: counts.pending + skippedWaiting,
    skippedCount: counts.skipped - skippedWaiting,
  };
}

/**
 * Locks the batch row until the caller's transaction ends. Taken before a
 * recount, so a payment staged meanwhile (which adds one to the counters
 * under the same row lock) is either counted or added after the recount is
 * written, never lost under it.
 */
export const lockImportBatchSql = (batchId: string) =>
  sql`select ${importBatch.id} from ${importBatch} where ${importBatch.id} = ${batchId} for update`;

/**
 * The batch's synced counters from its rows. Locks the batch row first (see
 * `lockImportBatchSql`); callers write the counters in the same transaction.
 */
export async function countImportBatchRows(
  tx: ImportTx,
  batchId: string
): Promise<ImportBatchCounts> {
  await tx.execute(lockImportBatchSql(batchId));
  const counts = await countImportOutcomes(tx, batchId);
  const [waiting] = await tx
    .select({ n: count() })
    .from(importRow)
    .where(
      and(
        eq(importRow.batchId, batchId),
        eq(importRow.outcome, "skipped"),
        inArray(importRow.outcomeReason, [...NEEDS_REVIEW_REASONS])
      )
    );
  return batchCounts(counts, Number(waiting?.n ?? 0));
}

/** Recounts a batch's rows by outcome. */
export async function countImportOutcomes(
  tx: ImportTx,
  batchId: string
): Promise<Record<ImportRowOutcome, number>> {
  const rows = await tx
    .select({ n: count(), outcome: importRow.outcome })
    .from(importRow)
    .where(eq(importRow.batchId, batchId))
    .groupBy(importRow.outcome);
  const counts: Record<ImportRowOutcome, number> = {
    conflict: 0,
    error: 0,
    imported: 0,
    linked_existing: 0,
    pending: 0,
    skipped: 0,
  };
  for (const row of rows) {
    counts[row.outcome] = Number(row.n);
  }
  return counts;
}
