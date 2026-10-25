import { db } from "@pi-dash/db";
import { account, session, user, verification } from "@pi-dash/db/schema/auth";
import { eventInterest } from "@pi-dash/db/schema/event-interest";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { createEmailVerificationToken } from "better-auth/api";
import { and, eq, like, sql } from "drizzle-orm";

/**
 * Rows for the assistant sign-up spec: a public weekly series far in the
 * future, and the accounts the spec signs up (all `e2e-mcp-signup-*`).
 */
const SERIES_ID = "019f0000-0021-7000-8000-000000002201";
const OCC_DATE = "2096-11-27";
export const EMAIL_PREFIX = "e2e-mcp-signup-";

// A jsonb object, as the app writes it (Drizzle on bun-sql would store a
// JSON string instead).
const WEEKLY = sql<{ rrule: string }>`'{"rrule":"FREQ=WEEKLY"}'::jsonb`;

async function cleanup() {
  // Sessions and their interests cascade with the series, and accounts with
  // their users.
  await db.delete(teamEvent).where(eq(teamEvent.id, SERIES_ID));
  await db.delete(user).where(like(user.email, `${EMAIL_PREFIX}%`));
  await db
    .delete(verification)
    .where(
      like(verification.identifier, `email-verification-otp-${EMAIL_PREFIX}%`)
    );
}

async function setup(creatorEmail: string) {
  await cleanup();
  const creator = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, creatorEmail),
  });
  const owningTeam = await db.query.team.findFirst({ columns: { id: true } });
  if (!(creator && owningTeam)) {
    throw new Error("The sign-up fixture needs a creator and a team");
  }
  const now = new Date();
  await db.insert(teamEvent).values({
    createdAt: now,
    createdBy: creator.id,
    id: SERIES_ID,
    isPublic: true,
    name: "Assistant sign-up weekly session",
    publicArea: "Iblur",
    recurrenceRule: WEEKLY,
    startTime: new Date("2096-11-20T04:30:00.000Z"),
    teamId: owningTeam.id,
    updatedAt: now,
  });
  return { occDate: OCC_DATE, seriesId: SERIES_ID };
}

/** The account an assistant created, and its interest in the fixture series. */
async function state(email: string) {
  const record = await db.query.user.findFirst({
    columns: { emailVerified: true, id: true, phone: true, role: true },
    where: eq(user.email, email),
  });
  if (!record) {
    return { exists: false };
  }
  const [passwords, sessions, interests] = await Promise.all([
    db
      .select({ id: account.id })
      .from(account)
      .where(
        and(eq(account.userId, record.id), eq(account.providerId, "credential"))
      ),
    db
      .select({ id: session.id })
      .from(session)
      .where(eq(session.userId, record.id)),
    db
      .select({
        originalDate: teamEvent.originalDate,
        status: eventInterest.status,
      })
      .from(eventInterest)
      .innerJoin(teamEvent, eq(teamEvent.id, eventInterest.eventId))
      .where(
        and(
          eq(teamEvent.seriesId, SERIES_ID),
          eq(eventInterest.userId, record.id)
        )
      ),
  ]);
  return {
    emailVerified: record.emailVerified,
    exists: true,
    hasPassword: passwords.length > 0,
    interests,
    phone: record.phone,
    role: record.role,
    sessions: sessions.length,
  };
}

/** The token a verification email would carry (signed like Better Auth's). */
async function token(email: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is required to sign verification links"
    );
  }
  return { token: await createEmailVerificationToken(secret, email) };
}

/**
 * A known code for the account's emailed sign-up code. Better Auth stores
 * only its hash, so the spec replaces the hash with that of `CODE`.
 */
const CODE = "246810";
async function code(email: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(CODE)
  );
  const updated = await db
    .update(verification)
    .set({ value: `${Buffer.from(digest).toString("base64url")}:0` })
    .where(eq(verification.identifier, `email-verification-otp-${email}`))
    .returning({ id: verification.id });
  if (updated.length === 0) {
    throw new Error(`No sign-up code was issued for ${email}`);
  }
  return { code: CODE };
}

/** A password on an unverified account, as a form sign-up by someone else leaves. */
async function preregister(email: string) {
  const record = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, email),
  });
  if (!record) {
    throw new Error(`No account for ${email}`);
  }
  await db.insert(account).values({
    accountId: record.id,
    createdAt: new Date(),
    id: crypto.randomUUID(),
    password: "attacker-password-hash",
    providerId: "credential",
    updatedAt: new Date(),
    userId: record.id,
  });
  return { preregistered: true };
}

const [action, argument] = process.argv.slice(2);
let result: unknown;
if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "setup" && argument) {
  result = await setup(argument);
} else if (action === "state" && argument) {
  result = await state(argument);
} else if (action === "preregister" && argument) {
  result = await preregister(argument);
} else if (action === "code" && argument) {
  result = await code(argument);
} else if (action === "token" && argument) {
  result = await token(argument);
} else {
  throw new Error(`Unsupported sign-up fixture action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
