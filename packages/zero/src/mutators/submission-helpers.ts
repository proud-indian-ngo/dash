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
  await Promise.all(
    lineItems.map(async (item) => {
      await ops.insertLineItem({ ...buildLineItemInsert(item, now), ...fk });
    })
  );
  await Promise.all(
    attachments.map(async (att) => {
      await ops.insertAttachment({ ...buildAttachmentInsert(att, now), ...fk });
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
  ops: RelationInsertOps<TFK> & RelationDeleteOps
) {
  const existingItems = await ops.queryLineItems();
  await Promise.all(
    existingItems.map(async (item) => {
      await ops.deleteLineItem({ id: item.id });
    })
  );
  const existingAtts = await ops.queryAttachments();
  await Promise.all(
    existingAtts.map(async (att) => {
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
    ops
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
