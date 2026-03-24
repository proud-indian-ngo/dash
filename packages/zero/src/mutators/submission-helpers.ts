import { uuidv7 } from "uuidv7";
import type z from "zod";
import type { Vendor } from "../schema";
import type {
  mutatorAttachmentSchema,
  mutatorLineItemSchema,
} from "../shared-schemas";

type AttachmentInput = z.infer<typeof mutatorAttachmentSchema>;
type LineItemInput = z.infer<typeof mutatorLineItemSchema>;

/**
 * Asserts the vendor is usable for a payment: either approved,
 * or pending and created by the same user.
 */
export function assertVendorUsable(
  vendor: Pick<Vendor, "status" | "createdBy">,
  userId: string
): void {
  if (
    vendor.status !== "approved" &&
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
    id: att.id,
    type: att.type,
    filename: att.type === "file" ? att.filename : null,
    objectKey: att.type === "file" ? att.objectKey : null,
    url: att.type === "url" ? att.url : null,
    mimeType: att.type === "file" ? (att.mimeType ?? null) : null,
    createdAt: now,
  };
}

/**
 * Builds the common (non-FK) fields for a line item insert.
 * Caller must spread and add the parent FK field.
 */
export function buildLineItemInsert(item: LineItemInput, now: number) {
  return {
    id: item.id,
    categoryId: item.categoryId,
    description: item.description,
    amount: item.amount,
    sortOrder: item.sortOrder,
    createdAt: now,
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
  | "submitted";

export function buildHistoryInsert(
  actorId: string,
  action: HistoryAction,
  now: number,
  note?: string
) {
  return {
    id: uuidv7(),
    actorId,
    action,
    note: note ?? null,
    metadata: null,
    createdAt: now,
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
  action: string
) {
  if (entity.status !== "pending") {
    throw new Error(`Only pending ${entityName}s can be ${action}`);
  }
}

export function assertCanModify(
  entity: { userId: string | null; status: string | null },
  userId: string,
  isAdmin: boolean,
  entityName: string
) {
  if (!(isAdmin || entity.userId === userId)) {
    throw new Error("Unauthorized");
  }
  if (entity.status !== "pending") {
    throw new Error(`Only pending ${entityName}s can be updated`);
  }
}

export function assertCanDelete(
  entity: { userId: string | null; status: string | null },
  userId: string,
  isAdmin: boolean
) {
  if (!(isAdmin || (entity.userId === userId && entity.status === "pending"))) {
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
  queryAttachments: () => Promise<readonly { id: string }[]>;
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
  ops: RelationInsertOps<TFK>
) {
  for (const item of lineItems) {
    await ops.insertLineItem({ ...buildLineItemInsert(item, now), ...fk });
  }
  for (const att of attachments) {
    await ops.insertAttachment({ ...buildAttachmentInsert(att, now), ...fk });
  }
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
  ops: RelationInsertOps<TFK> & RelationDeleteOps
) {
  const existingItems = await ops.queryLineItems();
  for (const item of existingItems) {
    await ops.deleteLineItem({ id: item.id });
  }
  const existingAtts = await ops.queryAttachments();
  for (const att of existingAtts) {
    await ops.deleteAttachment({ id: att.id });
  }
  await insertRelations(
    fk,
    lineItems,
    attachments,
    userId,
    "updated",
    now,
    ops
  );
}

export async function deleteAllRelations(ops: RelationDeleteAllOps) {
  const lineItems = await ops.queryLineItems();
  for (const item of lineItems) {
    await ops.deleteLineItem({ id: item.id });
  }
  const attachments = await ops.queryAttachments();
  for (const att of attachments) {
    await ops.deleteAttachment({ id: att.id });
  }
  const history = await ops.queryHistory();
  for (const h of history) {
    await ops.deleteHistory({ id: h.id });
  }
}
