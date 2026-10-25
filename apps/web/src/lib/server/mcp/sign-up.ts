import { auth } from "@pi-dash/auth";
import {
  sendAssistantSignUpVerification,
  welcomeVerifiedAssistantSignUp,
} from "@pi-dash/auth/assistant-sign-up";
import {
  decideInterestTarget,
  decideSeriesOccurrence,
  type RegisterInterestSkipReason,
} from "@pi-dash/auth/register-interest";
import {
  createDbRegisterInterestDeps,
  fileVerifiedSignUpInterest,
} from "@pi-dash/auth/register-interest-db";
import { signUpDobError } from "@pi-dash/auth/sign-up-age";
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { env } from "@pi-dash/env/server";
import { formatEventRedirect } from "@pi-dash/shared/event-redirect";
import { buildPublicSignUpUrl } from "@pi-dash/shared/public-events";
import { parseRecurrenceRule } from "@pi-dash/shared/rrule-expand";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Sign-up on someone's behalf by an assistant (the `start_volunteer_signup`
 * tool). It creates an unverified account with no password and emails the
 * verification link and a code; opening the link signs the person in and
 * files their interest in the session, exactly as a website sign-up link
 * does, and reading the code back to the assistant (`confirm_volunteer_signup`)
 * does the same without signing in. Nothing happens until the inbox's owner
 * acts, so a wrong or someone else's email gets one ignorable message.
 */

export interface AssistantSignUpInput {
  dateOfBirth: string;
  email: string;
  eventId: string;
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
  const dobError = signUpDobError(input.dateOfBirth, new Date(now));
  if (dobError) {
    return failure(dobError);
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
  // The same answer whether or not the email has an account, so the tool
  // can't be used to find out who volunteers with Proud Indian.
  const sent: AssistantSignUpResult = {
    isError: false,
    message: `If ${email} is new to Proud Indian, we've emailed it a link and a 6-digit code to confirm the address. They can open the link, which signs them in, asks them to set a password and sends their interest in the session to its team lead, who approves it. Or they can tell you the code and you call confirm_volunteer_signup. If they already have an account, they can sign in and show interest here instead: ${signUpUrl}`,
  };
  const redirect = formatEventRedirect({
    eventId: input.eventId,
    interest: true,
    occDate: input.occDate,
  });

  const [existing] = await db
    .select({ emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing) {
    if (!existing.emailVerified) {
      await sendAssistantSignUpVerification(email, redirect);
    }
    return sent;
  }

  try {
    await auth.api.createUser({
      body: {
        data: {
          dob: new Date(`${input.dateOfBirth}T00:00:00.000Z`),
          phone: phone.number,
        },
        email,
        name: input.name.trim(),
      },
    });
  } catch (error) {
    // The phone is unique; the sign-up form says so too.
    if (error instanceof APIError && error.message.includes("phone number")) {
      return failure(
        `That phone number is already registered with Proud Indian. They can sign in and show interest here: ${signUpUrl}`
      );
    }
    throw error;
  }
  await sendAssistantSignUpVerification(email, redirect);
  return sent;
}

export interface AssistantSignUpConfirmation {
  code: string;
  email: string;
  eventId: string;
  occDate?: string;
}

/**
 * The code from the sign-up email, read back to the assistant: it verifies
 * the address and files the interest as opening the link would, then emails
 * a link to set a password, since nobody was signed in.
 */
export async function confirmAssistantSignUp(
  input: AssistantSignUpConfirmation,
  now = Date.now()
): Promise<AssistantSignUpResult> {
  const email = input.email.trim().toLowerCase();
  // One answer for every wrong case, so this can't tell who has an account.
  const wrongCode = failure(
    "That code didn't work. Check it with them, or ask them to open the link in the email instead. A code works for an hour and allows three tries."
  );
  const skip = await sessionSkipReason(input.eventId, input.occDate, now);
  if (skip) {
    return failure(SKIP_MESSAGES[skip]);
  }
  const [row] = await db
    .select({
      emailVerified: user.emailVerified,
      id: user.id,
      name: user.name,
    })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!row || row.emailVerified) {
    return wrongCode;
  }

  let sessionToken: string | null;
  try {
    ({ token: sessionToken } = await auth.api.verifyEmailOTP({
      body: { email, otp: input.code.trim() },
    }));
  } catch (error) {
    if (error instanceof APIError) {
      return wrongCode;
    }
    throw error;
  }
  // Verifying signs in (autoSignInAfterVerification), but no browser holds
  // this session.
  if (sessionToken) {
    const { internalAdapter } = await auth.$context;
    await internalAdapter.deleteSession(sessionToken);
  }

  await fileVerifiedSignUpInterest(row, {
    eventId: input.eventId,
    occDate: input.occDate,
  });
  await welcomeVerifiedAssistantSignUp(row.id);
  await auth.api.requestPasswordReset({
    body: { email, redirectTo: "/reset-password" },
  });
  return {
    isError: false,
    message:
      "Confirmed. Their interest in the session is with its team lead, who approves it. We've emailed them a link to set a password so they can sign in to the dashboard.",
  };
}
