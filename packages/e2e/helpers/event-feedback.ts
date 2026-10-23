import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  eventFeedback,
  eventFeedbackSubmission,
} from "@pi-dash/db/schema/event-feedback";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { eq, inArray } from "drizzle-orm";

/**
 * Events with anonymous feedback on, in a team of their own, for the
 * volunteer feedback flow. The volunteer is a team member and an event member
 * of every event except `notMember`. `open` ended yesterday; `closed` also
 * ended but its deadline passed an hour ago, and holds the volunteer's
 * response from before then; `upcoming` starts tomorrow. Setup starts from a
 * clean slate, so a retry submits afresh.
 */
const ID = {
  closed: "019f0000-0060-7000-8000-000000006002",
  closedFeedback: "019f0000-0060-7000-8000-000000006030",
  notMember: "019f0000-0060-7000-8000-000000006004",
  open: "019f0000-0060-7000-8000-000000006001",
  team: "019f0000-0060-7000-8000-000000006000",
  upcoming: "019f0000-0060-7000-8000-000000006003",
} as const;

const HOUR = 60 * 60 * 1000;
const CLOSED_FEEDBACK = JSON.stringify([
  { children: [{ text: "E2E feedback before the deadline" }], type: "p" },
]);
const DAY = 24 * HOUR;

async function cleanup() {
  // Events, their members and feedback cascade with the team.
  await db.delete(team).where(eq(team.id, ID.team));
}

async function setup(volunteerEmail: string) {
  await cleanup();
  const volunteer = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, volunteerEmail),
  });
  if (!volunteer) {
    throw new Error("Feedback fixture needs the seeded volunteer");
  }
  const now = Date.now();
  await db.insert(team).values({
    createdAt: new Date(now),
    id: ID.team,
    name: "Feedback E2E team",
    updatedAt: new Date(now),
  });
  await db.insert(teamMember).values({
    id: "019f0000-0060-7000-8000-000000006010",
    joinedAt: new Date(now),
    role: "member",
    teamId: ID.team,
    userId: volunteer.id,
  });
  const event = (
    id: string,
    name: string,
    start: number,
    feedbackDeadline: number | null = null
  ) => ({
    createdAt: new Date(now - 3 * DAY),
    createdBy: volunteer.id,
    endTime: new Date(start + 2 * HOUR),
    feedbackDeadline: feedbackDeadline ? new Date(feedbackDeadline) : null,
    feedbackEnabled: true,
    id,
    isPublic: true,
    name,
    startTime: new Date(start),
    teamId: ID.team,
    updatedAt: new Date(now - 3 * DAY),
  });
  await db
    .insert(teamEvent)
    .values([
      event(ID.open, "Feedback E2E open session", now - DAY),
      event(ID.closed, "Feedback E2E closed session", now - DAY, now - HOUR),
      event(ID.upcoming, "Feedback E2E upcoming session", now + DAY),
      event(ID.notMember, "Feedback E2E other session", now - DAY),
    ]);
  await db.insert(teamEventMember).values(
    [ID.open, ID.closed, ID.upcoming].map((eventId, index) => ({
      addedAt: new Date(now - 3 * DAY),
      eventId,
      id: `019f0000-0060-7000-8000-00000000602${index}`,
      userId: volunteer.id,
    }))
  );
  await db.insert(eventFeedback).values({
    content: CLOSED_FEEDBACK,
    createdAt: new Date(now - 2 * HOUR),
    eventId: ID.closed,
    id: ID.closedFeedback,
    updatedAt: new Date(now - 2 * HOUR),
  });
  await db.insert(eventFeedbackSubmission).values({
    eventId: ID.closed,
    feedbackId: ID.closedFeedback,
    id: "019f0000-0060-7000-8000-000000006031",
    submittedAt: new Date(now - 2 * HOUR),
    userId: volunteer.id,
  });
  return {
    closedEventId: ID.closed,
    closedFeedbackId: ID.closedFeedback,
    notMemberEventId: ID.notMember,
    openEventId: ID.open,
    upcomingEventId: ID.upcoming,
  };
}

/**
 * What refused mutations would have changed: the closed and upcoming events
 * that hold a submission, and the text of the closed event's response.
 */
async function state() {
  const submissions = await db
    .select({ eventId: eventFeedbackSubmission.eventId })
    .from(eventFeedbackSubmission)
    .where(inArray(eventFeedbackSubmission.eventId, [ID.closed, ID.upcoming]));
  const closed = await db.query.eventFeedback.findFirst({
    columns: { content: true },
    where: eq(eventFeedback.id, ID.closedFeedback),
  });
  return {
    closedFeedbackUnchanged: closed?.content === CLOSED_FEEDBACK,
    submissionEvents: submissions.map((row) => row.eventId),
  };
}

const [action, argument] = process.argv.slice(2);
let result: unknown;
if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "state") {
  result = await state();
} else if (action === "setup" && argument) {
  result = await setup(argument);
} else {
  throw new Error(`Unsupported feedback fixture action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
