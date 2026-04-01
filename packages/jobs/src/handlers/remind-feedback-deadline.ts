import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { RemindFeedbackDeadlinePayload } from "../enqueue";

async function loadDeps() {
  const [
    { db },
    { teamEvent, teamEventMember },
    { eventFeedbackSubmission },
    { eq, and, between },
  ] = await Promise.all([
    import("@pi-dash/db"),
    import("@pi-dash/db/schema/team-event"),
    import("@pi-dash/db/schema/event-feedback"),
    import("drizzle-orm"),
  ]);
  return {
    db,
    teamEvent,
    teamEventMember,
    eventFeedbackSubmission,
    eq,
    and,
    between,
  };
}

export async function handleRemindFeedbackDeadline(
  _jobs: Job<RemindFeedbackDeadlinePayload>[]
): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "remind-feedback-deadline",
  });

  const {
    db,
    teamEvent,
    teamEventMember,
    eventFeedbackSubmission,
    eq,
    and,
    between,
  } = await loadDeps();
  const { notifyFeedbackDeadline } = await import("@pi-dash/notifications");

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find events with feedback enabled and deadline between now and 24h from now
  const events = await db
    .select({
      id: teamEvent.id,
      name: teamEvent.name,
      feedbackDeadline: teamEvent.feedbackDeadline,
    })
    .from(teamEvent)
    .where(
      and(
        eq(teamEvent.feedbackEnabled, true),
        between(teamEvent.feedbackDeadline, now, tomorrow)
      )
    );

  log.set({ eventsWithDeadline: events.length });

  if (events.length === 0) {
    log.set({ event: "no_events" });
    log.emit();
    return;
  }

  let notifiedCount = 0;

  for (const event of events) {
    // Get all event members
    const members = await db
      .select({ userId: teamEventMember.userId })
      .from(teamEventMember)
      .where(eq(teamEventMember.eventId, event.id));

    if (members.length === 0) {
      continue;
    }

    // Get members who already submitted feedback
    const submittedUserIds = await db
      .select({ userId: eventFeedbackSubmission.userId })
      .from(eventFeedbackSubmission)
      .where(eq(eventFeedbackSubmission.eventId, event.id));

    const submittedSet = new Set(submittedUserIds.map((r) => r.userId));
    const pendingMembers = members.filter((m) => !submittedSet.has(m.userId));

    if (pendingMembers.length === 0) {
      continue;
    }

    const results = await Promise.allSettled(
      pendingMembers.map((m) =>
        notifyFeedbackDeadline({
          userId: m.userId,
          eventName: event.name,
          eventId: event.id,
        })
      )
    );
    notifiedCount += results.filter((r) => r.status === "fulfilled").length;
  }

  log.set({ event: "job_complete", notifiedCount });
  log.emit();
}
