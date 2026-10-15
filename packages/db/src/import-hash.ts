import { keyedDigest, keyedDigestWith } from "./encryption";

/**
 * Server-only (node:crypto). The keyed hash behind import row hashes,
 * payload hashes, fingerprint IDs and statement line hashes: HMAC-SHA256
 * under a key derived from DATA_ENCRYPTION_KEY, prefixed with the scheme
 * ("h1:"), which names the algorithm and not the key. Lives here, not in the
 * web app, so the key check can recompute stored hashes under another key.
 */

const IMPORT_HASH_SCHEME = "h1";
const IMPORT_HASH_INFO = "pi-dash import hash v1";

const hashInput = (purpose: string, text: string) => `${purpose}\u0000${text}`;

/** A keyed hash of `text` for one purpose, prefixed with the scheme. */
export const importHash = (purpose: string, text: string) =>
  `${IMPORT_HASH_SCHEME}:${keyedDigest(IMPORT_HASH_INFO, hashInput(purpose, text))}`;

/** `importHash` under an explicit data key. */
export const importHashWith = (
  dataKey: Buffer,
  purpose: string,
  text: string
) =>
  `${IMPORT_HASH_SCHEME}:${keyedDigestWith(dataKey, IMPORT_HASH_INFO, hashInput(purpose, text))}`;

/** What `rawRowHash` hashes: the uploaded cells in header order. */
export const rawRowHashInput = (raw: Readonly<Record<string, string>>) =>
  JSON.stringify(Object.entries(raw));

/** What `refundPayloadHash` hashes: refund ID, payment ID, amount in paise and currency. */
export const refundPayloadHashInput = (refund: {
  amountPaise: number;
  currency: string;
  paymentId: string;
  refundId: string;
}) =>
  JSON.stringify([
    refund.refundId,
    refund.paymentId,
    String(refund.amountPaise),
    refund.currency,
  ]);
