import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { eventInterest } from "@pi-dash/db/schema/event-interest";
import { notification } from "@pi-dash/db/schema/notification";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/**
 * Database steps for the event jobs spec, which queues real jobs through
 * the admin jobs API and reads back what they wrote.
 */

const HOUR = 60 * 60 * 1000;
const ID = {
  approvedInterest: "019f0000-0070-7000-8000-000000007012",
  lead: "019f0000-0070-7000-8000-000000007003",
  pendingInterest: "019f0000-0070-7000-8000-000000007011",
  started: "019f0000-0070-7000-8000-000000007001",
  team: "019f0000-0070-7000-8000-000000007000",
  upcoming: "019f0000-0070-7000-8000-000000007002",
  upcomingInterest: "019f0000-0070-7000-8000-000000007013",
} as const;

async function userId(email: string) {
  const found = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, email),
  });
  if (!found) {
    throw new Error(`No user ${email}`);
  }
  return found.id;
}

/** The inbox notifications a user has for the given events, oldest first. */
async function photoNotifications(uploaderId: string, eventIds: string[]) {
  return await db
    .select({
      body: notification.body,
      clickAction: notification.clickAction,
      title: notification.title,
    })
    .from(notification)
    .where(
      and(
        eq(notification.userId, uploaderId),
        inArray(
          notification.clickAction,
          eventIds.map((id) => `/events/${id}`)
        )
      )
    )
    .orderBy(asc(notification.createdAt), asc(notification.id));
}

/** How many photo-approved jobs for these photos have finished. */
async function photoJobsDone(photoIds: string[]) {
  const rows = await db.execute<{ total: number }>(
    sql`select count(*)::int as total from pgboss.job
        where name = 'notify-photo-approved'
          and state = 'completed'
          and data->>'photoId' in ${photoIds}`
  );
  return { total: rows[0]?.total ?? 0 };
}

async function interestCleanup() {
  // Events and their interest cascade with the team.
  await db.delete(team).where(eq(team.id, ID.team));
}

/**
 * An event that started an hour ago with one pending and one approved
 * interest, and one starting tomorrow with a pending interest.
 */
async function interestSetup(adminEmail: string, volunteerEmail: string) {
  await interestCleanup();
  const adminId = await userId(adminEmail);
  const volunteerId = await userId(volunteerEmail);
  const now = Date.now();
  await db.insert(team).values({
    createdAt: new Date(now),
    id: ID.team,
    name: "Interest expiry E2E team",
    updatedAt: new Date(now),
  });
  await db.insert(teamMember).values({
    id: ID.lead,
    joinedAt: new Date(now),
    role: "lead",
    teamId: ID.team,
    userId: adminId,
  });
  const event = (id: string, name: string, start: number) => ({
    createdAt: new Date(now - 48 * HOUR),
    createdBy: adminId,
    id,
    isPublic: true,
    name,
    startTime: new Date(start),
    teamId: ID.team,
    updatedAt: new Date(now - 48 * HOUR),
  });
  await db
    .insert(teamEvent)
    .values([
      event(ID.started, "Interest expiry E2E started", now - HOUR),
      event(ID.upcoming, "Interest expiry E2E upcoming", now + 24 * HOUR),
    ]);
  const interest = (
    id: string,
    eventId: string,
    interestUserId: string,
    status: "approved" | "pending"
  ) => ({
    createdAt: new Date(now - 24 * HOUR),
    eventId,
    id,
    reviewedAt: status === "approved" ? new Date(now - 2 * HOUR) : null,
    reviewedBy: status === "approved" ? adminId : null,
    status,
    userId: interestUserId,
  });
  await db
    .insert(eventInterest)
    .values([
      interest(ID.pendingInterest, ID.started, volunteerId, "pending"),
      interest(ID.approvedInterest, ID.started, adminId, "approved"),
      interest(ID.upcomingInterest, ID.upcoming, volunteerId, "pending"),
    ]);
  return { createdAt: now };
}

async function interestInspect() {
  const rows = await db
    .select({
      id: eventInterest.id,
      reviewedAt: eventInterest.reviewedAt,
      reviewedBy: eventInterest.reviewedBy,
      status: eventInterest.status,
    })
    .from(eventInterest)
    .where(
      inArray(eventInterest.id, [
        ID.pendingInterest,
        ID.approvedInterest,
        ID.upcomingInterest,
      ])
    );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const read = (id: string) => {
    const row = byId.get(id);
    if (!row) {
      throw new Error(`Interest ${id} is missing`);
    }
    return {
      reviewed: row.reviewedAt !== null,
      reviewedBy: row.reviewedBy,
      status: row.status,
    };
  };
  return {
    approvedOnStarted: read(ID.approvedInterest),
    pendingOnStarted: read(ID.pendingInterest),
    pendingOnUpcoming: read(ID.upcomingInterest),
  };
}

const FIRST = {
  laterEvent: "019f0000-0071-7000-8000-000000007104",
  lead: "019f0000-0071-7000-8000-000000007101",
  oneOff: "019f0000-0071-7000-8000-000000007102",
  pendingEvent: "019f0000-0071-7000-8000-000000007105",
  series: "019f0000-0071-7000-8000-000000007103",
  session: "019f0000-0071-7000-8000-000000007106",
  team: "019f0000-0071-7000-8000-000000007100",
} as const;

async function firstEventCleanup() {
  // Events, members and interest cascade with the team.
  await db.delete(team).where(eq(team.id, FIRST.team));
}

/**
 * Due for the first-event reminder: a one-off event with its own
 * instructions, and a saved series session with none, whose series has some.
 * Not due: an event two days out, and one whose interest is still pending.
 * An oriented volunteer is also approved on the one-off event.
 */
async function firstEventSetup(
  adminEmail: string,
  newEmail: string,
  orientedEmail: string
) {
  await firstEventCleanup();
  const adminId = await userId(adminEmail);
  const newId = await userId(newEmail);
  const orientedId = await userId(orientedEmail);
  const now = Date.now();
  const soon = now + 24 * HOUR - 5 * 60 * 1000;
  await db.insert(team).values({
    createdAt: new Date(now),
    id: FIRST.team,
    name: "First event reminder E2E team",
    updatedAt: new Date(now),
  });
  await db.insert(teamMember).values({
    id: FIRST.lead,
    joinedAt: new Date(now),
    role: "lead",
    teamId: FIRST.team,
    userId: adminId,
  });
  const event = (
    id: string,
    name: string,
    start: number,
    extra: Partial<typeof teamEvent.$inferInsert> = {}
  ) => ({
    createdAt: new Date(now - 72 * HOUR),
    createdBy: adminId,
    id,
    isPublic: true,
    name,
    startTime: new Date(start),
    teamId: FIRST.team,
    updatedAt: new Date(now - 72 * HOUR),
    ...extra,
  });
  await db.insert(teamEvent).values([
    event(FIRST.oneOff, "First event E2E one-off", soon, {
      location: "Cubbon Park",
      newVolunteerInstructions: "Bring a notebook and arrive early.",
    }),
    event(FIRST.series, "First event E2E series", soon - 7 * 24 * HOUR, {
      newVolunteerInstructions: "Wear comfortable clothes.",
      recurrenceRule: { rrule: "FREQ=WEEKLY" },
    }),
    event(FIRST.laterEvent, "First event E2E later", now + 48 * HOUR),
    event(FIRST.pendingEvent, "First event E2E pending", soon),
  ]);
  await db.insert(teamEvent).values(
    event(FIRST.session, "First event E2E series", soon, {
      originalDate: new Date(soon).toISOString().slice(0, 10),
      seriesId: FIRST.series,
    })
  );
  const join = (eventId: string, joinUserId: string, approved = true) => ({
    interest: {
      createdAt: new Date(now - 48 * HOUR),
      eventId,
      id: uuidv7(),
      reviewedAt: approved ? new Date(now - 24 * HOUR) : null,
      reviewedBy: approved ? adminId : null,
      status: approved ? ("approved" as const) : ("pending" as const),
      userId: joinUserId,
    },
    member: approved
      ? [
          {
            addedAt: new Date(now - 24 * HOUR),
            eventId,
            id: uuidv7(),
            userId: joinUserId,
          },
        ]
      : [],
  });
  const joins = [
    join(FIRST.oneOff, newId),
    join(FIRST.session, newId),
    join(FIRST.laterEvent, newId),
    join(FIRST.pendingEvent, newId, false),
    join(FIRST.oneOff, orientedId),
  ];
  await db.insert(eventInterest).values(joins.map((j) => j.interest));
  await db.insert(teamEventMember).values(joins.flatMap((j) => j.member));
  const lead = await db.query.user.findFirst({
    columns: { name: true, phone: true },
    where: eq(user.id, adminId),
  });
  const leadContact = lead?.phone ? `${lead.name} (${lead.phone})` : lead?.name;
  return { leadContact, newId, orientedId };
}

/** First-event reminders in a user's inbox, by event. */
async function firstEventInbox(inboxUserId: string) {
  const eventIds = Object.values(FIRST);
  const rows = await db
    .select({
      body: notification.body,
      clickAction: notification.clickAction,
      title: notification.title,
    })
    .from(notification)
    .where(
      and(
        eq(notification.userId, inboxUserId),
        inArray(
          notification.clickAction,
          eventIds.map((id) => `/events/${id}`)
        )
      )
    )
    .orderBy(asc(notification.clickAction));
  return rows;
}

/** How many runs of a queue have finished. */
async function jobsCompleted(queue: string) {
  const rows = await db.execute<{ total: number }>(
    sql`select count(*)::int as total from pgboss.job
        where name = ${queue} and state = 'completed'`
  );
  return { total: rows[0]?.total ?? 0 };
}

const [action, first = "", second = "", third = ""] = process.argv.slice(2);
let result: unknown;
if (action === "user-id") {
  result = { id: await userId(first) };
} else if (action === "photo-notifications") {
  result = await photoNotifications(first, second.split(","));
} else if (action === "photo-jobs-done") {
  result = await photoJobsDone(first.split(","));
} else if (action === "interest-setup") {
  result = await interestSetup(first, second);
} else if (action === "interest-inspect") {
  result = await interestInspect();
} else if (action === "first-event-setup") {
  result = await firstEventSetup(first, second, third);
} else if (action === "first-event-inbox") {
  result = await firstEventInbox(first);
} else if (action === "first-event-cleanup") {
  await firstEventCleanup();
  result = { cleaned: true };
} else if (action === "jobs-completed") {
  result = await jobsCompleted(first);
} else if (action === "interest-cleanup") {
  await interestCleanup();
  result = { cleaned: true };
} else {
  throw new Error(`Unsupported event jobs action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
