import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import {
  advancePayment,
  advancePaymentAttachment,
} from "@pi-dash/db/schema/advance-payment";
import { eventPhoto } from "@pi-dash/db/schema/event-photo";
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
import { and, eq } from "drizzle-orm";
import {
  authorizeR2Object,
  type R2ObjectAccessDeps,
  R2ObjectAccessError,
  type R2ObjectRecord,
  type ResolvedR2Object,
} from "./r2-object-access";

interface SessionLike {
  user: { id: string; role?: null | string };
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
  const photo = await db.query.eventPhoto.findFirst({
    where: eq(eventPhoto.id, ref.id),
  });
  if (!photo?.r2Key) {
    return null;
  }
  const event = await db.query.teamEvent.findFirst({
    where: eq(teamEvent.id, photo.eventId),
  });
  return event
    ? {
        access: "eventPhoto",
        eventId: photo.eventId,
        eventIsPublic: event.isPublic,
        filename: photo.caption ?? filenameFromKey(photo.r2Key),
        key: photo.r2Key,
        status: photo.status,
        teamId: event.teamId,
        uploadedBy: photo.uploadedBy,
      }
    : null;
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

function findRecord(ref: AttachmentAssetRef): Promise<R2ObjectRecord | null> {
  switch (ref.kind) {
    case "advancePaymentAttachment":
      return resolveAdvancePaymentAttachment(ref);
    case "advancePaymentApprovalScreenshot":
      return resolveAdvancePaymentApprovalScreenshot(ref);
    case "eventPhoto":
      return resolveEventPhoto(ref);
    case "reimbursementAttachment":
      return resolveReimbursementAttachment(ref);
    case "reimbursementApprovalScreenshot":
      return resolveReimbursementApprovalScreenshot(ref);
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

const defaultAuthorizedR2ObjectDeps: AuthorizedR2ObjectDeps = {
  findRecord,
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
