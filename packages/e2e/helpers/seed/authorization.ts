import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  eventFeedback,
  eventFeedbackSubmission,
} from "@pi-dash/db/schema/event-feedback";
import { eventInterest } from "@pi-dash/db/schema/event-interest";
import { eventPhoto } from "@pi-dash/db/schema/event-photo";
import { eventUpdate } from "@pi-dash/db/schema/event-update";
import { reimbursementAttachment } from "@pi-dash/db/schema/reimbursement";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { subDays } from "date-fns";
import { eq } from "drizzle-orm";

import {
  log,
  plateTextContent,
  SEED_REIMBURSEMENT_ID,
  ZERO_AUTH_LEAD_TEAM_ID,
} from "./core";

const SEED_REIMBURSEMENT_ATTACHMENT_ID = "e2e00000-0000-0000-0000-000000000005";
const SEED_TEMP_REIMBURSEMENT_ATTACHMENT_ID =
  "e2e00000-0000-0000-0000-000000000006";
const ZERO_AUTH_PROTECTED_TEAM_ID = "e2e00000-0000-0000-0000-000000000101";
const ZERO_AUTH_PROTECTED_EVENT_ID = "e2e00000-0000-4000-8000-000000000201";
const ZERO_AUTH_LEAD_EVENT_ID = "e2e00000-0000-0000-0000-000000000202";
const ZERO_AUTH_PROTECTED_MEDIA_KEY = `${process.env.R2_KEY_PREFIX ?? "attachments"}/updates/${ZERO_AUTH_PROTECTED_EVENT_ID}/e2e-editor-image.jpg`;
const ZERO_AUTH_PROTECTED_UPDATE_CONTENT = JSON.stringify([
  {
    children: [
      { text: "Protected pending update fixture" },
      {
        children: [{ text: "" }],
        type: "img",
        url: ZERO_AUTH_PROTECTED_MEDIA_KEY,
      },
    ],
    type: "p",
  },
]);
const ZERO_AUTH_PROTECTED_INTEREST_ID = "e2e00000-0000-0000-0000-000000000301";
const ZERO_AUTH_PROTECTED_UPDATE_ID = "e2e00000-0000-0000-0000-000000000302";
const ZERO_AUTH_PROTECTED_PHOTO_ID = "e2e00000-0000-0000-0000-000000000303";
const ZERO_AUTH_APPROVED_IMMICH_PHOTO_ID =
  "e2e00000-0000-0000-0000-000000000308";
const ZERO_AUTH_PENDING_IMMICH_ASSET_ID =
  "a2e00000-0000-0000-0000-000000000303";
const ZERO_AUTH_LEAD_FEEDBACK_ID = "e2e00000-0000-0000-0000-000000000304";
const ZERO_AUTH_LEAD_FEEDBACK_SUBMISSION_ID =
  "e2e00000-0000-0000-0000-000000000305";
const ZERO_AUTH_PROTECTED_FEEDBACK_ID = "e2e00000-0000-0000-0000-000000000306";
const ZERO_AUTH_PROTECTED_FEEDBACK_SUBMISSION_ID =
  "e2e00000-0000-0000-0000-000000000307";
const ZERO_AUTH_PROTECTED_ADMIN_MEMBER_ID =
  "e2e00000-0000-0000-0000-000000000401";
const ZERO_AUTH_PROTECTED_VOLUNTEER_MEMBER_ID =
  "e2e00000-0000-0000-0000-000000000402";
const ZERO_AUTH_LEAD_ADMIN_MEMBER_ID = "e2e00000-0000-0000-0000-000000000403";
const ZERO_AUTH_LEAD_VOLUNTEER_MEMBER_ID =
  "e2e00000-0000-0000-0000-000000000404";
const ZERO_AUTH_PROTECTED_ADMIN_EVENT_MEMBER_ID =
  "e2e00000-0000-0000-0000-000000000501";
const ZERO_AUTH_PROTECTED_VOLUNTEER_EVENT_MEMBER_ID =
  "e2e00000-0000-0000-0000-000000000502";
const ZERO_AUTH_LEAD_ADMIN_EVENT_MEMBER_ID =
  "e2e00000-0000-0000-0000-000000000503";
const ZERO_AUTH_LEAD_VOLUNTEER_EVENT_MEMBER_ID =
  "e2e00000-0000-0000-0000-000000000504";
const R2_KEY_PREFIX = process.env.R2_KEY_PREFIX ?? "attachments";
const LEGACY_CDN_URL = process.env.VITE_CDN_URL ?? "https://cdn.example.test";
const TRAILING_SLASH = /\/$/;
const ZERO_AUTH_EVENT_MEDIA_KEY = `${R2_KEY_PREFIX}/updates/${ZERO_AUTH_PROTECTED_EVENT_ID}/e2e-editor-image.jpg`;

const legacyMediaUrl = (key: string): string =>
  `${LEGACY_CDN_URL.replace(TRAILING_SLASH, "")}/${key}`;

const plateImageContent = (url: string): string =>
  JSON.stringify([
    {
      children: [{ text: "" }],
      type: "img",
      url,
    },
  ]);

export async function ensureR2AuthorizationFixtures(): Promise<void> {
  const now = new Date();
  await db
    .insert(reimbursementAttachment)
    .values([
      {
        createdAt: now,
        filename: "private-receipt.pdf",
        id: SEED_REIMBURSEMENT_ATTACHMENT_ID,
        mimeType: "application/pdf",
        objectKey: "legacy/e2e/private-receipt.pdf",
        purpose: "receipt",
        reimbursementId: SEED_REIMBURSEMENT_ID,
        type: "file",
      },
      {
        createdAt: now,
        filename: "temporary-receipt.pdf",
        id: SEED_TEMP_REIMBURSEMENT_ATTACHMENT_ID,
        mimeType: "application/pdf",
        objectKey: "app/attachments/tmp/e2e/temporary-receipt.pdf",
        purpose: "receipt",
        reimbursementId: SEED_REIMBURSEMENT_ID,
        type: "file",
      },
    ])
    .onConflictDoNothing();
}

export async function ensureZeroQueryAuthorizationFixtures(
  adminUserId: string,
  volunteerUserId: string
): Promise<void> {
  const now = new Date();
  const pastStart = subDays(now, 2);

  await db
    .update(user)
    .set({
      image: legacyMediaUrl(
        `${R2_KEY_PREFIX}/avatars/${volunteerUserId}/e2e-avatar.jpg`
      ),
    })
    .where(eq(user.id, volunteerUserId));

  await db
    .insert(team)
    .values([
      {
        createdAt: now,
        description: "Protected fixtures for Zero query authorization tests",
        id: ZERO_AUTH_PROTECTED_TEAM_ID,
        name: "E2E Zero Query Protected Team",
        updatedAt: now,
      },
      {
        createdAt: now,
        description: "Lead fixtures for Zero query authorization tests",
        id: ZERO_AUTH_LEAD_TEAM_ID,
        name: "E2E Zero Query Lead Team",
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(teamMember)
    .values([
      {
        id: ZERO_AUTH_PROTECTED_ADMIN_MEMBER_ID,
        joinedAt: now,
        role: "lead",
        teamId: ZERO_AUTH_PROTECTED_TEAM_ID,
        userId: adminUserId,
      },
      {
        id: ZERO_AUTH_PROTECTED_VOLUNTEER_MEMBER_ID,
        joinedAt: now,
        role: "member",
        teamId: ZERO_AUTH_PROTECTED_TEAM_ID,
        userId: volunteerUserId,
      },
      {
        id: ZERO_AUTH_LEAD_ADMIN_MEMBER_ID,
        joinedAt: now,
        role: "member",
        teamId: ZERO_AUTH_LEAD_TEAM_ID,
        userId: adminUserId,
      },
      {
        id: ZERO_AUTH_LEAD_VOLUNTEER_MEMBER_ID,
        joinedAt: now,
        role: "lead",
        teamId: ZERO_AUTH_LEAD_TEAM_ID,
        userId: volunteerUserId,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(teamEvent)
    .values([
      {
        createdAt: now,
        createdBy: adminUserId,
        description:
          "Protected event for direct Zero query authorization tests",
        feedbackEnabled: true,
        id: ZERO_AUTH_PROTECTED_EVENT_ID,
        isPublic: false,
        name: "E2E Zero Query Protected Event",
        startTime: pastStart,
        teamId: ZERO_AUTH_PROTECTED_TEAM_ID,
        updatedAt: now,
      },
      {
        createdAt: now,
        createdBy: adminUserId,
        description: "Lead event for direct Zero query authorization tests",
        feedbackEnabled: true,
        id: ZERO_AUTH_LEAD_EVENT_ID,
        isPublic: true,
        name: "E2E Zero Query Lead Event",
        startTime: pastStart,
        teamId: ZERO_AUTH_LEAD_TEAM_ID,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .update(teamEvent)
    .set({ isPublic: false })
    .where(eq(teamEvent.id, ZERO_AUTH_PROTECTED_EVENT_ID));

  await db
    .update(user)
    .set({
      image: `${process.env.R2_KEY_PREFIX ?? "attachments"}/avatars/${volunteerUserId}/e2e-avatar.jpg`,
    })
    .where(eq(user.id, volunteerUserId));

  await db
    .insert(teamEventMember)
    .values([
      {
        addedAt: now,
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
        id: ZERO_AUTH_PROTECTED_ADMIN_EVENT_MEMBER_ID,
        userId: adminUserId,
      },
      {
        addedAt: now,
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
        id: ZERO_AUTH_PROTECTED_VOLUNTEER_EVENT_MEMBER_ID,
        userId: volunteerUserId,
      },
      {
        addedAt: now,
        eventId: ZERO_AUTH_LEAD_EVENT_ID,
        id: ZERO_AUTH_LEAD_ADMIN_EVENT_MEMBER_ID,
        userId: adminUserId,
      },
      {
        addedAt: now,
        eventId: ZERO_AUTH_LEAD_EVENT_ID,
        id: ZERO_AUTH_LEAD_VOLUNTEER_EVENT_MEMBER_ID,
        userId: volunteerUserId,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(eventInterest)
    .values({
      createdAt: now,
      eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
      id: ZERO_AUTH_PROTECTED_INTEREST_ID,
      message: "Protected interest fixture",
      status: "pending",
      userId: volunteerUserId,
    })
    .onConflictDoNothing();

  await db
    .insert(eventUpdate)
    .values({
      content: plateImageContent(legacyMediaUrl(ZERO_AUTH_EVENT_MEDIA_KEY)),
      createdAt: now,
      createdBy: volunteerUserId,
      eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
      id: ZERO_AUTH_PROTECTED_UPDATE_ID,
      status: "pending",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: { content: ZERO_AUTH_PROTECTED_UPDATE_CONTENT },
      target: eventUpdate.id,
    });

  await db
    .insert(eventPhoto)
    .values([
      {
        caption: "Protected pending photo fixture",
        createdAt: now,
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
        id: ZERO_AUTH_PROTECTED_PHOTO_ID,
        immichAssetId: ZERO_AUTH_PENDING_IMMICH_ASSET_ID,
        mimeType: "image/jpeg",
        r2Key: "e2e/zero-query-protected-photo.jpg",
        status: "pending",
        uploadedBy: volunteerUserId,
      },
      {
        caption: "Protected approved Immich photo fixture",
        createdAt: now,
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
        id: ZERO_AUTH_APPROVED_IMMICH_PHOTO_ID,
        mimeType: "image/jpeg",
        status: "approved",
        uploadedBy: adminUserId,
      },
    ])
    .onConflictDoNothing();
  await db
    .update(eventPhoto)
    .set({ immichAssetId: ZERO_AUTH_PENDING_IMMICH_ASSET_ID })
    .where(eq(eventPhoto.id, ZERO_AUTH_PROTECTED_PHOTO_ID));
  await db
    .update(eventPhoto)
    .set({ immichAssetId: null })
    .where(eq(eventPhoto.id, ZERO_AUTH_APPROVED_IMMICH_PHOTO_ID));

  await db
    .insert(eventFeedback)
    .values([
      {
        content: plateTextContent("Protected lead feedback fixture"),
        createdAt: now,
        eventId: ZERO_AUTH_LEAD_EVENT_ID,
        id: ZERO_AUTH_LEAD_FEEDBACK_ID,
        updatedAt: now,
      },
      {
        content: plateTextContent("Protected participant feedback fixture"),
        createdAt: now,
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
        id: ZERO_AUTH_PROTECTED_FEEDBACK_ID,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(eventFeedbackSubmission)
    .values([
      {
        eventId: ZERO_AUTH_LEAD_EVENT_ID,
        feedbackId: ZERO_AUTH_LEAD_FEEDBACK_ID,
        id: ZERO_AUTH_LEAD_FEEDBACK_SUBMISSION_ID,
        submittedAt: now,
        userId: adminUserId,
      },
      {
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
        feedbackId: ZERO_AUTH_PROTECTED_FEEDBACK_ID,
        id: ZERO_AUTH_PROTECTED_FEEDBACK_SUBMISSION_ID,
        submittedAt: now,
        userId: adminUserId,
      },
    ])
    .onConflictDoNothing();

  log("Zero query authorization fixtures ready");
}
