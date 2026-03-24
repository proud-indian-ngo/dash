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
