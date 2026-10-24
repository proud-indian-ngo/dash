import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_RE = /^[0-9a-f]{64}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signature(secret: string, eventId: string): string {
  return createHmac("sha256", secret)
    .update(`event-signup\n${eventId.toLowerCase()}`)
    .digest("hex");
}

/**
 * The `sig` of an event's sign-up link (`/register?eventId=&sig=`). Only the
 * server can make one, so a public event ID alone never enrolls anyone.
 */
export function signEventSignupLink(secret: string, eventId: string): string {
  if (!UUID_RE.test(eventId)) {
    throw new Error("Event sign-up links need an event ID");
  }
  return signature(secret, eventId);
}

/** Constant-time check of a sign-up link; false without a secret. */
export function verifyEventSignupLink(
  secret: string | undefined,
  eventId: string,
  sig: string
): boolean {
  if (!(secret && UUID_RE.test(eventId) && SIGNATURE_RE.test(sig))) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(sig, "hex"),
    Buffer.from(signature(secret, eventId), "hex")
  );
}
