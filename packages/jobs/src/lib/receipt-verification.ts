import { timingSafeEqual } from "node:crypto";

import { keyedDigest } from "@pi-dash/db/encryption";
import { env } from "@pi-dash/env/server";

/**
 * The link a receipt's QR code opens. It is signed so receipt pages can't be
 * found by trying IDs, and a fabricated receipt can't carry a working one.
 * The key derives from DATA_ENCRYPTION_KEY, which never changes once data
 * exists, so links on printed receipts keep working. Printed links can never
 * change, so keep the path and parameter as they are.
 */
const VERIFY_INFO = "pi-dash receipt verify v1";
// 128 bits in base64url: plenty for a link, and short enough that the
// production URL stays at QR version 6.
const SIG_RE = /^[\w-]{22}$/;

function signature(receiptId: string): string {
  const digest = keyedDigest(VERIFY_INFO, receiptId.toLowerCase());
  return Buffer.from(digest.slice(0, 32), "hex").toString("base64url");
}

export function receiptVerifyUrl(receiptId: string): string {
  const base = (env.APP_URL ?? env.BETTER_AUTH_URL).replace(/\/+$/, "");
  return `${base}/verify/r/${receiptId.toLowerCase()}?s=${signature(receiptId)}`;
}

/** Constant-time check of a link's `s` for its receipt. */
export function isReceiptVerifySignature(
  receiptId: string,
  sig: string
): boolean {
  if (!SIG_RE.test(sig)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(signature(receiptId)), Buffer.from(sig));
}
