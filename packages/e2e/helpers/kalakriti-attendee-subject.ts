import { writeSync } from "node:fs";

import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAssignment,
  kalakritiAttendee,
  kalakritiCompetition,
  kalakritiEditionMembership,
  kalakritiJudgeAssignment,
  kalakritiOperation,
} from "@pi-dash/db/schema/kalakriti";
import { and, eq, inArray, or } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { KALAKRITI_ACTORS } from "../fixtures/kalakriti-actors";

const action = process.argv[2];
const editionId = process.argv[3] ?? "";
if (!editionId) throw new Error("Edition ID is required");

async function prepare() {
  for (const [actor, responsibility] of [
    [KALAKRITI_ACTORS.volunteerCoordinator, "volunteer_coordinator"],
    [KALAKRITI_ACTORS.overallEventsLead, "overall_events_lead"],
  ] as const) {
    const account = await db.query.user.findFirst({
      where: eq(user.email, actor.email),
    });
    if (!account) throw new Error("Attendee fixture actor is missing");
    const membership = await db.query.kalakritiEditionMembership.findFirst({
      where: and(
        eq(kalakritiEditionMembership.editionId, editionId),
        eq(kalakritiEditionMembership.userId, account.id)
      ),
    });
    if (!membership) throw new Error("Attendee fixture membership is missing");
    await db
      .delete(kalakritiAssignment)
      .where(
        and(
          eq(kalakritiAssignment.editionId, editionId),
          eq(kalakritiAssignment.membershipId, membership.id)
        )
      );
    const now = new Date();
    await db.insert(kalakritiAssignment).values({
      id: uuidv7(),
      editionId: editionId,
      membershipId: membership.id,
      responsibility,
      createdAt: now,
      updatedAt: now,
      createdBy: account.id,
    });
  }
  return db
    .select({ id: kalakritiCompetition.id, name: kalakritiCompetition.name })
    .from(kalakritiCompetition)
    .where(
      and(
        eq(kalakritiCompetition.editionId, editionId),
        inArray(kalakritiCompetition.name, ["Station Singing", "Station Dance"])
      )
    );
}

async function state() {
  const attendees = await db
    .select()
    .from(kalakritiAttendee)
    .where(eq(kalakritiAttendee.editionId, editionId));
  const assignments = await db
    .select()
    .from(kalakritiJudgeAssignment)
    .where(eq(kalakritiJudgeAssignment.editionId, editionId));
  const operations = await db
    .select()
    .from(kalakritiOperation)
    .where(eq(kalakritiOperation.editionId, editionId));
  const accounts = await db
    .select({ id: user.id })
    .from(user)
    .where(
      or(
        inArray(user.email, [
          "guest-attendee@pi-dash.test",
          "judge-attendee@pi-dash.test",
        ]),
        inArray(user.name, ["E2E Invited Guest", "E2E Invited Judge"])
      )
    );
  return { attendees, assignments, operations, accounts };
}

async function cleanup() {
  await db
    .delete(kalakritiOperation)
    .where(eq(kalakritiOperation.editionId, editionId));
  await db
    .delete(kalakritiJudgeAssignment)
    .where(eq(kalakritiJudgeAssignment.editionId, editionId));
  await db
    .delete(kalakritiAttendee)
    .where(eq(kalakritiAttendee.editionId, editionId));
  return { cleaned: true };
}

try {
  const result =
    action === "prepare"
      ? await prepare()
      : action === "state"
        ? await state()
        : action === "cleanup"
          ? await cleanup()
          : (() => {
              throw new Error("Unknown attendee fixture action");
            })();
  writeSync(1, `${JSON.stringify(result)}\n`);
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
