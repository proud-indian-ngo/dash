import { describe, expect, it } from "bun:test";

import { MAX_KALAKRITI_INVENTORY_PHOTO_SIZE_BYTES } from "@pi-dash/shared/kalakriti-inventory";

import {
  inventoryCreateSchema,
  inventoryRecordBatchSchema,
  inventoryMovementFieldsSchema,
  inventoryRecordSchema,
} from "./kalakriti-inventory-schema";

const id = "01950000-0000-7000-8000-000000000001";
const create = {
  editionId: id,
  itemId: id,
  transactionId: id,
  auditEntryId: id,
  now: 100,
  name: "Paint",
  openingQuantity: 0,
  unitPricePaise: 0,
  photo: null,
};
const movement = {
  type: "purchase" as const,
  quantity: 1,
  expectedQuantity: undefined,
  volunteerMembershipId: null,
  competitionId: null,
  notes: null,
};
const batch = {
  editionId: id,
  now: 100,
  type: "dispatch" as const,
  volunteerMembershipId: "01950000-0000-7000-8000-000000000002",
  competitionId: null,
  notes: null,
  items: [
    {
      itemId: "01950000-0000-7000-8000-000000000003",
      quantity: 2,
      transactionId: "01950000-0000-7000-8000-000000000004",
      auditEntryId: "01950000-0000-7000-8000-000000000005",
    },
  ],
};

describe("inventory command schemas", () => {
  it("accepts zero opening stock and integer paise", () => {
    expect(inventoryCreateSchema.safeParse(create).success).toBe(true);
    expect(
      inventoryCreateSchema.safeParse({
        ...create,
        openingQuantity: 4,
        unitPricePaise: 1250,
      }).success
    ).toBe(true);
  });

  it.each([
    { openingQuantity: -1 },
    { openingQuantity: 1.5 },
    { unitPricePaise: -1 },
    { unitPricePaise: 1.5 },
    { openingQuantity: 2_147_483_648 },
    { name: "  " },
  ])("rejects invalid item fields %o", (fields) => {
    expect(
      inventoryCreateSchema.safeParse({ ...create, ...fields }).success
    ).toBe(false);
  });

  it.each(["purchase", "dispatch", "return"] as const)(
    "requires positive whole-number %s quantity",
    (type) => {
      for (const quantity of [0, -1, 1.5, 2_147_483_648]) {
        expect(
          inventoryMovementFieldsSchema.safeParse({
            ...movement,
            type,
            quantity,
            volunteerMembershipId: id,
          }).success
        ).toBe(false);
      }
      expect(
        inventoryMovementFieldsSchema.safeParse({
          ...movement,
          type,
          quantity: 1,
          volunteerMembershipId: id,
        }).success
      ).toBe(true);
    }
  );

  it.each(["dispatch", "return"] as const)(
    "requires a volunteer for %s",
    (type) => {
      expect(
        inventoryMovementFieldsSchema.safeParse({ ...movement, type }).success
      ).toBe(false);
    }
  );

  it("accepts one assigned role or competition on dispatches and returns", () => {
    for (const type of ["dispatch", "return"] as const) {
      expect(
        inventoryMovementFieldsSchema.safeParse({
          ...movement,
          type,
          volunteerMembershipId: id,
          responsibility: "logistics_member",
        }).success
      ).toBe(true);
      expect(
        inventoryRecordBatchSchema.safeParse({
          ...batch,
          type,
          responsibility: "logistics_member",
        }).success
      ).toBe(true);
    }
  });

  it("rejects unknown, nonmovement, and competing assignment selections", () => {
    for (const args of [
      { type: "purchase", responsibility: "logistics_member" },
      { type: "adjustment", responsibility: "logistics_member" },
      {
        type: "dispatch",
        responsibility: "made_up_role",
        volunteerMembershipId: id,
      },
      {
        type: "dispatch",
        responsibility: "logistics_member",
        competitionId: id,
        volunteerMembershipId: id,
      },
    ]) {
      expect(
        inventoryMovementFieldsSchema.safeParse({ ...movement, ...args })
          .success
      ).toBe(false);
    }
    expect(
      inventoryRecordBatchSchema.safeParse({
        ...batch,
        responsibility: "logistics_member",
        competitionId: id,
      }).success
    ).toBe(false);
    expect(
      inventoryRecordBatchSchema.safeParse({
        ...batch,
        responsibility: "made_up_role",
      }).success
    ).toBe(false);
  });

  it("requires a reason and expected count for adjustment, including a zero target", () => {
    expect(
      inventoryMovementFieldsSchema.safeParse({
        ...movement,
        type: "adjustment",
        quantity: 0,
      }).success
    ).toBe(false);
    expect(
      inventoryMovementFieldsSchema.safeParse({
        ...movement,
        type: "adjustment",
        quantity: 0,
        notes: "Counted",
        expectedQuantity: 3,
      }).success
    ).toBe(true);
    expect(
      inventoryMovementFieldsSchema.safeParse({
        ...movement,
        type: "adjustment",
        quantity: 0,
        notes: "  ",
        expectedQuantity: 3,
      }).success
    ).toBe(false);
  });

  it("validates photo MIME type and five-megabyte size", () => {
    const photo = {
      objectKey: "temporary/photo",
      fileName: "paint.png",
      mimeType: "image/png",
      byteSize: MAX_KALAKRITI_INVENTORY_PHOTO_SIZE_BYTES,
    };
    expect(inventoryCreateSchema.safeParse({ ...create, photo }).success).toBe(
      true
    );
    expect(
      inventoryCreateSchema.safeParse({
        ...create,
        photo: { ...photo, mimeType: "application/pdf" },
      }).success
    ).toBe(false);
    expect(
      inventoryCreateSchema.safeParse({
        ...create,
        photo: { ...photo, byteSize: photo.byteSize + 1 },
      }).success
    ).toBe(false);
    expect(
      inventoryCreateSchema.safeParse({
        ...create,
        photo: { ...photo, byteSize: 0 },
      }).success
    ).toBe(false);
  });

  it("rejects malformed command IDs and timestamps", () => {
    expect(
      inventoryRecordSchema.safeParse({
        ...create,
        ...movement,
        editionId: "foreign",
      }).success
    ).toBe(false);
    expect(
      inventoryRecordSchema.safeParse({ ...create, ...movement, now: -1 })
        .success
    ).toBe(false);
  });

  it("validates dispatch and return batches with distinct item, transaction and audit IDs", () => {
    const second = {
      itemId: "01950000-0000-7000-8000-000000000006",
      quantity: 1,
      transactionId: "01950000-0000-7000-8000-000000000007",
      auditEntryId: "01950000-0000-7000-8000-000000000008",
    };
    expect(
      inventoryRecordBatchSchema.safeParse({
        ...batch,
        type: "return",
        items: [...batch.items, second],
      }).success
    ).toBe(true);
    for (const key of ["itemId", "transactionId", "auditEntryId"] as const) {
      expect(
        inventoryRecordBatchSchema.safeParse({
          ...batch,
          items: [...batch.items, { ...second, [key]: batch.items[0]![key] }],
        }).success
      ).toBe(false);
    }
  });

  it("rejects empty, oversized, invalid-quantity and missing-recipient batches", () => {
    for (const args of [
      { items: [] },
      { items: Array.from({ length: 101 }, () => batch.items[0]) },
      { items: [{ ...batch.items[0], quantity: 0 }] },
      { items: [{ ...batch.items[0], quantity: 1.5 }] },
      { items: [{ ...batch.items[0], quantity: 2_147_483_648 }] },
      { volunteerMembershipId: null },
      { type: "purchase" },
    ]) {
      expect(
        inventoryRecordBatchSchema.safeParse({ ...batch, ...args }).success
      ).toBe(false);
    }
  });
});
