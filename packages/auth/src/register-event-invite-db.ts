import { createHash, randomBytes } from "node:crypto";

import { db } from "@pi-dash/db";
import { verification } from "@pi-dash/db/schema/auth";
import { isEventRegistrationInviteToken } from "@pi-dash/shared/event-registration-invite";
import { and, eq, gt, like } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

const REGISTER_EVENT_INVITE_IDENTIFIER_PREFIX = "event-registration:";
const REGISTER_EVENT_INVITE_PURPOSE = "event-registration";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RegisterEventInvitePayload {
  eventId: string;
  issuedBy: string;
  purpose: typeof REGISTER_EVENT_INVITE_PURPOSE;
}

export interface ResolvedRegisterEventInvite {
  eventId: string;
  issuedBy: string;
  storedValue: string;
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function inviteIdentifier(token: string): string {
  const hash = createHash("sha256").update(token).digest("hex");
  return `${REGISTER_EVENT_INVITE_IDENTIFIER_PREFIX}${hash}`;
}

function serializeInvitePayload(payload: RegisterEventInvitePayload): string {
  return JSON.stringify({
    eventId: payload.eventId,
    issuedBy: payload.issuedBy,
    purpose: payload.purpose,
  });
}

/** Every link of one event; the payload is serialized with `eventId` first. */
function eventInvites(eventId: string) {
  if (!UUID_RE.test(eventId)) {
    throw new Error("Event registration invite target must be an event ID");
  }
  return and(
    like(
      verification.identifier,
      `${REGISTER_EVENT_INVITE_IDENTIFIER_PREFIX}%`
    ),
    like(verification.value, `{"eventId":"${eventId}",%`)
  );
}

function parseInvitePayload(value: string): RegisterEventInvitePayload | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      parsed.purpose !== REGISTER_EVENT_INVITE_PURPOSE ||
      typeof parsed.eventId !== "string" ||
      !UUID_RE.test(parsed.eventId) ||
      typeof parsed.issuedBy !== "string" ||
      parsed.issuedBy.length === 0
    ) {
      return null;
    }
    return {
      eventId: parsed.eventId,
      issuedBy: parsed.issuedBy,
      purpose: REGISTER_EVENT_INVITE_PURPOSE,
    };
  } catch {
    return null;
  }
}

/**
 * Mint an event's sign-up link capability, replacing any earlier one, so an
 * event has at most one live link. The raw token is returned once; only its
 * SHA-256 identifier is stored.
 */
export async function issueRegisterEventInvite(input: {
  eventId: string;
  expiresAt: Date;
  issuedBy: string;
}): Promise<string> {
  if (
    !Number.isFinite(input.expiresAt.getTime()) ||
    input.expiresAt.getTime() <= Date.now()
  ) {
    throw new Error("Event registration invite expiry must be in the future");
  }
  if (!UUID_RE.test(input.eventId) || input.issuedBy.length === 0) {
    throw new Error("Event registration invite target and issuer are required");
  }
  const token = randomBytes(32).toString("base64url");
  const payload: RegisterEventInvitePayload = {
    eventId: input.eventId,
    issuedBy: input.issuedBy,
    purpose: REGISTER_EVENT_INVITE_PURPOSE,
  };
  await db.transaction(async (tx) => {
    await tx.delete(verification).where(eventInvites(input.eventId));
    await tx.insert(verification).values({
      expiresAt: input.expiresAt,
      id: uuidv7(),
      identifier: inviteIdentifier(token),
      value: serializeInvitePayload(payload),
    });
  });
  return token;
}

/** Turn off an event's sign-up link, if it has one. */
export async function revokeRegisterEventInvites(
  eventId: string
): Promise<void> {
  await db.delete(verification).where(eventInvites(eventId));
}

export async function resolveRegisterEventInvite(
  token: string,
  now: number
): Promise<ResolvedRegisterEventInvite | null> {
  if (!isEventRegistrationInviteToken(token)) {
    return null;
  }
  const [row] = await db
    .select({ value: verification.value })
    .from(verification)
    .where(
      and(
        eq(verification.identifier, inviteIdentifier(token)),
        gt(verification.expiresAt, new Date(now))
      )
    )
    .limit(1);
  if (!row) {
    return null;
  }
  const payload = parseInvitePayload(row.value);
  return payload ? { ...payload, storedValue: row.value } : null;
}

/**
 * Whether the link resolved earlier is still live, checked inside the
 * enrollment transaction so a link replaced or expired since then no longer
 * enrolls.
 */
export async function isRegisterEventInviteLive(
  tx: DbTransaction,
  input: {
    storedValue: string;
    token: string;
  }
): Promise<boolean> {
  if (!isEventRegistrationInviteToken(input.token)) {
    return false;
  }
  const [row] = await tx
    .select({ id: verification.id })
    .from(verification)
    .where(
      and(
        eq(verification.identifier, inviteIdentifier(input.token)),
        eq(verification.value, input.storedValue),
        gt(verification.expiresAt, new Date())
      )
    )
    .limit(1)
    .for("share");
  return row !== undefined;
}
