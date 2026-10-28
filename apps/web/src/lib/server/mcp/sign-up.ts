import { auth } from "@pi-dash/auth";
import { sendAssistantSignUpVerification } from "@pi-dash/auth/assistant-sign-up";
import {
  decideInterestTarget,
  decideSeriesOccurrence,
  type RegisterInterestSkipReason,
} from "@pi-dash/auth/register-interest";
import { createDbRegisterInterestDeps } from "@pi-dash/auth/register-interest-db";
import { db } from "@pi-dash/db";
import { account, user } from "@pi-dash/db/schema/auth";
import { env } from "@pi-dash/env/server";
import { formatEventRedirect } from "@pi-dash/shared/event-redirect";
import { buildPublicSignUpUrl } from "@pi-dash/shared/public-events";
import { parseRecurrenceRule } from "@pi-dash/shared/rrule-expand";
import { MIN_VOLUNTEER_AGE } from "@pi-dash/shared/volunteer-age";
import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Sign-up on someone's behalf by an assistant (the `start_volunteer_signup`
 * tool). It creates an unverified account with no password and emails the
 * verification link; opening it signs the person in and files their interest
 * in the session, exactly as a website sign-up link does. Nothing happens
 * until the inbox's owner acts, so a wrong or someone else's email gets one
 * ignorable message.
 */

export interface AssistantSignUpInput {
  email: string;
  eventId: string;
  isAdult: boolean;
  name: string;
  occDate?: string;
  phone: string;
}

export interface AssistantSignUpResult {
  isError: boolean;
  message: string;
}

const DAY_MS = 24 * 60 * 60_000;
const PER_PERSON_PER_DAY = 3;
const ALL_PER_HOUR = 60;

const SKIP_MESSAGES: Record<RegisterInterestSkipReason, string> = {
  cancelled: "That session was cancelled. List the sessions again.",
  missing: "There is no such public session. List the sessions again.",
  "needs-session":
    "That is a recurring series: pass the session's occurrenceDate as occDate.",
  "no-session":
    "That series has no session on that date. List the sessions again.",
  "not-public": "There is no such public session. List the sessions again.",
  started: "That session has already started. Pick a later one.",
};

const failure = (message: string): AssistantSignUpResult => ({
  isError: true,
  message,
});

/** Why the session can't take interest, or `null` when it can. */
async function sessionSkipReason(
  eventId: string,
  occDate: string | undefined,
  now: number
): Promise<RegisterInterestSkipReason | null> {
  const event = await createDbRegisterInterestDeps().findEvent(eventId);
  const decision =
    event && !event.seriesId && parseRecurrenceRule(event.recurrenceRule)
      ? decideSeriesOccurrence(event, occDate, now)
      : decideInterestTarget(event, now);
  return decision.kind === "skip" ? decision.reason : null;
}

export async function startAssistantSignUp(
  input: AssistantSignUpInput,
  now = Date.now()
): Promise<AssistantSignUpResult> {
  const email = input.email.trim().toLowerCase();
  const phone = parsePhoneNumberFromString(input.phone.trim(), "IN");
  if (!phone?.isValid()) {
    return failure("That phone number isn't valid. Ask for it again.");
  }
  if (!input.isAdult) {
    return failure(
      `Proud Indian volunteers must be ${MIN_VOLUNTEER_AGE} or older. Sign them up only once they confirm they are.`
    );
  }

  const limits = [
    checkRateLimit("assistant-sign-up", ALL_PER_HOUR, 60 * 60_000),
    checkRateLimit(
      `assistant-sign-up:email:${email}`,
      PER_PERSON_PER_DAY,
      DAY_MS
    ),
    checkRateLimit(
      `assistant-sign-up:phone:${phone.number}`,
      PER_PERSON_PER_DAY,
      DAY_MS
    ),
  ];
  if (limits.some((limit) => !limit.allowed)) {
    return failure("Too many sign-ups right now. Try again later.");
  }

  const skip = await sessionSkipReason(input.eventId, input.occDate, now);
  if (skip) {
    return failure(SKIP_MESSAGES[skip]);
  }

  const signUpUrl = buildPublicSignUpUrl(
    env.BETTER_AUTH_URL,
    input.eventId,
    input.occDate
  );
  // The same answer whether or not the email or phone has an account, so the
  // tool can't be used to find out who volunteers with Proud Indian.
  const sent: AssistantSignUpResult = {
    isError: false,
    message: `If ${email} is new to Proud Indian, we've emailed it a link to confirm the address. Opening it signs them in, asks them to set a password and sends their interest in the session to its team lead, who approves it. If they already have an account, they can sign in and show interest here instead: ${signUpUrl}`,
  };
  const redirect = formatEventRedirect({
    eventId: input.eventId,
    interest: true,
    occDate: input.occDate,
  });

  const [existing] = await db
    .select({ emailVerified: user.emailVerified, id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing) {
    if (!existing.emailVerified) {
      // A password set before anyone proved the inbox may be someone else's,
      // registered to take the account over once its owner verifies. The
      // owner sets their own after verifying, as for any assistant sign-up.
      await db
        .delete(account)
        .where(
          and(
            eq(account.userId, existing.id),
            eq(account.providerId, "credential")
          )
        );
      await sendAssistantSignUpVerification(email, redirect);
    }
    return sent;
  }

  try {
    await auth.api.createUser({
      body: {
        data: {
          phone: phone.number,
        },
        email,
        name: input.name.trim(),
      },
    });
  } catch (error) {
    // The phone is unique. Saying so would reveal whose number it is.
    if (error instanceof APIError && error.message.includes("phone number")) {
      return sent;
    }
    throw error;
  }
  await sendAssistantSignUpVerification(email, redirect);
  return sent;
}
