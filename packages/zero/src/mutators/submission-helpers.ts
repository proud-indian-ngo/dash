import { uuidv7 } from "uuidv7";
import type z from "zod";
import type { Context } from "../context";
import { requireEnqueue } from "../context";
import type { Vendor } from "../schema";
import type {
  mutatorAttachmentSchema,
  mutatorLineItemSchema,
} from "../shared-schemas";

type AttachmentInput = z.infer<typeof mutatorAttachmentSchema>;
type LineItemInput = z.infer<typeof mutatorLineItemSchema>;

type R2Subfolder =
  | "approval-screenshots"
  | "attachments"
  | "photos"
  | "scheduled-messages";

interface R2ObjectClaimOptions {
  asyncTasks?: Context["asyncTasks"];
  beforeCommitTasks?: Context["beforeCommitTasks"];
  copyR2Object?: Context["copyR2Object"];
  durablePrefix: string;
  enqueue?: Context["enqueue"];
  existingObjectKeys?: ReadonlySet<string>;
  mimeType?: null | string;
  r2KeyPrefix?: string;
  subfolder: R2Subfolder;
  traceId?: string;
  txLocation: string;
  userId: string;
}

type AttachmentClaimOptions = Omit<R2ObjectClaimOptions, "mimeType">;

export function createR2ClaimOptions(
  ctx: Context,
  txLocation: string,
  options: Pick<R2ObjectClaimOptions, "durablePrefix" | "subfolder"> &
    Partial<Pick<R2ObjectClaimOptions, "existingObjectKeys" | "mimeType">>
): R2ObjectClaimOptions {
  return {
    ...options,
    asyncTasks: ctx.asyncTasks,
    beforeCommitTasks: ctx.beforeCommitTasks,
    copyR2Object: ctx.copyR2Object,
    enqueue: ctx.enqueue,
    r2KeyPrefix: ctx.r2KeyPrefix,
    traceId: ctx.traceId,
    txLocation,
    userId: ctx.userId,
  };
}

export function enqueueDeleteR2Object(
  ctx: Pick<Context, "asyncTasks" | "enqueue" | "traceId">,
  txLocation: string,
  r2Key: null | string | undefined,
  meta: { mutator: string; [key: string]: unknown }
): void {
  if (txLocation !== "server" || !r2Key) {
    return;
  }
  ctx.asyncTasks?.push({
    fn: async () => {
      const enqueue = requireEnqueue(ctx);
      await enqueue("delete-r2-object", { r2Key }, { traceId: ctx.traceId });
    },
    meta,
  });
}

/**
 * Asserts the vendor is usable for a payment: either approved,
 * or pending and created by the same user.
 */
export function assertVendorUsable(
  vendor: Pick<Vendor, "status" | "createdBy">,
  userId: string,
  allowPendingFromAnyCreator = false
): void {
  if (
    vendor.status !== "approved" &&
    !(allowPendingFromAnyCreator && vendor.status === "pending") &&
    !(vendor.status === "pending" && vendor.createdBy === userId)
  ) {
    throw new Error("Vendor is not available");
  }
}

/**
 * Builds the common (non-FK) fields for an attachment insert.
 * Caller must spread and add the parent FK field.
 */
export function buildAttachmentInsert(att: AttachmentInput, now: number) {
  return {
    createdAt: now,
    filename: att.type === "file" ? att.filename : null,
    id: att.id,
    mimeType: att.type === "file" ? (att.mimeType ?? null) : null,
    objectKey: att.type === "file" ? att.objectKey : null,
    type: att.type,
    url: att.type === "url" ? att.url : null,
  };
}

const filenameFromKey = (key: string): string => key.split("/").pop() ?? "file";

function pushClaimR2ObjectTasks(
  options: R2ObjectClaimOptions,
  sourceKey: string,
  targetKey: string
): void {
  if (!options.beforeCommitTasks) {
    throw new Error("Before-commit task queue is required");
  }
  if (!options.asyncTasks) {
    throw new Error("Post-commit task queue is required");
  }
  if (!options.copyR2Object) {
    throw new Error("R2 object copy handler is required");
  }
  if (!options.enqueue) {
    throw new Error("Job enqueue handler is required");
  }
  const { copyR2Object } = options;
  options.beforeCommitTasks.push({
    fn: () =>
      copyR2Object({
        ...(options.mimeType ? { mimeType: options.mimeType } : {}),
        sourceKey,
        targetKey,
      }),
    meta: {
      mutator: "claim-r2-object",
      sourceKey,
      targetKey,
      ...(options.traceId ? { traceId: options.traceId } : {}),
    },
  });
  enqueueDeleteR2Object(options, options.txLocation, sourceKey, {
    mutator: "cleanup-claimed-r2-source",
    sourceKey,
    targetKey,
  });
}

export function claimUploadedR2ObjectKey(
  key: string,
  options: R2ObjectClaimOptions
): string {
  if (options.txLocation === "server" && !options.r2KeyPrefix) {
    throw new Error("R2 key prefix is required");
  }
  const serverPrefix =
    options.txLocation === "server" ? `${options.r2KeyPrefix}/` : null;
  if (serverPrefix && !key.startsWith(serverPrefix)) {
    throw new Error("Invalid attachment object key");
  }
  if (options.existingObjectKeys?.has(key)) {
    return key;
  }

  const serverTempPrefix = serverPrefix
    ? `${serverPrefix}${options.subfolder}/tmp/${options.userId}/`
    : null;
  const tempMarker = `/${options.subfolder}/tmp/${options.userId}/`;
  const tempMarkerIndex = key.indexOf(tempMarker);
  if (
    serverTempPrefix ? !key.startsWith(serverTempPrefix) : tempMarkerIndex < 0
  ) {
    throw new Error("Invalid attachment object key");
  }

  const storagePrefix = serverPrefix
    ? serverPrefix.slice(0, -1)
    : key.slice(0, tempMarkerIndex);
  const claimedKey = `${storagePrefix}/${options.subfolder}/${options.durablePrefix}/${filenameFromKey(key)}`;
  if (options.txLocation === "server") {
    pushClaimR2ObjectTasks(options, key, claimedKey);
  }
  return claimedKey;
}

export function buildClaimedAttachmentInsert(
  att: AttachmentInput,
  now: number,
  claimOptions?: AttachmentClaimOptions
) {
  if (att.type !== "file") {
    return buildAttachmentInsert(att, now);
  }
  if (!claimOptions) {
    throw new Error("Attachment claim options are required");
  }
  const objectKey = claimUploadedR2ObjectKey(att.objectKey, {
    ...claimOptions,
    mimeType: att.mimeType,
  });
  return buildAttachmentInsert({ ...att, objectKey }, now);
}

/**
 * Builds the common (non-FK) fields for a line item insert.
 * Caller must spread and add the parent FK field.
 */
export function buildLineItemInsert(item: LineItemInput, now: number) {
  return {
    amount: item.amount,
    categoryId: item.categoryId,
    createdAt: now,
    description: item.description,
    id: item.id,
    sortOrder: item.sortOrder,
    updatedAt: now,
  };
}

/**
 * Builds the common (non-FK) fields for a history entry insert.
 * Caller must spread and add the parent FK field.
 */
type HistoryAction =
  | "approved"
  | "rejected"
  | "created"
  | "updated"
  | "submitted"
  | "invoice_submitted"
  | "invoice_updated"
  | "invoice_approved"
  | "invoice_rejected";

export function buildHistoryInsert(
  actorId: string,
  action: HistoryAction,
  now: number,
  note?: string
) {
  return {
    action,
    actorId,
    createdAt: now,
    id: uuidv7(),
    metadata: null,
    note: note ?? null,
  };
}

// --- Submission entity guards ---

export function assertEntityExists<T>(
  entity: T | undefined,
  entityName: string
): asserts entity is T {
  if (!entity) {
    throw new Error(`${entityName} not found`);
  }
}

export function assertPending(
  entity: { status: string | null },
  entityName: string,
  action: string,
  allowAnyStatus = false
) {
  if (!allowAnyStatus && entity.status !== "pending") {
    throw new Error(`Only pending ${entityName}s can be ${action}`);
  }
}

export function assertCanModify(
  entity: { userId: string | null; status: string | null },
  userId: string,
  hasEditAll: boolean,
  entityName: string,
  allowAnyStatus = false,
  hasEditOwn = true
) {
  if (!(hasEditAll || (entity.userId === userId && hasEditOwn))) {
    throw new Error("Unauthorized");
  }
  if (!allowAnyStatus && entity.status !== "pending") {
    throw new Error(`Only pending ${entityName}s can be updated`);
  }
}

export function assertCanDelete(
  entity: { userId: string | null; status: string | null },
  userId: string,
  hasDeleteAll: boolean
) {
  if (
    !(hasDeleteAll || (entity.userId === userId && entity.status === "pending"))
  ) {
    throw new Error("Unauthorized");
  }
}

// --- Relation CRUD helpers ---

type LineItemInsertBase = ReturnType<typeof buildLineItemInsert>;
type AttachmentInsertBase = ReturnType<typeof buildAttachmentInsert>;
type HistoryInsertBase = ReturnType<typeof buildHistoryInsert>;

interface RelationInsertOps<TFK extends Record<string, string>> {
  insertAttachment: (data: AttachmentInsertBase & TFK) => Promise<unknown>;
  insertHistory: (data: HistoryInsertBase & TFK) => Promise<unknown>;
  insertLineItem: (data: LineItemInsertBase & TFK) => Promise<unknown>;
}

interface RelationDeleteOps {
  deleteAttachment: (data: { id: string }) => Promise<unknown>;
  deleteLineItem: (data: { id: string }) => Promise<unknown>;
  onDeleteAttachmentObjectKey?: (key: string) => void;
  queryAttachments: () => Promise<
    readonly { id: string; objectKey?: null | string }[]
  >;
  queryLineItems: () => Promise<readonly { id: string }[]>;
}

interface RelationDeleteAllOps extends RelationDeleteOps {
  deleteHistory: (data: { id: string }) => Promise<unknown>;
  queryHistory: () => Promise<readonly { id: string }[]>;
}

export async function insertRelations<TFK extends Record<string, string>>(
  fk: TFK,
  lineItems: readonly LineItemInput[],
  attachments: readonly AttachmentInput[],
  userId: string,
  action: HistoryAction,
  now: number,
  ops: RelationInsertOps<TFK>,
  claimOptions?: AttachmentClaimOptions
) {
  await Promise.all(
    lineItems.map(async (item) => {
      await ops.insertLineItem({ ...buildLineItemInsert(item, now), ...fk });
    })
  );
  await Promise.all(
    attachments.map(async (att) => {
      await ops.insertAttachment({
        ...buildClaimedAttachmentInsert(att, now, claimOptions),
        ...fk,
      });
    })
  );
  await ops.insertHistory({
    ...buildHistoryInsert(userId, action, now),
    ...fk,
  });
}

export async function replaceRelations<TFK extends Record<string, string>>(
  fk: TFK,
  lineItems: readonly LineItemInput[],
  attachments: readonly AttachmentInput[],
  userId: string,
  now: number,
  ops: RelationInsertOps<TFK> & RelationDeleteOps,
  claimOptions?: AttachmentClaimOptions
) {
  const existingItems = await ops.queryLineItems();
  await Promise.all(
    existingItems.map(async (item) => {
      await ops.deleteLineItem({ id: item.id });
    })
  );
  const existingAtts = await ops.queryAttachments();
  const existingObjectKeys = new Set(
    existingAtts
      .map((attachment) => attachment.objectKey)
      .filter((key): key is string => Boolean(key))
  );
  const retainedObjectKeys = new Set(
    attachments
      .filter((attachment) => attachment.type === "file")
      .map((attachment) => attachment.objectKey)
  );
  await Promise.all(
    existingAtts.map(async (att) => {
      if (att.objectKey && !retainedObjectKeys.has(att.objectKey)) {
        ops.onDeleteAttachmentObjectKey?.(att.objectKey);
      }
      await ops.deleteAttachment({ id: att.id });
    })
  );
  await insertRelations(
    fk,
    lineItems,
    attachments,
    userId,
    "updated",
    now,
    ops,
    claimOptions ? { ...claimOptions, existingObjectKeys } : undefined
  );
}

export async function deleteAllRelations(ops: RelationDeleteAllOps) {
  const lineItems = await ops.queryLineItems();
  await Promise.all(
    lineItems.map(async (item) => {
      await ops.deleteLineItem({ id: item.id });
    })
  );
  const attachments = await ops.queryAttachments();
  await Promise.all(
    attachments.map(async (att) => {
      if (att.objectKey) {
        ops.onDeleteAttachmentObjectKey?.(att.objectKey);
      }
      await ops.deleteAttachment({ id: att.id });
    })
  );
  const history = await ops.queryHistory();
  await Promise.all(
    history.map(async (h) => {
      await ops.deleteHistory({ id: h.id });
    })
  );
}
