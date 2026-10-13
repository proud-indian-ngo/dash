import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { env } from "@pi-dash/env/server";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = "v1";

function loadKey(): Buffer {
  const raw = env.DATA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "DATA_ENCRYPTION_KEY is not set; finance-private fields cannot be stored"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  }
  return key;
}

/** Whether finance-private fields can be written in this environment. */
export function hasEncryptionKey(): boolean {
  const raw = env.DATA_ENCRYPTION_KEY;
  return !!raw && Buffer.from(raw, "base64").length === 32;
}

/**
 * Encrypt a short secret (PAN, bank account number) for storage. Output is
 * `v1.<iv>.<ciphertext>.<tag>` in base64url so a future key rotation can
 * recognise old rows.
 */
export function encryptSecret(plain: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    body.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptSecret(stored: string): string {
  const key = loadKey();
  const [version, ivPart, bodyPart, tagPart] = stored.split(".");
  if (version !== VERSION || !ivPart || !bodyPart || !tagPart) {
    throw new Error("Unrecognised encrypted value");
  }
  const tag = Buffer.from(tagPart, "base64url");
  if (tag.length !== TAG_BYTES) {
    throw new Error("Unrecognised encrypted value");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(bodyPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** The characters shown in clear beside an encrypted value. */
export function last4(value: string): string {
  return value.length <= 4 ? value : value.slice(-4);
}

/** Constant-time comparison for matching a supplied value to a stored one. */
export function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
