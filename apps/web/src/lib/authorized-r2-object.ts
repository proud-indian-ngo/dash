import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import {
  advancePayment,
  advancePaymentAttachment,
} from "@pi-dash/db/schema/advance-payment";
import { eventPhoto } from "@pi-dash/db/schema/event-photo";
import {
  governanceDocument,
  resolution,
  trustee,
  resolutionResponse,
  resolutionRevision,
} from "@pi-dash/db/schema/governance";
import { meeting } from "@pi-dash/db/schema/meetings";
import {
  reimbursement,
  reimbursementAttachment,
} from "@pi-dash/db/schema/reimbursement";
import { scheduledMessage } from "@pi-dash/db/schema/scheduled-message";
import { teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import {
  vendorPayment,
  vendorPaymentAttachment,
} from "@pi-dash/db/schema/vendor";
import {
  vendorPaymentTransaction,
  vendorPaymentTransactionAttachment,
} from "@pi-dash/db/schema/vendor-payment-transaction";
import type { AttachmentAssetRef } from "@pi-dash/shared/asset-ref";
import { and, desc, eq } from "drizzle-orm";

import {
  authorizeEventPhoto,
  authorizeR2Object,
  type EventPhotoAccessRecord,
  type R2ObjectAccessDeps,
  R2ObjectAccessError,
  type R2ObjectRecord,
  type ResolvedR2Object,
} from "./r2-object-access";
import {
  canReadKalakritiEntryMusic,
  loadKalakritiEntryMusicRecord,
} from "./server/kalakriti-entry-music";
import {
  canAccessKalakritiInventoryPhoto,
  loadKalakritiInventoryPhotoRecord,
} from "./server/kalakriti-inventory-photo";
import {
  canReadKalakritiScorecard,
  loadKalakritiScorecardRecord,
} from "./server/kalakriti-scorecard";

interface SessionLike {
  user: { id: string; role?: null | string };
}

interface EventPhotoRecord extends EventPhotoAccessRecord {
  caption: null | string;
  immichAssetId: null | string;
  r2Key: null | string;
}

export interface ResolvedEventPhoto {
  immichAssetId: null | string;
  r2Key: null | string;
}

export interface AuthorizedEventPhotoDeps extends R2ObjectAccessDeps {
  findEventPhoto: (photoId: string) => Promise<EventPhotoRecord | null>;
}

export interface AuthorizedR2ObjectDeps extends R2ObjectAccessDeps {
  findRecord: (ref: AttachmentAssetRef) => Promise<R2ObjectRecord | null>;
}

export async function resolveAuthorizedR2Object(
  session: SessionLike,
  ref: AttachmentAssetRef,
  deps: AuthorizedR2ObjectDeps = defaultAuthorizedR2ObjectDeps
): Promise<ResolvedR2Object> {
  const record = await deps.findRecord(ref);
  if (!record) {
    throw new R2ObjectAccessError(404, "Object not found");
  }
  return authorizeR2Object(session, record, deps);
}

const filenameFromKey = (key: string): string =>
  key.split("/").pop() || "attachment";

const requestRecord = (
  key: null | string,
  filename: null | string,
  ownerUserIds: readonly string[]
): R2ObjectRecord | null =>
  key
    ? {
        access: "request",
        filename: filename ?? filenameFromKey(key),
        key,
        ownerUserIds,
      }
    : null;

async function findEventPhoto(
  photoId: string
): Promise<EventPhotoRecord | null> {
  const photo = await db.query.eventPhoto.findFirst({
    where: eq(eventPhoto.id, photoId),
  });
  if (!photo) {
    return null;
  }
  const event = await db.query.teamEvent.findFirst({
    where: eq(teamEvent.id, photo.eventId),
  });
  return event
    ? {
        caption: photo.caption,
        eventId: photo.eventId,
        eventIsPublic: event.isPublic,
        immichAssetId: photo.immichAssetId,
        r2Key: photo.r2Key,
        status: photo.status,
        teamId: event.teamId,
        uploadedBy: photo.uploadedBy,
      }
    : null;
}

export async function resolveAuthorizedEventPhoto(
  session: SessionLike,
  photoId: string,
  deps: AuthorizedEventPhotoDeps = defaultAuthorizedEventPhotoDeps
): Promise<ResolvedEventPhoto> {
  const record = await deps.findEventPhoto(photoId);
  if (!record) {
    throw new R2ObjectAccessError(404, "Object not found");
  }
  await authorizeEventPhoto(session, record, deps);
  return { immichAssetId: record.immichAssetId, r2Key: record.r2Key };
}

type AssetRef<K extends AttachmentAssetRef["kind"]> = Extract<
  AttachmentAssetRef,
  { kind: K }
>;

async function resolveAdvancePaymentAttachment(
  ref: AssetRef<"advancePaymentAttachment">
): Promise<R2ObjectRecord | null> {
  const attachment = await db.query.advancePaymentAttachment.findFirst({
    where: eq(advancePaymentAttachment.id, ref.id),
  });
  if (attachment?.type !== "file") {
    return null;
  }
  const parent = await db.query.advancePayment.findFirst({
    where: eq(advancePayment.id, attachment.advancePaymentId),
  });
  return parent
    ? requestRecord(attachment.objectKey, attachment.filename, [parent.userId])
    : null;
}

async function resolveAdvancePaymentApprovalScreenshot(
  ref: AssetRef<"advancePaymentApprovalScreenshot">
): Promise<R2ObjectRecord | null> {
  const parent = await db.query.advancePayment.findFirst({
    where: eq(advancePayment.id, ref.id),
  });
  return parent
    ? requestRecord(parent.approvalScreenshotKey, null, [parent.userId])
    : null;
}

async function resolveEventPhoto(
  ref: AssetRef<"eventPhoto">
): Promise<R2ObjectRecord | null> {
  const photo = await findEventPhoto(ref.id);
  if (!photo?.r2Key) {
    return null;
  }
  return {
    access: "eventPhoto",
    eventId: photo.eventId,
    eventIsPublic: photo.eventIsPublic,
    filename: photo.caption ?? filenameFromKey(photo.r2Key),
    key: photo.r2Key,
    status: photo.status,
    teamId: photo.teamId,
    uploadedBy: photo.uploadedBy,
  };
}

async function resolveReimbursementAttachment(
  ref: AssetRef<"reimbursementAttachment">
): Promise<R2ObjectRecord | null> {
  const attachment = await db.query.reimbursementAttachment.findFirst({
    where: eq(reimbursementAttachment.id, ref.id),
  });
  if (attachment?.type !== "file") {
    return null;
  }
  const parent = await db.query.reimbursement.findFirst({
    where: eq(reimbursement.id, attachment.reimbursementId),
  });
  return parent
    ? requestRecord(attachment.objectKey, attachment.filename, [parent.userId])
    : null;
}

async function resolveReimbursementApprovalScreenshot(
  ref: AssetRef<"reimbursementApprovalScreenshot">
): Promise<R2ObjectRecord | null> {
  const parent = await db.query.reimbursement.findFirst({
    where: eq(reimbursement.id, ref.id),
  });
  return parent
    ? requestRecord(parent.approvalScreenshotKey, null, [parent.userId])
    : null;
}

async function resolveScheduledMessageAttachment(
  ref: AssetRef<"scheduledMessageAttachment">
): Promise<R2ObjectRecord | null> {
  const message = await db.query.scheduledMessage.findFirst({
    where: eq(scheduledMessage.id, ref.id),
  });
  const attachment = message?.attachments?.find(
    (candidate) => candidate.r2Key === ref.key
  );
  return message && attachment
    ? {
        access: "scheduledMessage",
        createdBy: message.createdBy,
        filename: attachment.fileName || filenameFromKey(attachment.r2Key),
        key: attachment.r2Key,
      }
    : null;
}

async function resolveVendorPaymentAttachment(
  ref: AssetRef<"vendorPaymentAttachment">
): Promise<R2ObjectRecord | null> {
  const attachment = await db.query.vendorPaymentAttachment.findFirst({
    where: eq(vendorPaymentAttachment.id, ref.id),
  });
  if (attachment?.type !== "file") {
    return null;
  }
  const parent = await db.query.vendorPayment.findFirst({
    where: eq(vendorPayment.id, attachment.vendorPaymentId),
  });
  return parent
    ? requestRecord(attachment.objectKey, attachment.filename, [parent.userId])
    : null;
}

async function resolveVendorPaymentTransactionAttachment(
  ref: AssetRef<"vendorPaymentTransactionAttachment">
): Promise<R2ObjectRecord | null> {
  const attachment =
    await db.query.vendorPaymentTransactionAttachment.findFirst({
      where: eq(vendorPaymentTransactionAttachment.id, ref.id),
    });
  if (attachment?.type !== "file") {
    return null;
  }
  const transaction = await db.query.vendorPaymentTransaction.findFirst({
    where: eq(
      vendorPaymentTransaction.id,
      attachment.vendorPaymentTransactionId
    ),
  });
  if (!transaction) {
    return null;
  }
  const parent = await db.query.vendorPayment.findFirst({
    where: eq(vendorPayment.id, transaction.vendorPaymentId),
  });
  return requestRecord(attachment.objectKey, attachment.filename, [
    transaction.userId,
    ...(parent ? [parent.userId] : []),
  ]);
}

async function resolveGovernanceDocument(
  ref: AssetRef<"governanceDocument">
): Promise<R2ObjectRecord | null> {
  const document = await db.query.governanceDocument.findFirst({
    where: eq(governanceDocument.id, ref.id),
  });
  return document
    ? {
        access: "governanceDocument",
        filename: document.originalFilename,
        // The long-term copy extends the original (revocation data and
        // document timestamps appended), so it is the one to hand out.
        key: document.archiveObjectKey ?? document.objectKey,
        kind: document.kind,
      }
    : null;
}

async function resolveResolutionPdf(
  ref: AssetRef<"resolutionPdf">
): Promise<R2ObjectRecord | null> {
  const [revision] = await db
    .select({
      key: resolutionRevision.latestObjectKey,
      number: resolution.number,
      title: resolution.title,
    })
    .from(resolutionRevision)
    .innerJoin(resolution, eq(resolution.id, resolutionRevision.resolutionId))
    .where(eq(resolutionRevision.resolutionId, ref.id))
    .orderBy(desc(resolutionRevision.revision))
    .limit(1);
  if (!revision) {
    return null;
  }
  const recipients = await db
    .select({ userId: resolutionResponse.userId })
    .from(resolutionResponse)
    .where(eq(resolutionResponse.resolutionId, ref.id));
  const name = (revision.number ?? `circular-${ref.id.slice(-8)}`).replaceAll(
    "/",
    "-"
  );
  return {
    access: "resolution",
    filename: `${name}.pdf`,
    key: revision.key,
    recipientUserIds: recipients
      .map((r) => r.userId)
      .filter((id): id is string => !!id),
  };
}

/** The minutes as generated, before the chair signs them. */
async function resolveMeetingMinutes(
  ref: AssetRef<"meetingMinutes">
): Promise<R2ObjectRecord | null> {
  const [row] = await db
    .select({
      chairUserId: trustee.userId,
      key: meeting.minutesObjectKey,
    })
    .from(meeting)
    .leftJoin(trustee, eq(trustee.id, meeting.chairTrusteeId))
    .where(eq(meeting.id, ref.id))
    .limit(1);
  if (!row?.key) {
    return null;
  }
  return {
    access: "resolution",
    filename: `minutes-${ref.id.slice(-8)}.pdf`,
    key: row.key,
    recipientUserIds: row.chairUserId ? [row.chairUserId] : [],
  };
}

async function resolveKalakritiEntryMusic(
  ref: Extract<AttachmentAssetRef, { kind: "kalakritiEntryMusic" }>
): Promise<R2ObjectRecord | null> {
  const record = await loadKalakritiEntryMusicRecord(ref.id);
  if (!record) {
    return null;
  }
  return { access: "kalakritiEntryMusic", ...record };
}

async function resolveKalakritiScorecard(
  ref: Extract<AttachmentAssetRef, { kind: "kalakritiScorecard" }>
): Promise<R2ObjectRecord | null> {
  const record = await loadKalakritiScorecardRecord(ref.id);
  return record ? { access: "kalakritiScorecard", ...record } : null;
}

async function resolveKalakritiInventoryPhoto(
  ref: AssetRef<"kalakritiInventoryPhoto">
): Promise<R2ObjectRecord | null> {
  const record = await loadKalakritiInventoryPhotoRecord(ref.id);
  return record ? { access: "kalakritiInventoryPhoto", ...record } : null;
}

function findRecord(ref: AttachmentAssetRef): Promise<R2ObjectRecord | null> {
  switch (ref.kind) {
    case "advancePaymentAttachment":
      return resolveAdvancePaymentAttachment(ref);
    case "advancePaymentApprovalScreenshot":
      return resolveAdvancePaymentApprovalScreenshot(ref);
    case "eventPhoto":
      return resolveEventPhoto(ref);
    case "governanceDocument":
      return resolveGovernanceDocument(ref);
    case "kalakritiEntryMusic":
      return resolveKalakritiEntryMusic(ref);
    case "kalakritiInventoryPhoto":
      return resolveKalakritiInventoryPhoto(ref);
    case "kalakritiScorecard":
      return resolveKalakritiScorecard(ref);
    case "meetingMinutes":
      return resolveMeetingMinutes(ref);
    case "reimbursementAttachment":
      return resolveReimbursementAttachment(ref);
    case "reimbursementApprovalScreenshot":
      return resolveReimbursementApprovalScreenshot(ref);
    case "resolutionPdf":
      return resolveResolutionPdf(ref);
    case "scheduledMessageAttachment":
      return resolveScheduledMessageAttachment(ref);
    case "vendorPaymentAttachment":
      return resolveVendorPaymentAttachment(ref);
    case "vendorPaymentTransactionAttachment":
      return resolveVendorPaymentTransactionAttachment(ref);
    default: {
      const exhaustive: never = ref;
      return exhaustive;
    }
  }
}

export const defaultR2ObjectAccessDeps: R2ObjectAccessDeps = {
  canReadKalakritiInventoryPhoto: (session, record) =>
    canAccessKalakritiInventoryPhoto(session.user, record.editionId),
  canReadKalakritiEntryMusic: async (session, record) =>
    canReadKalakritiEntryMusic(session.user, record),
  canReadKalakritiScorecard: async (session, record) =>
    canReadKalakritiScorecard(session.user, record),
  isEventMember: async (eventId, userId) => {
    const member = await db.query.teamEventMember.findFirst({
      where: and(
        eq(teamEventMember.eventId, eventId),
        eq(teamEventMember.userId, userId)
      ),
    });
    return !!member;
  },
  isTeamLead: async (teamId, userId) => {
    const member = await db.query.teamMember.findFirst({
      where: and(
        eq(teamMember.teamId, teamId),
        eq(teamMember.userId, userId),
        eq(teamMember.role, "lead")
      ),
    });
    return !!member;
  },
  isTeamMember: async (teamId, userId) => {
    const member = await db.query.teamMember.findFirst({
      where: and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)),
    });
    return !!member;
  },
  resolvePermissions,
};

const defaultAuthorizedEventPhotoDeps: AuthorizedEventPhotoDeps = {
  ...defaultR2ObjectAccessDeps,
  findEventPhoto,
};

const defaultAuthorizedR2ObjectDeps: AuthorizedR2ObjectDeps = {
  ...defaultR2ObjectAccessDeps,
  findRecord,
};
