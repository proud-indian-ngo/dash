import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  eventFeedback,
  eventFeedbackSubmission,
} from "@pi-dash/db/schema/event-feedback";
import { eventInterest } from "@pi-dash/db/schema/event-interest";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { eq, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

const ids = {
  series: "019f0000-0061-7000-8000-000000006005",
  privateChild: "019f0000-0061-7000-8000-000000006006",
  ownInterest: "019f0000-0061-7000-8000-000000006007",
  otherInterest: "019f0000-0061-7000-8000-000000006008",
  leadership: "019f0000-0061-7000-8000-000000006009",
  team: "019f0000-0061-7000-8000-000000006000",
  event: "019f0000-0061-7000-8000-000000006001",
  race: "019f0000-0061-7000-8000-000000006002",
  victimFeedback: "019f0000-0061-7000-8000-000000006003",
  raceFeedback: "019f0000-0061-7000-8000-000000006004",
};
const [action, email] = process.argv.slice(2);
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !url.pathname.endsWith("/pi-dash-test")
) {
  throw new Error("Feedback ownership fixture requires the local E2E database");
}
async function cleanup() {
  await db.delete(team).where(eq(team.id, ids.team));
}
async function setup() {
  if (!email) throw new Error("Volunteer email required");
  const volunteer = await db.query.user.findFirst({
    where: eq(user.email, email),
  });
  const admin = await db.query.user.findFirst({
    where: eq(user.email, process.env.SUPER_ADMIN_EMAIL ?? ""),
  });
  if (!(volunteer && admin)) throw new Error("Seeded users required");
  await cleanup();
  const now = new Date();
  await db.insert(team).values({
    id: ids.team,
    name: "Feedback ownership fixture",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(teamEvent).values(
    [ids.event, ids.race].map((id) => ({
      id,
      teamId: ids.team,
      name: "Feedback ownership fixture",
      createdBy: admin.id,
      isPublic: true,
      feedbackEnabled: true,
      startTime: new Date(Date.now() - 86_400_000),
      endTime: new Date(Date.now() - 3600_000),
      createdAt: now,
      updatedAt: now,
    }))
  );
  await db.insert(teamEventMember).values(
    [ids.event, ids.race].flatMap((eventId) =>
      [volunteer.id, admin.id].map((userId) => ({
        id: uuidv7(),
        eventId,
        userId,
        addedAt: now,
      }))
    )
  );
  await db.insert(eventFeedback).values({
    id: ids.victimFeedback,
    eventId: ids.event,
    content: "Victim feedback",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(eventFeedbackSubmission).values({
    id: uuidv7(),
    feedbackId: ids.victimFeedback,
    eventId: ids.event,
    userId: admin.id,
    submittedAt: now,
  });
  const start = Date.now() + 86_400_000;
  const series = {
    id: ids.series,
    teamId: ids.team,
    name: "Nested authorization series",
    createdBy: admin.id,
    isPublic: true,
    startTime: new Date(start),
    endTime: new Date(start + 3600_000),
    createdAt: now,
    updatedAt: now,
    recurrenceRule: { rrule: "FREQ=DAILY;COUNT=3" },
  };
  await db.insert(teamEvent).values(series);
  await db.insert(teamEvent).values({
    ...series,
    id: ids.privateChild,
    name: "Private nested session",
    isPublic: false,
    recurrenceRule: null,
    seriesId: ids.series,
    originalDate: new Date(start + 86_400_000).toISOString().slice(0, 10),
    startTime: new Date(start + 86_400_000),
    endTime: new Date(start + 86_400_000 + 3600_000),
  });
  await db.insert(eventInterest).values(
    [
      { id: ids.ownInterest, userId: volunteer.id, message: "Own request" },
      {
        id: ids.otherInterest,
        userId: admin.id,
        message: "Other private request",
      },
    ].map((row) => ({ ...row, eventId: ids.series, createdAt: now }))
  );
  return ids;
}
async function state() {
  const feedback = await db
    .select({ id: eventFeedback.id, content: eventFeedback.content })
    .from(eventFeedback)
    .where(inArray(eventFeedback.eventId, [ids.event, ids.race]));
  const submissions = await db
    .select({ feedbackId: eventFeedbackSubmission.feedbackId })
    .from(eventFeedbackSubmission)
    .where(inArray(eventFeedbackSubmission.eventId, [ids.event, ids.race]));
  return { feedback, submissions };
}
let result: unknown;
if (action === "setup") result = await setup();
else if (action === "state") result = await state();
else if (action === "cleanup") result = await cleanup();
else if (action === "grant-lead") {
  if (!email) throw new Error("Volunteer email required");
  const volunteer = await db.query.user.findFirst({
    where: eq(user.email, email),
  });
  if (!volunteer) throw new Error("Volunteer not found");
  await db.insert(teamMember).values({
    id: ids.leadership,
    teamId: ids.team,
    userId: volunteer.id,
    role: "lead",
    joinedAt: new Date(),
  });
} else if (action === "revoke-lead") {
  await db.delete(teamMember).where(eq(teamMember.id, ids.leadership));
} else throw new Error("Unknown fixture action");
process.stdout.write(`${JSON.stringify(result ?? {})}\n`);
process.exit(0);
