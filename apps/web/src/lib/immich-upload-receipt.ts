import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@pi-dash/env/server";
import type { ImmichUploadReceiptClaim } from "@pi-dash/zero/context";

const RECEIPT_TTL_MS = 10 * 60 * 1000;
const SIGNATURE_RE = /^[0-9a-f]{64}$/;
const MAX_RECEIPT_LENGTH = 96;

function signingKey(): Buffer {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update("pi-dash:immich-upload-receipt:v1")
    .digest();
}

function payload(claim: ImmichUploadReceiptClaim, expiresAt: number): string {
  return JSON.stringify([
    1,
    claim.assetId,
    claim.eventId,
    claim.photoId,
    claim.userId,
    claim.mimeType,
    expiresAt,
  ]);
}

function signature(claim: ImmichUploadReceiptClaim, expiresAt: number): Buffer {
  return createHmac("sha256", signingKey())
    .update(payload(claim, expiresAt))
    .digest();
}

export function createImmichUploadReceipt(
  claim: ImmichUploadReceiptClaim
): string {
  const expiresAt = Date.now() + RECEIPT_TTL_MS;
  return `${expiresAt}.${signature(claim, expiresAt).toString("hex")}`;
}

export function verifyImmichUploadReceipt(
  input: ImmichUploadReceiptClaim & { receipt: string }
): boolean {
  const { receipt, ...claim } = input;
  if (receipt.length > MAX_RECEIPT_LENGTH) {
    return false;
  }

  const parts = receipt.split(".");
  if (parts.length !== 2) {
    return false;
  }
  const [expiresAtText, signatureText] = parts;
  if (!(expiresAtText && signatureText && SIGNATURE_RE.test(signatureText))) {
    return false;
  }

  const expiresAt = Number(expiresAtText);
  const now = Date.now();
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt > now + RECEIPT_TTL_MS
  ) {
    return false;
  }

  const expected = signature(claim, expiresAt);
  const actual = Buffer.from(signatureText, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
