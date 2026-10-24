import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { eventInterest } from "@pi-dash/db/schema/event-interest";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { and, asc, eq, gte } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { runServerZeroMutation } from "@/lib/server/zero-server-mutation";

/**
 * Tools that act as the volunteer who connected their account to the
 * assistant (OAuth; assistants.md). Each reloads the account, so a banned or
 * deleted one stops working before its access token expires.
 */

export interface AccountToolResult {
  isError: boolean;
  message: string;
}

async function activeAccount(userId: string) {
  const [row] = await db
    .select({
      banned: user.banned,
      id: user.id,
      name: user.name,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row && !row.banned ? row : null;
}

const NO_ACCOUNT: AccountToolResult = {
  isError: true,
  message: "This Proud Indian account can't be used. Reconnect the account.",
};

/** Files a pending interest request through the app's own mutator. */
export async function showInterest(
  userId: string,
  input: { eventId: string; occDate?: string }
): Promise<AccountToolResult> {
  const account = await activeAccount(userId);
  if (!account) {
    return NO_ACCOUNT;
  }
  try {
    await runServerZeroMutation({ user: account }, "eventInterest.create", {
      eventId: input.eventId,
      id: uuidv7(),
      materializedId: uuidv7(),
      now: Date.now(),
      occDate: input.occDate,
    });
  } catch (error) {
    // The mutator's refusals (already a member, started, the safeguarding
    // policy to accept first) are written for the volunteer.
    return {
      isError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    isError: false,
    message:
      "Interest sent. The session's team lead will approve or decline it, and Proud Indian will let them know.",
  };
}

/** The volunteer's interest requests for sessions that haven't started. */
export async function listMyInterests(
  userId: string
): Promise<AccountToolResult> {
  if (!(await activeAccount(userId))) {
    return NO_ACCOUNT;
  }
  const rows = await db
    .select({
      eventId: teamEvent.id,
      name: teamEvent.name,
      startTime: teamEvent.startTime,
      status: eventInterest.status,
    })
    .from(eventInterest)
    .innerJoin(teamEvent, eq(teamEvent.id, eventInterest.eventId))
    .where(
      and(
        eq(eventInterest.userId, userId),
        gte(teamEvent.startTime, new Date())
      )
    )
    .orderBy(asc(teamEvent.startTime));
  return {
    isError: false,
    message: JSON.stringify({
      interests: rows.map((row) => ({
        ...row,
        startTime: row.startTime.toISOString(),
      })),
    }),
  };
}
