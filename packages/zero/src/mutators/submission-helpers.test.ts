import { describe, expect, it } from "vitest";
import {
  buildAttachmentInsert,
  buildHistoryInsert,
  buildLineItemInsert,
} from "./submission-helpers";

const NOW = 1_700_000_000_000;

describe("buildAttachmentInsert", () => {
  it("builds insert for file type attachment", () => {
    const result = buildAttachmentInsert(
      {
        id: "att-1",
        type: "file",
        filename: "receipt.pdf",
        objectKey: "uploads/receipt.pdf",
        mimeType: "application/pdf",
      },
      NOW
    );

    expect(result).toEqual({
      id: "att-1",
      type: "file",
      filename: "receipt.pdf",
      objectKey: "uploads/receipt.pdf",
      url: null,
      mimeType: "application/pdf",
      createdAt: NOW,
    });
  });

  it("builds insert for url type attachment", () => {
    const result = buildAttachmentInsert(
      {
        id: "att-2",
        type: "url",
        url: "https://example.com/receipt.png",
      },
      NOW
    );

    expect(result).toEqual({
      id: "att-2",
      type: "url",
      filename: null,
      objectKey: null,
      url: "https://example.com/receipt.png",
      mimeType: null,
      createdAt: NOW,
    });
  });
});

describe("buildLineItemInsert", () => {
  it("builds insert with all fields", () => {
    const result = buildLineItemInsert(
      {
        id: "li-1",
        categoryId: "cat-1",
        description: "Office supplies",
        amount: 4299,
        sortOrder: 0,
        generateVoucher: false,
      },
      NOW
    );

    expect(result).toEqual({
      id: "li-1",
      categoryId: "cat-1",
      description: "Office supplies",
      amount: 4299,
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("passes description through", () => {
    const result = buildLineItemInsert(
      {
        id: "li-2",
        categoryId: "cat-1",
        description: "Travel expenses",
        amount: 1000,
        sortOrder: 1,
        generateVoucher: false,
      },
      NOW
    );

    expect(result.description).toBe("Travel expenses");
  });
});

describe("buildHistoryInsert", () => {
  it("builds insert with note", () => {
    const result = buildHistoryInsert(
      "user-1",
      "submitted",
      NOW,
      "Initial submission"
    );

    expect(result).toMatchObject({
      actorId: "user-1",
      action: "submitted",
      note: "Initial submission",
      metadata: null,
      createdAt: NOW,
    });
    expect(result.id).toBeDefined();
  });

  it("defaults note to null when omitted", () => {
    const result = buildHistoryInsert("user-1", "approved", NOW);

    expect(result.note).toBeNull();
  });
});
