import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { eventInterest } from "@pi-dash/db/schema/event-interest";
import { eventPhoto } from "@pi-dash/db/schema/event-photo";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { COST_CENTRE_IDS } from "@pi-dash/shared/constants";
import { addDays, addHours, subDays } from "date-fns";
import { and, eq, isNull } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { log, ZERO_AUTH_LEAD_TEAM_ID } from "./core";

const SEED_INTEREST_EVENT_NAME = "E2E Upcoming Event With Pending Interests";
/** Upcoming, in the team the volunteer leads, so they review its interest. */
const SEED_LEAD_INTEREST_EVENT_ID = "e2e00000-0000-0000-0000-000000000203";
const SEED_PHOTO_EVENT_NAME = "E2E Past Event With Pending Photos";
const SEED_PENDING_PHOTO_COUNT = 3;
const SEED_OPEN_INTEREST_TEAM_NAME = "E2E Interest Team";
const SEED_OPEN_INTEREST_EVENT_NAME = "E2E Open Interest Event";
const SEED_RSVP_TEAM_NAME = "E2E RSVP Team";
const SEED_SANDBOX_TEAM_NAME = "E2E Sandbox Team";
const SEED_SANDBOX_SOURCE_EVENT_NAME = "E2E Sandbox Source Event";
const SEED_RSVP_WHATSAPP_JID = "e2e-rsvp-group@g.us";

/**
 * Events owned by the approval specs: two pending interest requests (one to
 * approve, one to reject) and three pending photos (one approved alone, the
 * rest with Approve all). Separate from the Zero authorization fixtures, which
 * must stay pending.
 */
export async function ensureApprovalFixtures({
  adminUserId,
  financeAdminUserId,
  teamId,
  unorientedUserId,
  volunteerUserId,
}: {
  adminUserId: string;
  financeAdminUserId: string;
  teamId: string;
  unorientedUserId: string;
  volunteerUserId: string;
}): Promise<void> {
  const existing = await db.query.teamEvent.findFirst({
    where: (table, ops) => ops.eq(table.name, SEED_INTEREST_EVENT_NAME),
  });
  if (existing) {
    log("Approval fixtures already exist — skipping");
    return;
  }
  const now = new Date();

  const interestEventId = uuidv7();
  await db.insert(teamEvent).values({
    createdAt: subDays(now, 1),
    createdBy: adminUserId,
    description: "Upcoming event with pending interest requests for E2E tests",
    id: interestEventId,
    isPublic: true,
    name: SEED_INTEREST_EVENT_NAME,
    startTime: addDays(now, 10),
    teamId,
    updatedAt: subDays(now, 1),
  });
  // The unoriented volunteer's request is only ever looked at, never decided.
  await db.insert(eventInterest).values(
    [volunteerUserId, financeAdminUserId, unorientedUserId].map((userId) => ({
      createdAt: subDays(now, 1),
      eventId: interestEventId,
      id: uuidv7(),
      message: "E2E interest request",
      status: "pending" as const,
      userId,
    }))
  );

  await db.insert(teamEvent).values({
    createdAt: subDays(now, 1),
    createdBy: adminUserId,
    description: "Upcoming event whose interest the volunteer reviews as lead",
    id: SEED_LEAD_INTEREST_EVENT_ID,
    isPublic: true,
    name: "E2E Lead Interest Event",
    startTime: addDays(now, 10),
    teamId: ZERO_AUTH_LEAD_TEAM_ID,
    updatedAt: subDays(now, 1),
  });
  await db.insert(eventInterest).values({
    createdAt: subDays(now, 1),
    eventId: SEED_LEAD_INTEREST_EVENT_ID,
    id: uuidv7(),
    message: "E2E interest request",
    status: "pending",
    userId: unorientedUserId,
  });
  // A member, so the lead reaches them from the row menu.
  await db.insert(teamEventMember).values({
    addedAt: subDays(now, 1),
    eventId: SEED_LEAD_INTEREST_EVENT_ID,
    id: uuidv7(),
    userId: financeAdminUserId,
  });
  // Phones, so the lead gets call and WhatsApp links as well as email.
  for (const [userId, phone] of [
    [unorientedUserId, "+919800000301"],
    [financeAdminUserId, "+919800000302"],
  ] as const) {
    await db
      .update(user)
      .set({ phone })
      .where(and(eq(user.id, userId), isNull(user.phone)));
  }

  const photoEventId = uuidv7();
  await db.insert(teamEvent).values({
    createdAt: subDays(now, 4),
    createdBy: adminUserId,
    description: "Past event with pending photos for E2E tests",
    id: photoEventId,
    isPublic: true,
    name: SEED_PHOTO_EVENT_NAME,
    startTime: subDays(now, 2),
    teamId,
    updatedAt: subDays(now, 4),
  });
  await db.insert(teamEventMember).values({
    addedAt: subDays(now, 4),
    eventId: photoEventId,
    id: uuidv7(),
    userId: volunteerUserId,
  });
  await db.insert(eventPhoto).values(
    Array.from({ length: SEED_PENDING_PHOTO_COUNT }, (_, index) => ({
      caption: `E2E pending photo ${index + 1}`,
      createdAt: subDays(now, 1),
      eventId: photoEventId,
      id: uuidv7(),
      mimeType: "image/jpeg",
      r2Key: `e2e/pending-photo-${index + 1}.jpg`,
      status: "pending" as const,
      uploadedBy: volunteerUserId,
    }))
  );

  // A public event in a team the volunteer is not in, so they can show
  // interest in it from the event page.
  const openTeamId = uuidv7();
  await db.insert(team).values({
    createdAt: subDays(now, 1),
    description: "Team the volunteer is not in, for E2E interest tests",
    id: openTeamId,
    name: SEED_OPEN_INTEREST_TEAM_NAME,
    updatedAt: subDays(now, 1),
  });
  await db.insert(teamMember).values({
    id: uuidv7(),
    joinedAt: subDays(now, 1),
    role: "lead",
    teamId: openTeamId,
    userId: adminUserId,
  });
  await db.insert(teamEvent).values({
    createdAt: subDays(now, 1),
    createdBy: adminUserId,
    description: "Public event open for volunteer interest in E2E tests",
    id: uuidv7(),
    isPublic: true,
    name: SEED_OPEN_INTEREST_EVENT_NAME,
    startTime: addDays(now, 12),
    teamId: openTeamId,
    updatedAt: subDays(now, 1),
  });

  // A team with its own WhatsApp group, so its events can post RSVP polls
  // without taking a group from the shared pool.
  const rsvpGroupId = uuidv7();
  await db.insert(whatsappGroup).values({
    createdAt: now,
    id: rsvpGroupId,
    jid: SEED_RSVP_WHATSAPP_JID,
    name: "E2E RSVP Group",
    updatedAt: now,
  });
  const rsvpTeamId = uuidv7();
  await db.insert(team).values({
    createdAt: subDays(now, 1),
    description: "Team with a WhatsApp group for E2E RSVP poll tests",
    id: rsvpTeamId,
    name: SEED_RSVP_TEAM_NAME,
    updatedAt: subDays(now, 1),
    whatsappGroupId: rsvpGroupId,
  });
  await db.insert(teamMember).values({
    id: uuidv7(),
    joinedAt: subDays(now, 1),
    role: "lead",
    teamId: rsvpTeamId,
    userId: adminUserId,
  });

  // A team for specs that create, edit, cancel or duplicate events, so the
  // seeded team's list stays stable for the filter and read-only specs.
  const sandboxTeamId = uuidv7();
  await db.insert(team).values({
    createdAt: subDays(now, 1),
    description: "Team for E2E specs that change events",
    id: sandboxTeamId,
    name: SEED_SANDBOX_TEAM_NAME,
    updatedAt: subDays(now, 1),
  });
  await db.insert(teamMember).values({
    id: uuidv7(),
    joinedAt: subDays(now, 1),
    role: "lead",
    teamId: sandboxTeamId,
    userId: adminUserId,
  });
  await db.insert(teamEvent).values({
    createdAt: subDays(now, 1),
    createdBy: adminUserId,
    description: "Event the duplication specs copy",
    id: uuidv7(),
    isPublic: true,
    location: "Sandbox Hall, Bangalore",
    name: SEED_SANDBOX_SOURCE_EVENT_NAME,
    startTime: addDays(now, 6),
    teamId: sandboxTeamId,
    updatedAt: subDays(now, 1),
  });

  log("Created event fixtures: pending interests, photos and open events");
}

interface FilterTestEvent {
  cancelled?: boolean;
  city: "bangalore" | "mumbai";
  isPublic: boolean;
  location: string;
  name: string;
  recurrenceRule?: { rrule: string };
  start: (now: Date) => Date;
}

const FILTER_TEST_EVENTS: FilterTestEvent[] = [
  {
    city: "bangalore",
    isPublic: true,
    location: "MG Road, Bangalore",
    name: "E2E Upcoming Public Bangalore",
    start: (now: Date) => addDays(now, 3),
  },
  {
    city: "mumbai",
    isPublic: false,
    location: "Andheri West, Mumbai",
    name: "E2E Upcoming Private Mumbai",
    start: (now: Date) => addDays(now, 5),
  },
  {
    city: "bangalore",
    isPublic: true,
    location: "Indiranagar, Bangalore",
    name: "E2E Upcoming Recurring Public",
    recurrenceRule: { rrule: "FREQ=WEEKLY" },
    start: (now: Date) => subDays(now, 14),
  },
  {
    city: "mumbai",
    isPublic: true,
    location: "Dadar, Mumbai",
    name: "E2E Past Public Mumbai",
    start: (now: Date) => subDays(now, 10),
  },
  {
    city: "bangalore",
    isPublic: false,
    location: "Koramangala, Bangalore",
    name: "E2E Past Private Bangalore",
    start: (now: Date) => subDays(now, 5),
  },
  {
    cancelled: true,
    city: "bangalore",
    isPublic: true,
    location: "Cubbon Park, Bangalore",
    name: "E2E Cancelled Future Event",
    start: (now: Date) => addDays(now, 7),
  },
  {
    cancelled: true,
    city: "mumbai",
    isPublic: false,
    location: "Bandra, Mumbai",
    name: "E2E Past Cancelled Event",
    start: (now: Date) => subDays(now, 3),
  },
];

export async function ensureFilterTestEvents(
  teamId: string,
  adminUserId: string,
  volunteerUserId: string
): Promise<void> {
  const first = await db.query.teamEvent.findFirst({
    where: (table, ops) => ops.eq(table.name, "E2E Upcoming Public Bangalore"),
  });
  if (first) {
    log("Filter test events already exist — skipping");
    return;
  }

  const now = new Date();

  await Promise.all(
    FILTER_TEST_EVENTS.map(async (e) => {
      const startTime = e.start(now);
      const id = uuidv7();
      await db.insert(teamEvent).values({
        cancelledAt: e.cancelled ? now : undefined,
        costCentreId: COST_CENTRE_IDS[e.city],
        createdAt: subDays(now, 7),
        createdBy: adminUserId,
        description: `${e.name} — E2E filter test event`,
        endTime: addHours(startTime, 2),
        id,
        isPublic: e.isPublic,
        location: e.location,
        name: e.name,
        recurrenceRule: e.recurrenceRule,
        startTime,
        teamId,
        updatedAt: subDays(now, 7),
      });

      await db.insert(teamEventMember).values([
        { addedAt: now, eventId: id, id: uuidv7(), userId: adminUserId },
        { addedAt: now, eventId: id, id: uuidv7(), userId: volunteerUserId },
      ]);
    })
  );

  log(`Created ${FILTER_TEST_EVENTS.length} filter test events`);
}
