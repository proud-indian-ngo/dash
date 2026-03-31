import type { teamEvent as teamEventTable } from "@pi-dash/db/schema/team-event";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { RecurringEventsPayload } from "../enqueue";

type ParentEvent = typeof teamEventTable.$inferSelect;

const MAX_CATCHUP_ITERATIONS = 52;

async function loadDeps() {
  const [
    { db },
    { teamEvent, teamEventMember },
    { teamMember },
    { getNextOccurrenceDate },
    drizzle,
    { uuidv7 },
  ] = await Promise.all([
    import("@pi-dash/db"),
    import("@pi-dash/db/schema/team-event"),
    import("@pi-dash/db/schema/team"),
    import("../lib/recurrence"),
    import("drizzle-orm"),
    import("uuidv7"),
  ]);
  return {
    db,
    teamEvent,
    teamEventMember,
    teamMember,
    getNextOccurrenceDate,
    and: drizzle.and,
    desc: drizzle.desc,
    eq: drizzle.eq,
    uuidv7,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

async function createNextOccurrence(
  parent: ParentEvent,
  deps: Deps
): Promise<number> {
  const {
    db,
    teamEvent,
    teamEventMember,
    teamMember,
    getNextOccurrenceDate,
    and,
    desc,
    eq,
    uuidv7,
  } = deps;

  const rule = parent.recurrenceRule as {
    frequency: "weekly" | "biweekly" | "monthly";
    endDate?: string;
  } | null;
  if (!rule) {
    return 0;
  }

  const duration =
    parent.endTime && parent.startTime
      ? parent.endTime.getTime() - parent.startTime.getTime()
      : null;

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  let created = 0;

  // Hoist latest occurrence query outside the loop to avoid N+1
  let lastStart: Date =
    (
      await db
        .select({ startTime: teamEvent.startTime })
        .from(teamEvent)
        .where(eq(teamEvent.parentEventId, parent.id))
        .orderBy(desc(teamEvent.startTime))
        .limit(1)
    )[0]?.startTime ?? parent.startTime;

  for (let i = 0; i < MAX_CATCHUP_ITERATIONS; i++) {
    const nextDate = getNextOccurrenceDate(lastStart, rule);
    if (!nextDate) {
      break;
    }

    if (nextDate > tomorrow) {
      break;
    }

    const newEndTime = duration
      ? new Date(nextDate.getTime() + duration)
      : null;

    const newEventId = uuidv7();
    const timestamp = new Date();

    try {
      await db.transaction(async (tx) => {
        await tx.insert(teamEvent).values({
          id: newEventId,
          teamId: parent.teamId,
          name: parent.name,
          description: parent.description,
          location: parent.location,
          startTime: nextDate,
          endTime: newEndTime,
          isPublic: parent.isPublic,
          whatsappGroupId: parent.whatsappGroupId,
          parentEventId: parent.id,
          copyAllMembers: false,
          recurrenceRule: null,
          cancelledAt: null,
          createdBy: parent.createdBy,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        if (parent.copyAllMembers) {
          // Copy all members from the parent event
          const parentMembers = await tx
            .select({ userId: teamEventMember.userId })
            .from(teamEventMember)
            .where(eq(teamEventMember.eventId, parent.id));

          if (parentMembers.length > 0) {
            await tx.insert(teamEventMember).values(
              parentMembers.map((m) => ({
                id: uuidv7(),
                eventId: newEventId,
                userId: m.userId,
                addedAt: timestamp,
              }))
            );
          }
        } else {
          // Default: copy only team leads
          const leads = await tx
            .select({ userId: teamMember.userId })
            .from(teamMember)
            .where(
              and(
                eq(teamMember.teamId, parent.teamId),
                eq(teamMember.role, "lead")
              )
            );

          if (leads.length > 0) {
            await tx.insert(teamEventMember).values(
              leads.map((lead) => ({
                id: uuidv7(),
                eventId: newEventId,
                userId: lead.userId,
                addedAt: timestamp,
              }))
            );
          }
        }
      });
    } catch (e: unknown) {
      if (
        e instanceof Error &&
        "code" in e &&
        (e as { code: string }).code === "23505"
      ) {
        break;
      }
      throw e;
    }

    lastStart = nextDate;
    created++;
  }

  return created;
}

export async function handleCreateRecurringEvents(
  jobs: Job<RecurringEventsPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "create-recurring-events",
    });

    log.set({
      event: "job_start",
      jobId: job.id,
      triggeredAt: job.data.triggeredAt,
    });

    const deps = await loadDeps();
    const { db, teamEvent } = deps;
    const { isNotNull, isNull } = await import("drizzle-orm");

    const parentEvents = await db
      .select()
      .from(teamEvent)
      .where(
        deps.and(
          isNull(teamEvent.parentEventId),
          isNotNull(teamEvent.recurrenceRule),
          isNull(teamEvent.cancelledAt)
        )
      );

    let createdCount = 0;

    for (const parent of parentEvents) {
      createdCount += await createNextOccurrence(parent, deps);
    }

    log.set({ event: "job_complete", eventsCreated: createdCount });
    log.emit();
  }
}
