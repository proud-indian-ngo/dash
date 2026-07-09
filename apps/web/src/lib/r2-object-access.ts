export interface R2ObjectAccessDeps {
  isEventMember: (eventId: string, userId: string) => Promise<boolean>;
  isTeamLead: (teamId: string, userId: string) => Promise<boolean>;
  isTeamMember: (teamId: string, userId: string) => Promise<boolean>;
  resolvePermissions: (role: string) => Promise<string[]>;
}

export interface RequestR2ObjectRecord {
  access: "request";
  filename: string;
  key: string;
  ownerUserIds: readonly string[];
}

export interface ScheduledMessageR2ObjectRecord {
  access: "scheduledMessage";
  createdBy: string;
  filename: string;
  key: string;
}

export interface EventPhotoR2ObjectRecord {
  access: "eventPhoto";
  eventId: string;
  eventIsPublic: boolean;
  filename: string;
  key: string;
  status: "approved" | "pending" | "rejected";
  teamId: string;
  uploadedBy: string;
}

export type R2ObjectRecord =
  | EventPhotoR2ObjectRecord
  | RequestR2ObjectRecord
  | ScheduledMessageR2ObjectRecord;

interface SessionLike {
  user: { id: string; role?: null | string };
}

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

const TEMP_KEY_SEGMENT = /(^|\/)tmp\//;

const getRole = (session: SessionLike): string =>
  session.user.role ?? "unoriented_volunteer";

async function canReadRequestObject(
  session: SessionLike,
  record: RequestR2ObjectRecord,
  deps: R2ObjectAccessDeps
): Promise<boolean> {
  if (record.ownerUserIds.includes(session.user.id)) {
    return true;
  }
  const permissions = await deps.resolvePermissions(getRole(session));
  return permissions.includes("requests.view_all");
}

async function canReadScheduledMessageObject(
  session: SessionLike,
  record: ScheduledMessageR2ObjectRecord,
  deps: R2ObjectAccessDeps
): Promise<boolean> {
  if (record.createdBy === session.user.id) {
    return true;
  }
  const permissions = await deps.resolvePermissions(getRole(session));
  return permissions.includes("messages.schedule");
}

async function canReadEventPhoto(
  session: SessionLike,
  record: EventPhotoR2ObjectRecord,
  deps: R2ObjectAccessDeps
): Promise<boolean> {
  const isOwnPending =
    record.status === "pending" && record.uploadedBy === session.user.id;
  const isApprovedPublic = record.status === "approved" && record.eventIsPublic;
  if (isOwnPending || isApprovedPublic) {
    return true;
  }

  const permissions = await deps.resolvePermissions(getRole(session));
  if (
    permissions.includes("events.view_all") ||
    permissions.includes("events.manage_photos") ||
    (await deps.isTeamLead(record.teamId, session.user.id))
  ) {
    return true;
  }
  if (record.status !== "approved") {
    return false;
  }
  if (await deps.isEventMember(record.eventId, session.user.id)) {
    return true;
  }
  return deps.isTeamMember(record.teamId, session.user.id);
}

export async function authorizeR2Object(
  session: SessionLike,
  record: R2ObjectRecord,
  deps: R2ObjectAccessDeps
): Promise<ResolvedR2Object> {
  if (TEMP_KEY_SEGMENT.test(record.key)) {
    throw new R2ObjectAccessError(404, "Object not found");
  }
  let allowed: boolean;
  if (record.access === "request") {
    allowed = await canReadRequestObject(session, record, deps);
  } else if (record.access === "scheduledMessage") {
    allowed = await canReadScheduledMessageObject(session, record, deps);
  } else {
    allowed = await canReadEventPhoto(session, record, deps);
  }
  if (!allowed) {
    throw new R2ObjectAccessError(403, "Forbidden");
  }
  return { filename: record.filename, key: record.key };
}
