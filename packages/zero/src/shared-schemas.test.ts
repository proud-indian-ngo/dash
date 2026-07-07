import { describe, expect, it } from "vitest";
import {
  mutatorAttachmentSchema,
  mutatorLineItemSchema,
} from "./shared-schemas";

describe("mutatorLineItemSchema", () => {
  const valid = {
    amount: 150.5,
    categoryId: "cat-1",
    description: "Taxi fare",
    id: "li-1",
    sortOrder: 0,
  };

  it("accepts valid line item", () => {
    expect(mutatorLineItemSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects zero amount", () => {
    expect(
      mutatorLineItemSchema.safeParse({ ...valid, amount: 0 }).success
    ).toBe(false);
  });

  it("rejects negative amount", () => {
    expect(
      mutatorLineItemSchema.safeParse({ ...valid, amount: -10 }).success
    ).toBe(false);
  });

  it("rejects amount with more than 2 decimal places", () => {
    expect(
      mutatorLineItemSchema.safeParse({ ...valid, amount: 10.123 }).success
    ).toBe(false);
  });

  it("rejects empty description", () => {
    expect(
      mutatorLineItemSchema.safeParse({ ...valid, description: "" }).success
    ).toBe(false);
  });

  it("rejects whitespace-only description", () => {
    expect(
      mutatorLineItemSchema.safeParse({ ...valid, description: "   " }).success
    ).toBe(false);
  });
});

describe("mutatorAttachmentSchema", () => {
  it("accepts valid file attachment", () => {
    const result = mutatorAttachmentSchema.safeParse({
      filename: "receipt.pdf",
      id: "att-1",
      objectKey: "uploads/receipt.pdf",
      type: "file",
    });
    expect(result.success).toBe(true);
  });

  it("accepts file attachment with mimeType", () => {
    const result = mutatorAttachmentSchema.safeParse({
      filename: "photo.jpg",
      id: "att-1",
      mimeType: "image/jpeg",
      objectKey: "uploads/photo.jpg",
      type: "file",
    });
    expect(result.success).toBe(true);
  });

  it("rejects file attachment without filename", () => {
    const result = mutatorAttachmentSchema.safeParse({
      filename: "",
      id: "att-1",
      objectKey: "uploads/x.pdf",
      type: "file",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid URL attachment", () => {
    const result = mutatorAttachmentSchema.safeParse({
      id: "att-2",
      type: "url",
      url: "https://example.com/doc.pdf",
    });
    expect(result.success).toBe(true);
  });

  it("rejects URL attachment with invalid URL", () => {
    const result = mutatorAttachmentSchema.safeParse({
      id: "att-2",
      type: "url",
      url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});
