import { createHash, randomBytes } from "node:crypto";

import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { eventPhoto } from "@pi-dash/db/schema/event-photo";
import { socialApiToken } from "@pi-dash/db/schema/social-api-token";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";

/**
 * A past public session whose team lead is the seeded volunteer, with that
 * volunteer marked present and three approved Immich assets (two images, one
 * video), plus a social API token for reading the result back.
 */
const ID = {
  event: "019f0000-0030-7000-8000-000000003001",
  lead: "019f0000-0030-7000-8000-000000003002",
  member: "019f0000-0030-7000-8000-000000003003",
  photo: "019f0000-0030-7000-8000-000000003004",
  photoUsable: "019f0000-0030-7000-8000-000000003006",
  video: "019f0000-0030-7000-8000-000000003007",
  team: "019f0000-0030-7000-8000-000000003000",
  token: "019f0000-0030-7000-8000-000000003005",
} as const;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const indiaDate = (ms: number) =>
  new Date(ms + 5.5 * HOUR).toISOString().slice(0, 10);

async function cleanup() {
  await db.delete(socialApiToken).where(eq(socialApiToken.id, ID.token));
  // The event, its members and photos cascade with the team.
  await db.delete(team).where(eq(team.id, ID.team));
}

async function setup(leadEmail: string) {
  await cleanup();
  const lead = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, leadEmail),
  });
  if (!lead) {
    throw new Error("Social recap fixture requires the lead user");
  }
  const now = new Date();
  // 10:00 IST yesterday, two hours long.
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 1,
    4,
    30
  );
  await db.insert(team).values({
    createdAt: now,
    id: ID.team,
    name: "Social recap E2E team",
    updatedAt: now,
  });
  await db.insert(teamMember).values({
    id: ID.lead,
    joinedAt: now,
    role: "lead",
    teamId: ID.team,
    userId: lead.id,
  });
  await db.insert(teamEvent).values({
    createdAt: now,
    createdBy: lead.id,
    endTime: new Date(start + 2 * HOUR),
    id: ID.event,
    isPublic: true,
    name: "Social recap E2E session",
    publicArea: "Iblur",
    startTime: new Date(start),
    teamId: ID.team,
    updatedAt: now,
    volunteersNeeded: 6,
  });
  await db.insert(teamEventMember).values({
    addedAt: now,
    attendance: "present",
    attendanceMarkedAt: now,
    attendanceMarkedBy: lead.id,
    eventId: ID.event,
    id: ID.member,
    userId: lead.id,
  });
  // Sizes are set so the social API never asks Immich about these assets.
  const asset = (
    id: string,
    caption: string,
    mimeType: string,
    createdAt: Date
  ) => ({
    caption,
    createdAt,
    eventId: ID.event,
    height: 600,
    id,
    immichAssetId: `e2e-social-recap-${id}`,
    mimeType,
    reviewedAt: now,
    reviewedBy: lead.id,
    status: "approved" as const,
    uploadedBy: lead.id,
    width: 800,
  });
  await db
    .insert(eventPhoto)
    .values([
      asset(ID.photo, "Paper boats", "image/jpeg", new Date(start + HOUR)),
      asset(
        ID.photoUsable,
        "Kite flying",
        "image/png",
        new Date(start + 2 * HOUR)
      ),
      asset(ID.video, "Race clip", "video/mp4", new Date(start)),
    ]);
  const token = randomBytes(32).toString("base64url");
  await db.insert(socialApiToken).values({
    createdAt: now,
    id: ID.token,
    name: "social recap e2e",
    scopes: ["events:read", "photos:read"],
    tokenHash: createHash("sha256").update(token).digest("hex"),
  });
  return {
    eventId: ID.event,
    from: indiaDate(start - DAY),
    photoId: ID.photo,
    usablePhotoId: ID.photoUsable,
    to: indiaDate(start + DAY),
    token,
  };
}

async function inspect() {
  const photo = await db.query.eventPhoto.findFirst({
    columns: { doNotUse: true },
    where: eq(eventPhoto.id, ID.photo),
  });
  return { photoDoNotUse: photo?.doNotUse ?? null };
}

const [action, argument] = process.argv.slice(2);
let result: unknown;
if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "setup" && argument) {
  result = await setup(argument);
} else if (action === "inspect") {
  result = await inspect();
} else {
  throw new Error(`Unsupported social recap fixture action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
