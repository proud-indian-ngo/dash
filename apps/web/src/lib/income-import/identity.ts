import { createHash } from "node:crypto";

import { importHash, rawRowHashInput } from "@pi-dash/db/import-hash";
import type {
  ExternalIdentityEntityType,
  ExternalIdentityProvider,
  ImportBatchSource,
} from "@pi-dash/shared/constants";

import type { NormalizedRow } from "./normalize";

/**
 * Server-only (node:crypto). How an imported row is identified across
 * uploads, and how its content is fingerprinted to tell an identical
 * re-upload from a changed one.
 *
 * Row hashes are keyed (HMAC-SHA256 under a key derived from
 * DATA_ENCRYPTION_KEY), so a stored hash cannot be checked against guessed
 * names, amounts or PANs without the key. Each stored value carries the
 * scheme as a prefix ("h1:"); the prefix names the algorithm, not the key.
 * A different key (the BETTER_AUTH_SECRET fallback replaced by
 * DATA_ENCRYPTION_KEY, or a new DATA_ENCRYPTION_KEY) changes every hash:
 * see "Import hashes and the key" in docs/architecture/finance-and-programmes.md.
 */

/** A keyed hash of `text` for one purpose, prefixed with the scheme. */
export const keyedHash = importHash;

export interface RowIdentity {
  entityType: ExternalIdentityEntityType;
  externalId: string;
  provider: ExternalIdentityProvider;
  providerAccount: string;
  /** No external ID in the file, so the ID is a fingerprint of the row. */
  weak: boolean;
}

const PROVIDER_BY_SOURCE: Record<ImportBatchSource, ExternalIdentityProvider> =
  {
    // Never used: statement lines are identified by their line hash.
    bank_csv: "generic",
    generic_csv: "generic",
    give_do_csv: "give_do",
    give_do_payout: "give_do",
    razorpay_api: "razorpay",
  };

const fold = (value: string) =>
  value.toLowerCase().replaceAll(/\s+/g, " ").trim();

/**
 * The provider's own donation ID when the file has one; otherwise a
 * fingerprint of date, amount, donor name and reference, prefixed so it can
 * never equal a real ID.
 */
export function rowIdentity(
  row: Pick<
    NormalizedRow,
    "amountPaise" | "donorName" | "externalId" | "receivedOn" | "reference"
  >,
  source: ImportBatchSource,
  orgAccountId: string
): RowIdentity {
  const base = {
    entityType: "payment" as const,
    provider: PROVIDER_BY_SOURCE[source],
    providerAccount: orgAccountId,
  };
  const externalId = row.externalId.trim();
  if (externalId) {
    return { ...base, externalId, weak: false };
  }
  const fingerprint = [
    row.receivedOn ?? "",
    String(row.amountPaise ?? ""),
    fold(row.donorName),
    fold(row.reference),
  ].join("|");
  return {
    ...base,
    externalId: `fp:${keyedHash("fingerprint", fingerprint)}`,
    weak: true,
  };
}

export function identityKey(
  identity: Pick<
    RowIdentity,
    "entityType" | "externalId" | "provider" | "providerAccount"
  >
): string {
  return [
    identity.provider,
    identity.providerAccount,
    identity.entityType,
    identity.externalId,
  ].join("\u0000");
}

/**
 * Fingerprint of everything the row would write: a re-upload with the same
 * hash links to the earlier contribution, a different hash is a conflict.
 * The channel counts only when the file states it: the batch default is a
 * setting of the upload, so uploading the same file again with another
 * default must not turn every row into a conflict.
 */
export function payloadHash(row: NormalizedRow): string {
  return keyedHash(
    "payload",
    JSON.stringify([
      row.receivedOn,
      row.amountPaise,
      fold(row.donorName),
      row.email,
      row.idType,
      row.idNumber,
      fold(row.reference),
      row.donationType,
      row.channelFromFile ? row.channel : null,
    ])
  );
}

/** Hash of the uploaded cells in header order. */
export function rawRowHash(raw: Readonly<Record<string, string>>): string {
  return keyedHash("raw", rawRowHashInput(raw));
}

/** Plain SHA-256 of the whole file, only to spot the same file uploaded twice. */
export function fileHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
