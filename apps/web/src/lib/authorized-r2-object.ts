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
import { env } from "@pi-dash/env/server";
import { and, eq } from "drizzle-orm";

export const persistedR2ObjectKindValues = [
  "advancePaymentAttachment",
  "advancePaymentApprovalScreenshot",
  "eventPhoto",
  "reimbursementAttachment",
  "reimbursementApprovalScreenshot",
  "scheduledMessageAttachment",
  "vendorPaymentAttachment",
  "vendorPaymentTransactionAttachment",
] as const;

export type PersistedR2ObjectKind =
  (typeof persistedR2ObjectKindValues)[number];

export type R2Subfolder =
  | "approval-screenshots"
  | "attachments"
  | "photos"
  | "scheduled-messages"
  | "updates";

export type PersistedR2ObjectInput =
  | {
      id: string;
      kind: Exclude<PersistedR2ObjectKind, "scheduledMessageAttachment">;
    }
  | { id: string; key: string; kind: "scheduledMessageAttachment" };

export type DeleteR2ObjectInput =
  | PersistedR2ObjectInput
  | { key: string; kind: "temporaryUpload"; subfolder: R2Subfolder };

export interface ResolvedR2Object {
  filename: string;
  key: string;
}

export class R2ObjectAccessError extends Error {
  readonly status: 403 | 404;

  constructor(status: 403 | 404, message: string) {
    super(message);
    this.name = "R2ObjectAccessError";
    this.status = status;
  }
}

interface AttachmentRecord {
  filename: null | string;
  objectKey: null | string;
  ownerUserId: string;
}

interface EventPhotoRecord {
  eventId: string;
  eventTeamId: string;
  filename: null | string;
  r2Key: null | string;
  status: "approved" | "pending" | "rejected";
  uploadedBy: string;
}

interface ScheduledMessageAttachment {
  fileName: string;
  mimeType: string;
  r2Key: string;
}

interface ScheduledMessageRecord {
  attachments: null | ScheduledMessageAttachment[];
  createdBy: string;
}

interface EventRecord {
  startTime: Date;
  teamId: string;
}

export interface AuthorizedR2ObjectDeps {
  findAdvancePaymentApprovalScreenshot: (
    id: string
  ) => Promise<AttachmentRecord | null>;
  findAdvancePaymentAttachment: (
    id: string
  ) => Promise<AttachmentRecord | null>;
  findEvent: (id: string) => Promise<EventRecord | null>;
  findEventPhoto: (id: string) => Promise<EventPhotoRecord | null>;
  findReimbursementApprovalScreenshot: (
    id: string
  ) => Promise<AttachmentRecord | null>;
  findReimbursementAttachment: (id: string) => Promise<AttachmentRecord | null>;
  findScheduledMessage: (id: string) => Promise<ScheduledMessageRecord | null>;
  findVendorPaymentAttachment: (id: string) => Promise<AttachmentRecord | null>;
  findVendorPaymentTransactionAttachment: (
    id: string
  ) => Promise<AttachmentRecord | null>;
  isEventMember: (eventId: string, userId: string) => Promise<boolean>;
  isTeamLead: (teamId: string, userId: string) => Promise<boolean>;
  resolvePermissions: (role: string) => Promise<string[]>;
}

interface SessionLike {
  user: { id: string; role?: null | string };
}

const notFound = (message = "Object not found"): never => {
  throw new R2ObjectAccessError(404, message);
};

const forbidden = (): never => {
  throw new R2ObjectAccessError(403, "Forbidden");
};

function roleFor(session: SessionLike): string {
  return session.user.role ?? "unoriented_volunteer";
}

function filenameFromKey(key: string): string {
  return key.split("/").pop() || "attachment";
}

function assertObjectKey(record: AttachmentRecord): ResolvedR2Object {
  if (!record.objectKey) {
    return notFound();
  }
  const key = record.objectKey;
  return {
    filename: record.filename ?? filenameFromKey(key),
    key,
  };
}

async function assertCanAccessRequestObject(
  session: SessionLike,
  record: AttachmentRecord | null,
  deps: AuthorizedR2ObjectDeps
): Promise<ResolvedR2Object> {
  if (!record) {
    return notFound();
  }
  const permissions = await deps.resolvePermissions(roleFor(session));
  if (
    record.ownerUserId !== session.user.id &&
    !permissions.includes("requests.view_all")
  ) {
    forbidden();
  }
  return assertObjectKey(record);
}

async function assertCanAccessEventPhoto(
  session: SessionLike,
  photo: EventPhotoRecord | null,
  deps: AuthorizedR2ObjectDeps
): Promise<ResolvedR2Object> {
  if (!photo) {
    return notFound();
  }
  if (!photo.r2Key) {
    return notFound();
  }
  const key = photo.r2Key;

  const permissions = await deps.resolvePermissions(roleFor(session));
  const isManager =
    permissions.includes("events.manage_photos") ||
    (await deps.isTeamLead(photo.eventTeamId, session.user.id));

  if (isManager) {
    return {
      filename: photo.filename ?? filenameFromKey(key),
      key,
    };
  }

  const isOwnPending =
    photo.status === "pending" && photo.uploadedBy === session.user.id;
  const isApprovedMember =
    photo.status === "approved" &&
    (await deps.isEventMember(photo.eventId, session.user.id));

  if (!(isOwnPending || isApprovedMember)) {
    forbidden();
  }

  return {
    filename: photo.filename ?? filenameFromKey(key),
    key,
  };
}

async function assertCanAccessScheduledMessageAttachment(
  session: SessionLike,
  input: Extract<
    PersistedR2ObjectInput,
    { kind: "scheduledMessageAttachment" }
  >,
  deps: AuthorizedR2ObjectDeps
): Promise<ResolvedR2Object> {
  const message = await deps.findScheduledMessage(input.id);
  if (!message) {
    return notFound();
  }

  const permissions = await deps.resolvePermissions(roleFor(session));
  if (
    message.createdBy !== session.user.id &&
    !permissions.includes("messages.schedule")
  ) {
    forbidden();
  }

  const attachment = message.attachments?.find(
    (att) => att.r2Key === input.key
  );
  if (!attachment) {
    return notFound();
  }

  return {
    filename: attachment.fileName || filenameFromKey(attachment.r2Key),
    key: attachment.r2Key,
  };
}

function assertCanDeleteTemporaryUpload(
  session: SessionLike,
  input: Extract<DeleteR2ObjectInput, { kind: "temporaryUpload" }>
): ResolvedR2Object {
  const expectedPrefix = `${env.R2_KEY_PREFIX}/${input.subfolder}/tmp/${session.user.id}/`;
  if (!input.key.startsWith(expectedPrefix)) {
    forbidden();
  }
  return { filename: filenameFromKey(input.key), key: input.key };
}

export async function assertCanDownloadR2Object(
  session: SessionLike,
  input: PersistedR2ObjectInput,
  deps = defaultAuthorizedR2ObjectDeps
): Promise<ResolvedR2Object> {
  switch (input.kind) {
    case "advancePaymentAttachment":
      return assertCanAccessRequestObject(
        session,
        await deps.findAdvancePaymentAttachment(input.id),
        deps
      );
    case "advancePaymentApprovalScreenshot":
      return assertCanAccessRequestObject(
        session,
        await deps.findAdvancePaymentApprovalScreenshot(input.id),
        deps
      );
    case "eventPhoto":
      return assertCanAccessEventPhoto(
        session,
        await deps.findEventPhoto(input.id),
        deps
      );
    case "reimbursementAttachment":
      return assertCanAccessRequestObject(
        session,
        await deps.findReimbursementAttachment(input.id),
        deps
      );
    case "reimbursementApprovalScreenshot":
      return assertCanAccessRequestObject(
        session,
        await deps.findReimbursementApprovalScreenshot(input.id),
        deps
      );
    case "scheduledMessageAttachment":
      return assertCanAccessScheduledMessageAttachment(session, input, deps);
    case "vendorPaymentAttachment":
      return assertCanAccessRequestObject(
        session,
        await deps.findVendorPaymentAttachment(input.id),
        deps
      );
    case "vendorPaymentTransactionAttachment":
      return assertCanAccessRequestObject(
        session,
        await deps.findVendorPaymentTransactionAttachment(input.id),
        deps
      );
    default: {
      const _exhaustive: never = input;
      return _exhaustive;
    }
  }
}

export async function assertCanDeleteR2Object(
  session: SessionLike,
  input: DeleteR2ObjectInput,
  deps = defaultAuthorizedR2ObjectDeps
): Promise<{ key: string }> {
  if (input.kind === "temporaryUpload") {
    return assertCanDeleteTemporaryUpload(session, input);
  }

  const resolved = await assertCanDownloadR2Object(session, input, deps);
  return { key: resolved.key };
}

export async function assertCanUploadEventScopedObject(
  session: SessionLike,
  eventId: string,
  permissionId: "event_updates.create" | "events.manage_photos",
  deps = defaultAuthorizedR2ObjectDeps,
  now = new Date()
): Promise<void> {
  const event = await deps.findEvent(eventId);
  if (!event) {
    return notFound("Event not found");
  }
  if (event.startTime > now) {
    forbidden();
  }

  const permissions = await deps.resolvePermissions(roleFor(session));
  const isManager =
    permissions.includes(permissionId) ||
    (await deps.isTeamLead(event.teamId, session.user.id));
  const isMember = await deps.isEventMember(eventId, session.user.id);

  if (!(isManager || isMember)) {
    forbidden();
  }
}

export async function assertCanUploadScheduledMessageObject(
  session: SessionLike,
  deps = defaultAuthorizedR2ObjectDeps
): Promise<void> {
  const permissions = await deps.resolvePermissions(roleFor(session));
  if (!permissions.includes("messages.schedule")) {
    forbidden();
  }
}

const defaultAuthorizedR2ObjectDeps: AuthorizedR2ObjectDeps = {
  findAdvancePaymentApprovalScreenshot: async (id) => {
    const parent = await db.query.advancePayment.findFirst({
      where: eq(advancePayment.id, id),
    });
    if (!parent?.approvalScreenshotKey) {
      return null;
    }
    return {
      filename: "payment-proof",
      objectKey: parent.approvalScreenshotKey,
      ownerUserId: parent.userId,
    };
  },
  findAdvancePaymentAttachment: async (id) => {
    const attachment = await db.query.advancePaymentAttachment.findFirst({
      where: eq(advancePaymentAttachment.id, id),
    });
    if (!attachment) {
      return null;
    }
    const parent = await db.query.advancePayment.findFirst({
      where: eq(advancePayment.id, attachment.advancePaymentId),
    });
    if (!parent) {
      return null;
    }
    return {
      filename: attachment.filename,
      objectKey: attachment.objectKey,
      ownerUserId: parent.userId,
    };
  },
  findEvent: async (id) => {
    const event = await db.query.teamEvent.findFirst({
      where: eq(teamEvent.id, id),
    });
    return event
      ? { startTime: new Date(event.startTime), teamId: event.teamId }
      : null;
  },
  findEventPhoto: async (id) => {
    const photo = await db.query.eventPhoto.findFirst({
      where: eq(eventPhoto.id, id),
    });
    if (!photo) {
      return null;
    }
    const event = await db.query.teamEvent.findFirst({
      where: eq(teamEvent.id, photo.eventId),
    });
    if (!event) {
      return null;
    }
    return {
      eventId: photo.eventId,
      eventTeamId: event.teamId,
      filename: photo.caption,
      r2Key: photo.r2Key,
      status: photo.status,
      uploadedBy: photo.uploadedBy,
    };
  },
  findReimbursementApprovalScreenshot: async (id) => {
    const parent = await db.query.reimbursement.findFirst({
      where: eq(reimbursement.id, id),
    });
    if (!parent?.approvalScreenshotKey) {
      return null;
    }
    return {
      filename: "payment-proof",
      objectKey: parent.approvalScreenshotKey,
      ownerUserId: parent.userId,
    };
  },
  findReimbursementAttachment: async (id) => {
    const attachment = await db.query.reimbursementAttachment.findFirst({
      where: eq(reimbursementAttachment.id, id),
    });
    if (!attachment) {
      return null;
    }
    const parent = await db.query.reimbursement.findFirst({
      where: eq(reimbursement.id, attachment.reimbursementId),
    });
    if (!parent) {
      return null;
    }
    return {
      filename: attachment.filename,
      objectKey: attachment.objectKey,
      ownerUserId: parent.userId,
    };
  },
  findScheduledMessage: async (id) => {
    const message = await db.query.scheduledMessage.findFirst({
      where: eq(scheduledMessage.id, id),
    });
    return message
      ? {
          attachments: message.attachments ?? null,
          createdBy: message.createdBy,
        }
      : null;
  },
  findVendorPaymentAttachment: async (id) => {
    const attachment = await db.query.vendorPaymentAttachment.findFirst({
      where: eq(vendorPaymentAttachment.id, id),
    });
    if (!attachment) {
      return null;
    }
    const parent = await db.query.vendorPayment.findFirst({
      where: eq(vendorPayment.id, attachment.vendorPaymentId),
    });
    if (!parent) {
      return null;
    }
    return {
      filename: attachment.filename,
      objectKey: attachment.objectKey,
      ownerUserId: parent.userId,
    };
  },
  findVendorPaymentTransactionAttachment: async (id) => {
    const attachment =
      await db.query.vendorPaymentTransactionAttachment.findFirst({
        where: eq(vendorPaymentTransactionAttachment.id, id),
      });
    if (!attachment) {
      return null;
    }
    const parent = await db.query.vendorPaymentTransaction.findFirst({
      where: eq(
        vendorPaymentTransaction.id,
        attachment.vendorPaymentTransactionId
      ),
    });
    if (!parent) {
      return null;
    }
    return {
      filename: attachment.filename,
      objectKey: attachment.objectKey,
      ownerUserId: parent.userId,
    };
  },
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
  resolvePermissions,
};
