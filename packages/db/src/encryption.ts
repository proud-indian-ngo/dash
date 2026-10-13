import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import { env } from "@pi-dash/env/server";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = "v1";

function loadKey(): Buffer {
  const raw = env.DATA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("DATA_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  }
  return key;
}

/** Whether finance-private identifiers can be stored in this environment. */
export function hasEncryptionKey(): boolean {
  const raw = env.DATA_ENCRYPTION_KEY;
  return !!raw && Buffer.from(raw, "base64").length === 32;
}

/**
 * Encrypt a short secret (PAN, bank account number) for storage. The output is
 * `v1.<iv>.<ciphertext>.<tag>` in base64url. `context` names the row the value
 * belongs to (for example `party_private.id_number:<partyId>`) and is bound to
 * the ciphertext as associated data, so a value copied to another row will
 * not decrypt.
 */
export function encryptSecret(plain: string, context: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    body.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptSecret(stored: string, context: string): string {
  const key = loadKey();
  const [version, ivPart, bodyPart, tagPart] = stored.split(".");
  if (version !== VERSION || !ivPart || !bodyPart || !tagPart) {
    throw new Error("Unrecognised encrypted value");
  }
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Unrecognised encrypted value");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(bodyPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** The tail shown in clear beside an encrypted value; short values are not shown at all. */
export function visibleTail(value: string): string | null {
  return value.length >= 8 ? value.slice(-4) : null;
}

const derivedKeys = new Map<string, Buffer>();

/**
 * A 32-byte key for one purpose, derived from DATA_ENCRYPTION_KEY with HKDF
 * so it is never the encryption key itself; `info` names the purpose and
 * its version (for example "pi-dash import hash v1"). Outside production,
 * where the data key is optional, it derives from BETTER_AUTH_SECRET instead
 * so development and tests still work; production requires the data key.
 */
export function derivedKey(info: string): Buffer {
  const cached = derivedKeys.get(info);
  if (cached) {
    return cached;
  }
  let material: Buffer;
  if (hasEncryptionKey()) {
    material = loadKey();
  } else if (process.env.NODE_ENV !== "production" && env.BETTER_AUTH_SECRET) {
    material = Buffer.from(env.BETTER_AUTH_SECRET, "utf8");
  } else {
    throw new Error("DATA_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(
    hkdfSync("sha256", material, Buffer.alloc(0), info, 32)
  );
  derivedKeys.set(info, key);
  return key;
}

/** HMAC-SHA256 of `text` under the key for `info`, hex encoded. */
export function keyedDigest(info: string, text: string): string {
  return createHmac("sha256", derivedKey(info))
    .update(text, "utf8")
    .digest("hex");
}
