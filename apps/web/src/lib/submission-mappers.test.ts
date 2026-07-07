import { describe, expect, it } from "vitest";
import {
  mapAttachmentsToFormValues,
  mapLineItemsToFormValues,
} from "./submission-mappers";

describe("mapLineItemsToFormValues", () => {
  it("maps line items with numeric amounts to strings", () => {
    const result = mapLineItemsToFormValues([
      { amount: 150.5, categoryId: "c1", description: "Taxi", id: "1" },
    ]);
    expect(result).toEqual([
      {
        amount: "150.5",
        categoryId: "c1",
        description: "Taxi",
        generateVoucher: false,
        id: "1",
      },
    ]);
  });

  it("maps null description to empty string", () => {
    const result = mapLineItemsToFormValues([
      { amount: 100, categoryId: "c1", description: null, id: "1" },
    ]);
    expect(result.at(0)?.description).toBe("");
  });

  it("handles string amounts", () => {
    const result = mapLineItemsToFormValues([
      { amount: "200", categoryId: "c1", description: "A", id: "1" },
    ]);
    expect(result.at(0)?.amount).toBe("200");
  });

  it("returns empty array for empty input", () => {
    expect(mapLineItemsToFormValues([])).toEqual([]);
  });
});

describe("mapAttachmentsToFormValues", () => {
  it("maps file attachment with all fields", () => {
    const result = mapAttachmentsToFormValues([
      {
        filename: "doc.pdf",
        id: "a1",
        mimeType: "application/pdf",
        objectKey: "uploads/doc.pdf",
        type: "file",
      },
    ]);
    expect(result).toEqual([
      {
        filename: "doc.pdf",
        id: "a1",
        mimeType: "application/pdf",
        objectKey: "uploads/doc.pdf",
        type: "file",
      },
    ]);
  });

  it("maps file attachment with null filename to fallback", () => {
    const result = mapAttachmentsToFormValues([
      {
        filename: null,
        id: "a1",
        mimeType: null,
        objectKey: "key",
        type: "file",
      },
    ]);
    expect(result[0]).toEqual({
      filename: "attachment",
      id: "a1",
      mimeType: undefined,
      objectKey: "key",
      type: "file",
    });
  });

  it("maps url attachment", () => {
    const result = mapAttachmentsToFormValues([
      { id: "a2", type: "url", url: "https://example.com" },
    ]);
    expect(result).toEqual([
      { id: "a2", type: "url", url: "https://example.com" },
    ]);
  });

  it("maps url attachment with null url to empty string", () => {
    const result = mapAttachmentsToFormValues([
      { id: "a2", type: "url", url: null },
    ]);
    expect(result[0]).toEqual({ id: "a2", type: "url", url: "" });
  });

  it("handles mixed attachments", () => {
    const result = mapAttachmentsToFormValues([
      { filename: "x.pdf", id: "a1", objectKey: "k1", type: "file" },
      { id: "a2", type: "url", url: "https://test.com" },
    ]);
    expect(result).toHaveLength(2);
    expect(result.at(0)?.type).toBe("file");
    expect(result.at(1)?.type).toBe("url");
  });

  it("returns empty array for empty input", () => {
    expect(mapAttachmentsToFormValues([])).toEqual([]);
  });
});
