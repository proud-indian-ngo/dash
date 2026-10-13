import { createHash } from "node:crypto";

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
 */

export interface RowIdentity {
  entityType: ExternalIdentityEntityType;
  externalId: string;
  provider: ExternalIdentityProvider;
  providerAccount: string;
  /** No external ID in the file, so the ID is a fingerprint of the row. */
  weak: boolean;
}

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

const PROVIDER_BY_SOURCE: Record<ImportBatchSource, ExternalIdentityProvider> =
  {
    generic_csv: "generic",
    give_do_csv: "give_do",
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
  return { ...base, externalId: `fp1:${sha256(fingerprint)}`, weak: true };
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
 */
export function payloadHash(row: NormalizedRow): string {
  return sha256(
    JSON.stringify([
      row.receivedOn,
      row.amountPaise,
      fold(row.donorName),
      row.email,
      row.idType,
      row.idNumber,
      fold(row.reference),
      row.donationType,
      row.channel,
    ])
  );
}

/** Hash of the uploaded cells in header order. */
export function rawRowHash(raw: Readonly<Record<string, string>>): string {
  return sha256(JSON.stringify(Object.entries(raw)));
}

export function fileHash(text: string): string {
  return sha256(text);
}
