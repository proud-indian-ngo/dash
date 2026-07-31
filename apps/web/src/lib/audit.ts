import { db } from "@pi-dash/db";
import type { AuditMetadata, AuditOutcome } from "@pi-dash/db/schema/audit-log";
import { auditLog } from "@pi-dash/db/schema/audit-log";
import { user } from "@pi-dash/db/schema/auth";
import { role } from "@pi-dash/db/schema/permission";
import { parseTraceparent } from "@pi-dash/observability/trace-context";
import { and, eq, inArray } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { uuidv7 } from "uuidv7";

export interface AuditActor {
  impersonatorName?: string;
  impersonatorUserId?: string;
  name: string;
  role: string;
  userId: string;
}

export interface AuditTarget {
  id?: string;
  type?: string;
}

export interface AuditActionOptions {
  action: string;
  actor: AuditActor;
  metadata?: AuditMetadata;
  target?: AuditTarget;
  traceId?: string;
}

export type FinalAuditOutcome = Exclude<AuditOutcome, "pending">;

export interface AuditStore {
  finalize: (
    id: string,
    outcome: FinalAuditOutcome,
    target?: AuditTarget
  ) => Promise<void>;
  insert: (entry: ReturnType<typeof buildAuditEntry>) => Promise<void>;
}

interface SessionLike {
  session?: { impersonatedBy?: string | null };
  user: { id: string; name?: string | null; role?: string | null };
}

const MAX_ID_VALUES = 50;
const MAX_CHANGED_FIELDS = 100;
const MAX_FIELD_NAME_LENGTH = 80;
const FINALIZE_ATTEMPTS = 3;
const SAFE_IDENTIFIER_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_USER_ID_PATTERN = /^[A-Za-z0-9]{32}$/;
const SENSITIVE_ID_KEY_PATTERN = /(password|secret|token|key|url)/i;
const SAFE_ROLE_ID_PATTERN = /^[a-z][a-z0-9_]{0,49}$/;
const SAFE_TARGET_TYPE_PATTERN = /^[a-z][A-Za-z0-9_.-]{0,63}$/;
const SAFE_CHANGED_FIELD_NAMES = new Set([
  "accountName",
  "accountNumber",
  "address",
  "amount",
  "archived",
  "attachments",
  "attendance",
  "attendanceMarkedAt",
  "attendanceMarkedBy",
  "bankAccountIfscCode",
  "bankAccountName",
  "bankAccountNumber",
  "cancelledAt",
  "caption",
  "categoryId",
  "channel",
  "city",
  "contactEmail",
  "contactPhone",
  "content",
  "createdAt",
  "createdBy",
  "description",
  "email",
  "emailEnabled",
  "enabled",
  "endTime",
  "eventId",
  "exdates",
  "expenseDate",
  "feedbackDeadline",
  "feedbackEnabled",
  "feedbackId",
  "fileName",
  "filename",
  "generateVoucher",
  "gstNumber",
  "id",
  "ifscCode",
  "immichAssetId",
  "inboxEnabled",
  "inheritVolunteers",
  "invoiceDate",
  "invoiceNumber",
  "invoiceRejectionReason",
  "isBackdated",
  "isDefault",
  "isPublic",
  "jid",
  "label",
  "lineItems",
  "location",
  "memberId",
  "members",
  "metadata",
  "mimeType",
  "mode",
  "name",
  "newAmountCents",
  "note",
  "occDate",
  "originalDate",
  "overrides",
  "panNumber",
  "password",
  "paymentMethod",
  "paymentReference",
  "phone",
  "photoIds",
  "postEventNudgesEnabled",
  "postRsvpPoll",
  "read",
  "reason",
  "recipientId",
  "recipients",
  "recurrenceRule",
  "reimbursementId",
  "rejectionReason",
  "reminderIntervals",
  "reminderTarget",
  "reviewedAt",
  "reviewedBy",
  "role",
  "rrule",
  "rsvpPollLeadMinutes",
  "scheduledAt",
  "scheduledMessageId",
  "seriesId",
  "sortOrder",
  "startTime",
  "status",
  "submissionId",
  "submittedAt",
  "teamId",
  "title",
  "topicId",
  "transactionDate",
  "type",
  "updatedAt",
  "uploadedBy",
  "userId",
  "userIds",
  "value",
  "vendorId",
  "vendorPaymentId",
  "voucherAttachmentId",
  "whatsappEnabled",
  "whatsappGroupId",
]);

type ResolveExistingIds = (
  candidates: readonly string[]
) => Promise<ReadonlySet<string>>;

export class AuditFinalizationError extends Error {}

export function getAuditTraceId(headers?: Headers): string | undefined {
  return parseTraceparent(headers?.get("traceparent") ?? null)?.traceId;
}

export async function buildAuditActor(
  session: SessionLike
): Promise<AuditActor> {
  const impersonatorUserId = session.session?.impersonatedBy ?? undefined;
  let impersonatorName: string | undefined;

  if (impersonatorUserId) {
    impersonatorName = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, impersonatorUserId))
      .limit(1)
      .then((rows) => rows[0]?.name);
  }

  return snapshotAuditActor(session, impersonatorName);
}

export function snapshotAuditActor(
  session: SessionLike,
  impersonatorName?: string
): AuditActor {
  const impersonatorUserId = session.session?.impersonatedBy ?? undefined;
  return {
    name: session.user.name?.trim() || session.user.id,
    role: session.user.role ?? "unoriented_volunteer",
    userId: session.user.id,
    ...(impersonatorUserId ? { impersonatorUserId } : {}),
    ...(impersonatorName ? { impersonatorName } : {}),
  };
}

export function classifyAuditError(error: unknown): FinalAuditOutcome {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message === "unauthorized" || message === "forbidden") {
      return "denied";
    }
  }
  return "failure";
}

export function classifyAuditResponse(response: Response): FinalAuditOutcome {
  if (response.ok) {
    return "success";
  }
  return response.status === 401 || response.status === 403
    ? "denied"
    : "failure";
}

export function buildAuditEntry(
  options: AuditActionOptions,
  outcome: AuditOutcome,
  id = uuidv7()
) {
  const target = sanitizeAuditTarget(options.target);
  return {
    action: options.action,
    actorName: options.actor.name,
    actorRole: options.actor.role,
    actorUserId: options.actor.userId,
    completedAt: outcome === "pending" ? null : new Date(),
    id,
    impersonatorName: options.actor.impersonatorName ?? null,
    impersonatorUserId: options.actor.impersonatorUserId ?? null,
    metadata: options.metadata ?? {},
    outcome,
    targetId: target?.id ?? null,
    targetType: target?.type ?? null,
    traceId: options.traceId ?? null,
  };
}

export function sanitizeAuditTarget(
  target: AuditTarget | undefined
): AuditTarget | undefined {
  if (!target) {
    return;
  }
  const type =
    target.type && SAFE_TARGET_TYPE_PATTERN.test(target.type)
      ? target.type
      : undefined;
  const id =
    target.id &&
    type &&
    (type === "role"
      ? SAFE_ROLE_ID_PATTERN.test(target.id)
      : SAFE_IDENTIFIER_PATTERN.test(target.id) ||
        (type === "user" && SAFE_USER_ID_PATTERN.test(target.id)))
      ? target.id
      : undefined;
  return id || type ? { ...(id ? { id } : {}), ...(type ? { type } : {}) } : {};
}

function auditFailureLog(
  event: "audit_write_failed" | "audit_finalize_failed",
  options: AuditActionOptions,
  error: unknown,
  auditId?: string
) {
  const log = createRequestLogger({
    path: "audit",
    requestId: options.traceId,
  });
  log.set({
    action: options.action,
    actorUserId: options.actor.userId,
    auditId,
    event,
  });
  log.error(error instanceof Error ? error : String(error));
  log.emit();
}

const databaseAuditStore: AuditStore = {
  async finalize(id, outcome, target) {
    const finalTarget = sanitizeAuditTarget(target);
    const updated = await db
      .update(auditLog)
      .set({
        completedAt: new Date(),
        outcome,
        ...(finalTarget?.id ? { targetId: finalTarget.id } : {}),
        ...(finalTarget?.type ? { targetType: finalTarget.type } : {}),
      })
      .where(and(eq(auditLog.id, id), eq(auditLog.outcome, "pending")))
      .returning({ id: auditLog.id });
    if (updated.length !== 1) {
      throw new Error("Audit entry is missing or already finalized");
    }
  },
  async insert(entry) {
    await db.insert(auditLog).values(entry);
  },
};

export function createAuditedActionRunner(store: AuditStore) {
  return async function executeAuditedAction<T>(
    options: AuditActionOptions,
    execute: () => Promise<T>,
    classifyResult?: (result: T) => FinalAuditOutcome | undefined,
    resolveSuccessTarget?: (
      result: T
    ) => AuditTarget | undefined | Promise<AuditTarget | undefined>
  ): Promise<T> {
    const auditId = uuidv7();
    try {
      await store.insert(buildAuditEntry(options, "pending", auditId));
    } catch (error) {
      auditFailureLog("audit_write_failed", options, error, auditId);
      throw error;
    }

    let result: T;
    let outcome: FinalAuditOutcome;
    try {
      result = await execute();
      outcome = classifyResult?.(result) ?? "success";
    } catch (error) {
      outcome = classifyAuditError(error);
      try {
        await finalizeWithRetry(store, auditId, outcome);
      } catch (finalizeError) {
        auditFailureLog(
          "audit_finalize_failed",
          options,
          finalizeError,
          auditId
        );
      }
      throw error;
    }

    try {
      const finalTarget =
        outcome === "success"
          ? await resolveSuccessTarget?.(result)
          : undefined;
      await finalizeWithRetry(store, auditId, outcome, finalTarget);
    } catch (error) {
      auditFailureLog("audit_finalize_failed", options, error, auditId);
      throw new AuditFinalizationError(
        "The action completed, but its audit entry could not be finalized",
        { cause: error }
      );
    }
    return result;
  };
}

async function finalizeWithRetry(
  store: AuditStore,
  id: string,
  outcome: FinalAuditOutcome,
  target?: AuditTarget,
  attemptsRemaining = FINALIZE_ATTEMPTS
): Promise<void> {
  try {
    if (target) {
      await store.finalize(id, outcome, target);
    } else {
      await store.finalize(id, outcome);
    }
  } catch (error) {
    if (attemptsRemaining <= 1) {
      throw error;
    }
    await finalizeWithRetry(store, id, outcome, target, attemptsRemaining - 1);
  }
}

export const runAuditedAction = createAuditedActionRunner(databaseAuditStore);

export async function runSessionAuditedAction<T>(
  session: SessionLike,
  headers: Headers | undefined,
  options: Omit<AuditActionOptions, "actor" | "traceId">,
  execute: () => Promise<T>,
  classifyResult?: (result: T) => FinalAuditOutcome | undefined,
  resolveSuccessTarget?: (
    result: T
  ) => AuditTarget | undefined | Promise<AuditTarget | undefined>
): Promise<T> {
  const actor = await buildAuditActor(session);
  const target = await resolveSessionAuditTarget(
    options.target,
    session.user.id
  );
  return runAuditedAction(
    {
      ...options,
      actor,
      target,
      traceId: getAuditTraceId(headers),
    },
    execute,
    classifyResult,
    resolveSuccessTarget
      ? async (result) =>
          resolveSessionAuditTarget(
            await resolveSuccessTarget(result),
            session.user.id
          )
      : undefined
  );
}

export async function resolveSessionAuditTarget(
  target: AuditTarget | undefined,
  sessionUserId: string,
  resolveExistingUserIds: ResolveExistingIds = findExistingUserIds,
  resolveExistingRoleIds: ResolveExistingIds = findExistingRoleIds
): Promise<AuditTarget | undefined> {
  const sanitized = sanitizeAuditTarget(target);
  if (sanitized?.type === "role" && sanitized.id) {
    const existing = await resolveExistingRoleIds([sanitized.id]);
    return existing.has(sanitized.id) ? sanitized : { type: sanitized.type };
  }
  if (
    sanitized?.type !== "user" ||
    !sanitized.id ||
    !SAFE_USER_ID_PATTERN.test(sanitized.id) ||
    sanitized.id === sessionUserId
  ) {
    return sanitized;
  }

  const existing = await resolveExistingUserIds([sanitized.id]);
  return existing.has(sanitized.id) ? sanitized : { type: sanitized.type };
}

async function findExistingUserIds(
  candidates: readonly string[]
): Promise<ReadonlySet<string>> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.id, candidates));
  return new Set(rows.map((row) => row.id));
}

async function findExistingRoleIds(
  candidates: readonly string[]
): Promise<ReadonlySet<string>> {
  const rows = await db
    .select({ id: role.id })
    .from(role)
    .where(inArray(role.id, candidates));
  return new Set(rows.map((row) => row.id));
}

export interface ZeroAuditSummary {
  metadata: AuditMetadata;
  target?: AuditTarget;
}

function isSafeRelatedIdKey(key: string): boolean {
  return (
    (key === "id" || key.endsWith("Id") || key.endsWith("Ids")) &&
    !SENSITIVE_ID_KEY_PATTERN.test(key)
  );
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && SAFE_IDENTIFIER_PATTERN.test(value);
}

function isSafeRelatedIdentifier(
  key: string,
  value: unknown,
  knownUserIds: ReadonlySet<string>
): value is string {
  return (
    isSafeIdentifier(value) ||
    ((key === "userId" || key === "userIds") &&
      typeof value === "string" &&
      knownUserIds.has(value))
  );
}

function collectRelatedIds(
  values: Record<string, unknown>,
  knownUserIds: ReadonlySet<string>
) {
  const relatedIds: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!isSafeRelatedIdKey(key)) {
      continue;
    }
    if (isSafeRelatedIdentifier(key, value, knownUserIds)) {
      relatedIds[key] = value;
    } else if (Array.isArray(value)) {
      const safeValues = value
        .filter((item) => isSafeRelatedIdentifier(key, item, knownUserIds))
        .slice(0, MAX_ID_VALUES);
      if (safeValues.length > 0) {
        relatedIds[key] = safeValues;
      }
    }
  }
  return relatedIds;
}

export function summarizeZeroMutation(
  action: string,
  args: unknown,
  actorUserId: string,
  knownUserIds: ReadonlySet<string> = new Set()
): ZeroAuditSummary {
  const namespace = action.split(".")[0] || "mutation";
  if (!(args && typeof args === "object" && !Array.isArray(args))) {
    return { metadata: {}, target: { type: namespace } };
  }

  const values = args as Record<string, unknown>;
  const relatedIds = collectRelatedIds(values, knownUserIds);
  const changedFields = Object.keys(values)
    .filter(
      (key) =>
        key.length <= MAX_FIELD_NAME_LENGTH && SAFE_CHANGED_FIELD_NAMES.has(key)
    )
    .sort()
    .slice(0, MAX_CHANGED_FIELDS);

  const primaryKey =
    (isSafeIdentifier(values.id) && "id") ||
    Object.keys(relatedIds).find((key) => key !== "userId") ||
    (isSafeRelatedIdentifier("userId", values.userId, knownUserIds) &&
    values.userId !== actorUserId
      ? "userId"
      : undefined);
  const primaryValue = primaryKey ? relatedIds[primaryKey] : undefined;
  const targetId = typeof primaryValue === "string" ? primaryValue : undefined;

  const metadata: AuditMetadata = { changedFields };
  if (Object.keys(relatedIds).length > 0) {
    metadata.relatedIds = relatedIds;
  }
  const batchIds = Object.values(relatedIds).find(Array.isArray);
  if (batchIds) {
    metadata.batchCount = batchIds.length;
  }

  return {
    metadata,
    target: {
      ...(targetId ? { id: targetId } : {}),
      type: primaryKey === "userId" ? "user" : namespace,
    },
  };
}

export async function resolveZeroAuditSummary(
  action: string,
  args: unknown,
  actorUserId: string,
  resolveExistingUserIds: ResolveExistingIds = findExistingUserIds
): Promise<ZeroAuditSummary> {
  const candidates = collectZeroUserIdCandidates(args);
  if (candidates.length === 0) {
    return summarizeZeroMutation(action, args, actorUserId);
  }
  const knownUserIds = await resolveExistingUserIds(candidates);
  return summarizeZeroMutation(action, args, actorUserId, knownUserIds);
}

function collectZeroUserIdCandidates(args: unknown): string[] {
  if (!(args && typeof args === "object" && !Array.isArray(args))) {
    return [];
  }
  const candidates = new Set<string>();
  for (const [key, value] of Object.entries(args)) {
    if (key !== "userId" && key !== "userIds") {
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item === "string" && SAFE_USER_ID_PATTERN.test(item)) {
        candidates.add(item);
      }
      if (candidates.size >= MAX_ID_VALUES) {
        return [...candidates];
      }
    }
  }
  return [...candidates];
}

export function buildZeroAuditEntry(
  options: AuditActionOptions,
  id = uuidv7(),
  now = Date.now()
) {
  const target = sanitizeAuditTarget(options.target);
  return {
    action: options.action,
    actorName: options.actor.name,
    actorRole: options.actor.role,
    actorUserId: options.actor.userId,
    attemptedAt: now,
    completedAt: now,
    id,
    impersonatorName: options.actor.impersonatorName,
    impersonatorUserId: options.actor.impersonatorUserId,
    metadata: options.metadata ?? {},
    outcome: "success" as const,
    targetId: target?.id,
    targetType: target?.type,
    traceId: options.traceId,
  };
}

export async function runZeroAuditedMutation<T>(
  options: AuditActionOptions,
  execute: () => Promise<T>,
  insertSuccess: (
    entry: ReturnType<typeof buildZeroAuditEntry>
  ) => Promise<void>,
  insertFailure: typeof recordFinalAudit = recordFinalAudit
): Promise<T> {
  try {
    const result = await execute();
    await insertSuccess(buildZeroAuditEntry(options));
    return result;
  } catch (error) {
    await insertFailure(options, classifyAuditError(error));
    throw error;
  }
}

export async function recordFinalAudit(
  options: AuditActionOptions,
  outcome: FinalAuditOutcome
): Promise<void> {
  try {
    await databaseAuditStore.insert(buildAuditEntry(options, outcome));
  } catch (error) {
    auditFailureLog("audit_write_failed", options, error);
    throw error;
  }
}
