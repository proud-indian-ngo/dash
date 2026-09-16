import { ALLOWED_IMAGE_TYPES } from "@pi-dash/shared/constants";
import { KALAKRITI_EDITION_RESPONSIBILITIES } from "@pi-dash/shared/kalakriti";
import { MAX_KALAKRITI_INVENTORY_PHOTO_SIZE_BYTES } from "@pi-dash/shared/kalakriti-inventory";
import z from "zod";

const stockQuantity = z.number().int().min(0).max(2_147_483_647);
const photoSchema = z.object({
  objectKey: z.string().min(1).max(1024),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_IMAGE_TYPES),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(MAX_KALAKRITI_INVENTORY_PHOTO_SIZE_BYTES),
});

export const inventoryItemFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  openingQuantity: stockQuantity,
  unitPricePaise: stockQuantity,
});

export const inventoryMovementFieldsSchema = z
  .object({
    type: z.enum(["purchase", "dispatch", "return", "adjustment"]),
    quantity: stockQuantity,
    expectedQuantity: stockQuantity.optional(),
    volunteerMembershipId: z.uuid().nullable(),
    competitionId: z.uuid().nullable(),
    responsibility: z
      .enum(KALAKRITI_EDITION_RESPONSIBILITIES)
      .nullable()
      .optional(),
    notes: z.string().trim().max(500).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.type !== "adjustment" && value.quantity === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Quantity must be greater than zero",
      });
    }
    if (
      (value.type === "dispatch" || value.type === "return") &&
      !value.volunteerMembershipId
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["volunteerMembershipId"],
        message: "Volunteer is required for dispatches and returns",
      });
    }
    if (value.responsibility && value.competitionId) {
      ctx.addIssue({
        code: "custom",
        path: ["responsibility"],
        message: "Choose a role or a competition",
      });
    }
    if (
      value.responsibility &&
      value.type !== "dispatch" &&
      value.type !== "return"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["responsibility"],
        message: "Roles apply only to dispatches and returns",
      });
    }
    if (value.type === "adjustment") {
      if (!value.notes)
        ctx.addIssue({
          code: "custom",
          path: ["notes"],
          message: "A reason is required for stock adjustments",
        });
      if (value.expectedQuantity === undefined)
        ctx.addIssue({
          code: "custom",
          path: ["expectedQuantity"],
          message: "The displayed stock balance is required",
        });
    }
  });

const commandFields = {
  editionId: z.uuid(),
  itemId: z.uuid(),
  auditEntryId: z.uuid(),
  now: z.number().int().nonnegative().max(8_640_000_000_000_000),
};

export const inventoryCreateSchema = inventoryItemFieldsSchema.extend({
  ...commandFields,
  transactionId: z.uuid(),
  photo: photoSchema.nullable(),
});
export const inventoryUpdateSchema = inventoryItemFieldsSchema
  .omit({ openingQuantity: true })
  .extend({
    ...commandFields,
    photo: photoSchema.nullable().optional(),
  });
export const inventoryArchiveSchema = z.object(commandFields);
export const inventoryRecordSchema = inventoryMovementFieldsSchema.safeExtend({
  ...commandFields,
  transactionId: z.uuid(),
});

export const inventoryBatchFieldsSchema = z
  .object({
    type: z.enum(["dispatch", "return"]),
    volunteerMembershipId: z.uuid(),
    competitionId: z.uuid().nullable(),
    responsibility: z
      .enum(KALAKRITI_EDITION_RESPONSIBILITIES)
      .nullable()
      .optional(),
    notes: z.string().trim().max(500).nullable(),
    items: z
      .array(
        z.object({
          itemId: z.uuid(),
          quantity: stockQuantity.positive(),
          transactionId: z.uuid(),
          auditEntryId: z.uuid(),
        })
      )
      .min(1)
      .max(100),
  })
  .superRefine(({ items, responsibility, competitionId }, ctx) => {
    if (responsibility && competitionId) {
      ctx.addIssue({
        code: "custom",
        path: ["responsibility"],
        message: "Choose a role or a competition",
      });
    }
    for (const key of ["itemId", "transactionId", "auditEntryId"] as const) {
      const seen = new Set<string>();
      for (const [index, item] of items.entries()) {
        if (seen.has(item[key])) {
          ctx.addIssue({
            code: "custom",
            path: ["items", index, key],
            message: `${key} must be unique within a batch`,
          });
        }
        seen.add(item[key]);
      }
    }
  });

export const inventoryRecordBatchSchema = inventoryBatchFieldsSchema.safeExtend(
  {
    editionId: z.uuid(),
    now: commandFields.now,
  }
);
