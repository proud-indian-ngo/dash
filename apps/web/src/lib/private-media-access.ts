import { isTemporaryR2Key } from "@pi-dash/shared/asset-ref";
import {
  getPlateImageUrls,
  parseAvatarMediaKey,
  parseEventUpdateMediaKey,
} from "@pi-dash/shared/media-url";
import type { R2ObjectAccessDeps } from "./r2-object-access";

interface SessionLike {
  user: { id: string; role?: null | string };
}

export type ProtectedUploadScope =
  | { kind: "approvalScreenshot" }
  | { eventId: string; kind: "eventPhoto" }
  | { kind: "request" }
  | { kind: "scheduledMessage" }
  | { kind: "vendorPaymentInvoice"; vendorPaymentId: string };

export interface PrivateMediaEvent {
  isPublic: boolean;
  teamId: string;
}

export type PrivateEventMediaRecord =
  | {
      content: string;
      createdBy: string;
      kind: "eventUpdate";
      status: "approved" | "pending" | "rejected";
    }
  | {
      content: string;
      kind: "eventFeedback";
      submitterIds: readonly string[];
    };

export interface PrivateMediaAccessDeps extends R2ObjectAccessDeps {
  findEvent: (eventId: string) => Promise<PrivateMediaEvent | null>;
  findUserImage: (userId: string) => Promise<null | string>;
  findVendorPaymentOwner: (vendorPaymentId: string) => Promise<null | string>;
  getEventMediaRecords: (eventId: string) => Promise<PrivateEventMediaRecord[]>;
  keyPrefix: string;
  legacyCdnUrl: string;
}

export class PrivateMediaAccessError extends Error {
  readonly status: 403 | 404;

  constructor(status: 403 | 404, message: string) {
    super(message);
    this.name = "PrivateMediaAccessError";
    this.status = status;
  }
}

const roleFor = (session: SessionLike): string =>
  session.user.role ?? "unoriented_volunteer";

const notFound = (): never => {
  throw new PrivateMediaAccessError(404, "Media not found");
};

export async function resolveAvatarMedia(
  ref: { key: string; userId: string },
  deps: PrivateMediaAccessDeps
): Promise<{ key: string }> {
  const expectedPrefix = `${deps.keyPrefix}/avatars/${ref.userId}/`;
  if (!ref.key.startsWith(expectedPrefix) || isTemporaryR2Key(ref.key)) {
    return notFound();
  }
  const image = await deps.findUserImage(ref.userId);
  if (!image) {
    return notFound();
  }
  const storedKey = parseAvatarMediaKey(image, {
    legacyCdnUrl: deps.legacyCdnUrl,
    userId: ref.userId,
  });
  if (storedKey !== ref.key) {
    return notFound();
  }
  return { key: ref.key };
}

async function canViewEvent(
  session: SessionLike,
  event: PrivateMediaEvent,
  eventId: string,
  permissions: readonly string[],
  deps: PrivateMediaAccessDeps
): Promise<boolean> {
  if (event.isPublic) {
    return true;
  }
  if (permissions.includes("events.view_all")) {
    return true;
  }
  if (await deps.isEventMember(eventId, session.user.id)) {
    return true;
  }
  return deps.isTeamMember(event.teamId, session.user.id);
}

const recordReferencesKey = (
  record: PrivateEventMediaRecord,
  eventId: string,
  key: string,
  deps: PrivateMediaAccessDeps
): boolean => {
  const { urls } = getPlateImageUrls(record.content);
  return urls.some(
    (url) =>
      parseEventUpdateMediaKey(url, {
        eventId,
        legacyCdnUrl: deps.legacyCdnUrl,
      }) === key
  );
};

const canReadEventMediaRecord = (
  record: PrivateEventMediaRecord,
  session: SessionLike,
  permissions: readonly string[],
  isTeamLead: boolean,
  canViewNormally: boolean
): boolean => {
  if (record.kind === "eventFeedback") {
    return (
      record.submitterIds.includes(session.user.id) ||
      permissions.includes("events.manage_feedback") ||
      isTeamLead
    );
  }
  if (record.status === "approved") {
    return canViewNormally;
  }
  if (record.status === "pending" && record.createdBy === session.user.id) {
    return true;
  }
  return permissions.includes("event_updates.approve") || isTeamLead;
};

export async function resolveEventUpdateMedia(
  session: SessionLike,
  ref: { eventId: string; key: string },
  deps: PrivateMediaAccessDeps
): Promise<{ key: string }> {
  const expectedPrefix = `${deps.keyPrefix}/updates/${ref.eventId}/`;
  if (!ref.key.startsWith(expectedPrefix) || isTemporaryR2Key(ref.key)) {
    return notFound();
  }
  const event = await deps.findEvent(ref.eventId);
  if (!event) {
    return notFound();
  }
  const permissions = await deps.resolvePermissions(roleFor(session));
  const canViewNormally = await canViewEvent(
    session,
    event,
    ref.eventId,
    permissions,
    deps
  );

  const records = await deps.getEventMediaRecords(ref.eventId);
  const matchingRecords = records.filter((record) =>
    recordReferencesKey(record, ref.eventId, ref.key, deps)
  );
  if (matchingRecords.length === 0) {
    return notFound();
  }
  const isLead = await deps.isTeamLead(event.teamId, session.user.id);
  if (
    !matchingRecords.some((record) =>
      canReadEventMediaRecord(
        record,
        session,
        permissions,
        isLead,
        canViewNormally
      )
    )
  ) {
    if (!canViewNormally) {
      throw new PrivateMediaAccessError(403, "Forbidden");
    }
    return notFound();
  }
  return { key: ref.key };
}

export async function authorizeEventEditorUpload(
  session: SessionLike,
  eventId: string,
  deps: PrivateMediaAccessDeps
): Promise<PrivateMediaEvent> {
  const event = await deps.findEvent(eventId);
  if (!event) {
    throw new PrivateMediaAccessError(404, "Event not found");
  }
  const permissions = await deps.resolvePermissions(roleFor(session));
  if (
    permissions.includes("event_updates.create") ||
    (await deps.isTeamLead(event.teamId, session.user.id))
  ) {
    return event;
  }
  throw new PrivateMediaAccessError(403, "Forbidden");
}

const REQUEST_UPLOAD_PERMISSIONS = new Set([
  "requests.create",
  "requests.edit_own",
  "requests.edit_all",
  "requests.edit_all_statuses",
  "requests.record_payment",
]);

export async function authorizeProtectedUpload(
  session: SessionLike,
  scope: ProtectedUploadScope,
  deps: PrivateMediaAccessDeps
): Promise<void> {
  const permissions = await deps.resolvePermissions(roleFor(session));
  if (
    scope.kind === "request" &&
    permissions.some((permission) => REQUEST_UPLOAD_PERMISSIONS.has(permission))
  ) {
    return;
  }
  if (
    scope.kind === "approvalScreenshot" &&
    permissions.includes("requests.approve")
  ) {
    return;
  }
  if (
    scope.kind === "scheduledMessage" &&
    permissions.includes("messages.schedule")
  ) {
    return;
  }
  if (scope.kind === "vendorPaymentInvoice") {
    const ownerId = await deps.findVendorPaymentOwner(scope.vendorPaymentId);
    if (!ownerId) {
      throw new PrivateMediaAccessError(404, "Vendor payment not found");
    }
    if (
      ownerId === session.user.id ||
      permissions.includes("requests.approve")
    ) {
      return;
    }
  }
  if (scope.kind === "eventPhoto") {
    const event = await deps.findEvent(scope.eventId);
    if (!event) {
      throw new PrivateMediaAccessError(404, "Event not found");
    }
    if (
      permissions.includes("events.manage_photos") ||
      (await deps.isTeamLead(event.teamId, session.user.id)) ||
      (await deps.isEventMember(scope.eventId, session.user.id))
    ) {
      return;
    }
  }
  throw new PrivateMediaAccessError(403, "Forbidden");
}
