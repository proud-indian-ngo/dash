import { and, eq, isNotNull, isNull, like, sql } from "drizzle-orm";
import type { PgSelect } from "drizzle-orm/pg-core";

import type { db } from "..";
import { decryptSecretWith, loadKey } from "../encryption";
import {
  accountNumberContext,
  partyIdNumberContext,
  snapshotIdContext,
} from "../encryption-contexts";
import {
  importHashWith,
  rawRowHashInput,
  refundPayloadHashInput,
} from "../import-hash";
import {
  externalIdentity,
  importRow,
  pendingRefund,
} from "../schema/private/imports";
import {
  partyBankAccount,
  partyPrivate,
} from "../schema/private/party-private";
import { contributionReceiptSnapshot } from "../schema/private/receipts";
import { statementLine } from "../schema/statement-line";
import {
  type ColumnReport,
  type KeyPair,
  planEncrypted,
  planHashes,
  unverifiableReport,
  type Update,
} from "../secret-keys";

/**
 * Every value that depends on DATA_ENCRYPTION_KEY, checked against the
 * current key and an optional old one, and re-encrypted or rehashed where
 * only the old key fits. Each column runs in its own transaction with its
 * rows locked, so a rekey never mixes keys inside a column it has finished.
 * See "Encryption key mismatch: check and rekey" in DEPLOYMENT.md.
 */

type Database = typeof db;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Tx;

interface EncryptedColumn {
  column: string;
  context: (id: string) => string;
  read: (
    tx: Executor,
    options: ReadOptions
  ) => Promise<{ id: string; value: string }[]>;
  write: (tx: Executor, update: Update) => Promise<void>;
}

interface ReadOptions {
  /** At most this many rows, for sampling. */
  limit?: number;
  /** Lock the rows for the rest of the transaction. */
  lock: boolean;
}

function finish<Q extends PgSelect>(query: Q, options: ReadOptions): Q {
  let result = query;
  if (options.limit !== undefined) {
    result = result.limit(options.limit);
  }
  if (options.lock) {
    result = result.for("update");
  }
  return result;
}

/** Encrypted columns and the context each one binds its values to. */
const ENCRYPTED_COLUMNS: readonly EncryptedColumn[] = [
  {
    column: "private.party_private.id_number_encrypted",
    context: partyIdNumberContext,
    read: async (tx, options) =>
      (await finish(
        tx
          .select({
            id: partyPrivate.partyId,
            value: partyPrivate.idNumberEncrypted,
          })
          .from(partyPrivate)
          .where(isNotNull(partyPrivate.idNumberEncrypted))
          .orderBy(partyPrivate.partyId)
          .$dynamic(),
        options
      )) as { id: string; value: string }[],
    write: async (tx, u) => {
      await tx
        .update(partyPrivate)
        .set({ idNumberEncrypted: u.value })
        .where(
          and(
            eq(partyPrivate.partyId, u.id),
            eq(partyPrivate.idNumberEncrypted, u.previous)
          )
        );
    },
  },
  {
    column: "private.party_bank_account.account_number_encrypted",
    context: accountNumberContext,
    read: async (tx, options) =>
      await finish(
        tx
          .select({
            id: partyBankAccount.id,
            value: partyBankAccount.accountNumberEncrypted,
          })
          .from(partyBankAccount)
          .orderBy(partyBankAccount.id)
          .$dynamic(),
        options
      ),
    write: async (tx, u) => {
      await tx
        .update(partyBankAccount)
        .set({ accountNumberEncrypted: u.value })
        .where(
          and(
            eq(partyBankAccount.id, u.id),
            eq(partyBankAccount.accountNumberEncrypted, u.previous)
          )
        );
    },
  },
  {
    column: "private.contribution_receipt_snapshot.id_number_encrypted",
    context: snapshotIdContext,
    read: async (tx, options) =>
      (await finish(
        tx
          .select({
            id: contributionReceiptSnapshot.receiptId,
            value: contributionReceiptSnapshot.idNumberEncrypted,
          })
          .from(contributionReceiptSnapshot)
          .where(isNotNull(contributionReceiptSnapshot.idNumberEncrypted))
          .orderBy(contributionReceiptSnapshot.receiptId)
          .$dynamic(),
        options
      )) as { id: string; value: string }[],
    write: async (tx, u) => {
      await tx
        .update(contributionReceiptSnapshot)
        .set({ idNumberEncrypted: u.value })
        .where(
          and(
            eq(contributionReceiptSnapshot.receiptId, u.id),
            eq(contributionReceiptSnapshot.idNumberEncrypted, u.previous)
          )
        );
    },
  },
];

interface HashColumn {
  column: string;
  read: (
    tx: Executor,
    options: ReadOptions
  ) => Promise<
    { id: string; recompute: (key: Buffer) => string; stored: string }[]
  >;
  write: (tx: Executor, update: Update) => Promise<void>;
}

/** Keyed hashes whose inputs are still stored, so they can be recomputed. */
const HASH_COLUMNS: readonly HashColumn[] = [
  {
    column: "private.pending_refund.payload_hash",
    read: async (tx, options) => {
      const rows = await finish(
        tx
          .select({
            amountPaise: pendingRefund.amountPaise,
            currency: pendingRefund.currency,
            id: pendingRefund.id,
            paymentId: pendingRefund.paymentId,
            refundId: pendingRefund.refundId,
            stored: pendingRefund.payloadHash,
          })
          .from(pendingRefund)
          .orderBy(pendingRefund.id)
          .$dynamic(),
        options
      );
      return rows.map((row) => ({
        id: row.id,
        recompute: (key: Buffer) =>
          importHashWith(key, "razorpay-refund", refundPayloadHashInput(row)),
        stored: row.stored,
      }));
    },
    write: async (tx, u) => {
      await tx
        .update(pendingRefund)
        .set({ payloadHash: u.value })
        .where(
          and(
            eq(pendingRefund.id, u.id),
            eq(pendingRefund.payloadHash, u.previous)
          )
        );
    },
  },
  {
    column: "private.import_row.raw_hash",
    read: async (tx, options) => {
      const rows = await finish(
        tx
          .select({
            id: importRow.id,
            raw: importRow.raw,
            stored: importRow.rawHash,
          })
          .from(importRow)
          .where(isNotNull(importRow.raw))
          .orderBy(importRow.id)
          .$dynamic(),
        options
      );
      return rows.map((row) => {
        const input = rawRowHashInput(row.raw ?? {});
        return {
          id: row.id,
          recompute: (key: Buffer) => importHashWith(key, "raw", input),
          stored: row.stored,
        };
      });
    },
    write: async (tx, u) => {
      await tx
        .update(importRow)
        .set({ rawHash: u.value })
        .where(and(eq(importRow.id, u.id), eq(importRow.rawHash, u.previous)));
    },
  },
];

const count = sql<number>`count(*)::int`;

/** Keyed hashes whose inputs are gone; they are counted, never changed. */
async function unverifiableReports(tx: Executor): Promise<ColumnReport[]> {
  const [payload] = await tx
    .select({ n: count })
    .from(externalIdentity)
    .where(like(externalIdentity.payloadHash, "h1:%"));
  const [fingerprint] = await tx
    .select({ n: count })
    .from(externalIdentity)
    .where(like(externalIdentity.externalId, "fp:%"));
  const [rawGone] = await tx
    .select({ n: count })
    .from(importRow)
    .where(and(isNull(importRow.raw), like(importRow.rawHash, "h1:%")));
  const [lines] = await tx.select({ n: count }).from(statementLine);
  return [
    unverifiableReport(
      "private.external_identity.payload_hash",
      payload?.n ?? 0
    ),
    unverifiableReport(
      "private.external_identity.external_id (fp: fingerprints)",
      fingerprint?.n ?? 0
    ),
    unverifiableReport(
      "private.import_row.raw_hash (raw cells expired)",
      rawGone?.n ?? 0
    ),
    unverifiableReport("public.statement_line.line_hash", lines?.n ?? 0),
  ];
}

/** Read-only: which key opens or reproduces every stored value. */
export async function checkStoredSecrets(
  executor: Executor,
  keys: KeyPair
): Promise<ColumnReport[]> {
  const reports: ColumnReport[] = [];
  for (const spec of ENCRYPTED_COLUMNS) {
    const rows = await spec.read(executor, { lock: false });
    reports.push(
      planEncrypted(spec.column, rows, spec.context, keys, false).report
    );
  }
  for (const spec of HASH_COLUMNS) {
    const rows = await spec.read(executor, { lock: false });
    reports.push(planHashes(spec.column, rows, keys, false).report);
  }
  reports.push(...(await unverifiableReports(executor)));
  return reports;
}

export class RekeyRefusedError extends Error {}

/**
 * Re-encrypts every value only the old key opens, and rehashes every hash
 * only the old key reproduces, under the current key. One transaction per
 * column with its rows locked. Values neither key opens are left alone.
 * Running it again changes nothing.
 */
export async function rekeyStoredSecrets(
  executor: Executor,
  keys: KeyPair,
  options: { dryRun: boolean }
): Promise<ColumnReport[]> {
  const { old } = keys;
  if (!old) {
    throw new RekeyRefusedError(
      "OLD_DATA_ENCRYPTION_KEY is required: it is the key the unreadable values were written with"
    );
  }
  if (old.equals(keys.current)) {
    throw new RekeyRefusedError(
      "OLD_DATA_ENCRYPTION_KEY is the same key as DATA_ENCRYPTION_KEY"
    );
  }
  const reports: ColumnReport[] = [];
  const run = async (
    plan: (
      tx: Executor
    ) => Promise<{ report: ColumnReport; updates: Update[] }>,
    write: (tx: Executor, update: Update) => Promise<void>
  ) => {
    const report = await executor.transaction(async (tx) => {
      const planned = await plan(tx);
      if (!options.dryRun) {
        for (const update of planned.updates) {
          await write(tx, update);
        }
        planned.report.changed = planned.updates.length;
      }
      return planned.report;
    });
    reports.push(report);
  };
  for (const spec of ENCRYPTED_COLUMNS) {
    await run(
      async (tx) =>
        planEncrypted(
          spec.column,
          await spec.read(tx, { lock: true }),
          spec.context,
          keys,
          true
        ),
      spec.write
    );
  }
  for (const spec of HASH_COLUMNS) {
    await run(
      async (tx) =>
        planHashes(
          spec.column,
          await spec.read(tx, { lock: true }),
          keys,
          true
        ),
      spec.write
    );
  }
  reports.push(...(await unverifiableReports(executor)));
  return reports;
}

export class KeyMismatchError extends Error {
  constructor() {
    super(
      "DATA_ENCRYPTION_KEY doesn't match the data already stored in this database: none of the sampled encrypted values open with it. Use the key this database's app runs with (see DEPLOYMENT.md, Encryption key mismatch)."
    );
    this.name = "KeyMismatchError";
  }
}

const SAMPLE_SIZE = 20;

/**
 * Before writing new encrypted values: if this database already holds any,
 * at least one of a sample must open with `key`, or the caller is about to
 * mix keys (for example a laptop's key against the production database).
 * An empty database passes.
 */
export async function assertKeyOpensStoredData(
  executor: Executor,
  key: Buffer = loadKey()
): Promise<void> {
  let sampled = 0;
  for (const spec of ENCRYPTED_COLUMNS) {
    const rows = await spec.read(executor, { limit: SAMPLE_SIZE, lock: false });
    for (const row of rows) {
      sampled += 1;
      try {
        decryptSecretWith(key, row.value, spec.context(row.id));
        return;
      } catch {
        // Try the next value.
      }
    }
  }
  if (sampled > 0) {
    throw new KeyMismatchError();
  }
}
