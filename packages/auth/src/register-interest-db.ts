import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { eventInterest } from "@pi-dash/db/schema/event-interest";
import { teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { uuidv7 } from "uuidv7";

import {
  type RegisterInterestDeps,
  type RegisterInterestEventRow,
  requestInterestOnRegister,
} from "./register-interest";

const eventColumns = {
  cancelledAt: teamEvent.cancelledAt,
  endTime: teamEvent.endTime,
  id: teamEvent.id,
  isPublic: teamEvent.isPublic,
  managementDomain: teamEvent.managementDomain,
  name: teamEvent.name,
  recurrenceRule: teamEvent.recurrenceRule,
  seriesId: teamEvent.seriesId,
  startTime: teamEvent.startTime,
  teamId: teamEvent.teamId,
};

function toEventRow(row: {
  cancelledAt: Date | null;
  endTime: Date | null;
  id: string;
  isPublic: boolean;
  managementDomain: string | null;
  name: string;
  recurrenceRule: unknown;
  seriesId: string | null;
  startTime: Date;
  teamId: string;
}): RegisterInterestEventRow {
  return {
    ...row,
    cancelledAt: row.cancelledAt?.getTime() ?? null,
    endTime: row.endTime?.getTime() ?? null,
    managementDomain: row.managementDomain ?? null,
    startTime: row.startTime.getTime(),
  };
}

const JWT_PAYLOAD_INDEX = 1;

/**
 * The account a verification token is for, if it is not verified yet. Reads
 * the token's email without checking the signature; callers only act on it
 * after Better Auth has verified the same token.
 */
export async function findUnverifiedUserForToken(
  token: string
): Promise<{ id: string; name: string } | null> {
  let email: unknown;
  try {
    const payload = token.split(".")[JWT_PAYLOAD_INDEX] ?? "";
    email = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    )?.email;
  } catch {
    return null;
  }
  if (typeof email !== "string") {
    return null;
  }
  const [row] = await db
    .select({
      emailVerified: user.emailVerified,
      id: user.id,
      name: user.name,
    })
    .from(user)
    .where(eq(user.email, email.toLowerCase()))
    .limit(1);
  return row && !row.emailVerified ? { id: row.id, name: row.name } : null;
}

export function createDbRegisterInterestDeps(): RegisterInterestDeps {
  return {
    enqueueNotifyInterestReceived: async (payload) => {
      await enqueue("notify-event-interest-received", payload);
    },
    findEvent: async (eventId) => {
      const [row] = await db
        .select(eventColumns)
        .from(teamEvent)
        .where(eq(teamEvent.id, eventId))
        .limit(1);
      return row ? toEventRow(row) : null;
    },
    findTeamLeadIds: async (teamId) => {
      const rows = await db
        .select({ userId: teamMember.userId })
        .from(teamMember)
        .where(and(eq(teamMember.teamId, teamId), eq(teamMember.role, "lead")));
      return rows.map((row) => row.userId);
    },
    materializeOccurrence: ({
      materializedId,
      now,
      occurrence,
      series,
      userId,
    }) =>
      db.transaction(async (tx) => {
        const findSession = async () => {
          const [row] = await tx
            .select(eventColumns)
            .from(teamEvent)
            .where(
              and(
                eq(teamEvent.seriesId, series.id),
                eq(teamEvent.originalDate, occurrence.date)
              )
            )
            .limit(1);
          return row ? toEventRow(row) : null;
        };
        const existing = await findSession();
        if (existing) {
          return existing;
        }
        const [parent] = await tx
          .select({ inheritVolunteers: teamEvent.inheritVolunteers })
          .from(teamEvent)
          .where(eq(teamEvent.id, series.id))
          .limit(1);
        if (!parent) {
          return null;
        }
        // Copy the series row inside Postgres (as `buildExceptionInsert`
        // does in Zero), so jsonb columns are not re-encoded by the driver.
        const inserted = await tx
          .insert(teamEvent)
          .select(
            tx
              .select({
                ...getTableColumns(teamEvent),
                createdAt: sql`${new Date(now)}::timestamp`.as("created_at"),
                createdBy: sql`${userId}`.as("created_by"),
                endTime: sql`${
                  occurrence.endTime === null
                    ? null
                    : new Date(occurrence.endTime)
                }::timestamp`.as("end_time"),
                id: sql`${materializedId}::uuid`.as("id"),
                originalDate: sql`${occurrence.date}`.as("original_date"),
                recurrenceRule: sql`null::jsonb`.as("recurrence_rule"),
                seriesId: teamEvent.id,
                startTime: sql`${new Date(occurrence.startTime)}::timestamp`.as(
                  "start_time"
                ),
                updatedAt: sql`${new Date(now)}::timestamp`.as("updated_at"),
              })
              .from(teamEvent)
              .where(eq(teamEvent.id, series.id))
          )
          .onConflictDoNothing({
            target: [teamEvent.seriesId, teamEvent.originalDate],
          })
          .returning({ id: teamEvent.id });
        if (inserted.length > 0 && parent.inheritVolunteers) {
          const members = await tx
            .select({
              addedAt: teamEventMember.addedAt,
              userId: teamEventMember.userId,
            })
            .from(teamEventMember)
            .where(eq(teamEventMember.eventId, series.id));
          if (members.length > 0) {
            await tx.insert(teamEventMember).values(
              members.map((member) => ({
                addedAt: member.addedAt,
                eventId: materializedId,
                id: uuidv7(),
                userId: member.userId,
              }))
            );
          }
        }
        return findSession();
      }),
    insertPendingInterest: async (row) => {
      const inserted = await db
        .insert(eventInterest)
        .values({
          createdAt: new Date(row.createdAt),
          eventId: row.eventId,
          id: row.id,
          status: "pending",
          userId: row.userId,
        })
        .onConflictDoNothing({
          target: [eventInterest.eventId, eventInterest.userId],
        })
        .returning({ id: eventInterest.id });
      return inserted.length > 0 ? "inserted" : "conflict";
    },
  };
}

/**
 * File a website sign-up's interest request once its email is verified, and
 * log the outcome (including why nothing was filed). Never throws: a failure
 * must not fail verification.
 */
export async function fileVerifiedSignUpInterest(
  user: { id: string; name: string },
  interest: { eventId: string; occDate?: string }
): Promise<void> {
  const log = createRequestLogger();
  log.set({
    action: "registerInterestRequest",
    eventId: interest.eventId,
    occDate: interest.occDate,
    userId: user.id,
  });
  try {
    const outcome = await requestInterestOnRegister(
      createDbRegisterInterestDeps(),
      {
        eventId: interest.eventId,
        now: Date.now(),
        occDate: interest.occDate,
        userId: user.id,
        userName: user.name,
      }
    );
    log.set({ outcome });
  } catch (error) {
    log.error(error instanceof Error ? error : String(error));
  } finally {
    log.emit();
  }
}
