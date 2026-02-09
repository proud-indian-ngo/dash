import { describe, expect, it } from "vitest";
import {
  mapAttachmentsToFormValues,
  mapLineItemsToFormValues,
} from "./submission-mappers";

describe("mapLineItemsToFormValues", () => {
  it("maps line items with numeric amounts to strings", () => {
    const result = mapLineItemsToFormValues([
      { id: "1", categoryId: "c1", description: "Taxi", amount: 150.5 },
    ]);
    expect(result).toEqual([
      { id: "1", categoryId: "c1", description: "Taxi", amount: "150.5" },
    ]);
  });

  it("maps null description to empty string", () => {
    const result = mapLineItemsToFormValues([
      { id: "1", categoryId: "c1", description: null, amount: 100 },
    ]);
    expect(result.at(0)?.description).toBe("");
  });

  it("handles string amounts", () => {
    const result = mapLineItemsToFormValues([
      { id: "1", categoryId: "c1", description: "A", amount: "200" },
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
        id: "a1",
        type: "file",
        filename: "doc.pdf",
        objectKey: "uploads/doc.pdf",
        mimeType: "application/pdf",
      },
    ]);
    expect(result).toEqual([
      {
        id: "a1",
        type: "file",
        filename: "doc.pdf",
        objectKey: "uploads/doc.pdf",
        mimeType: "application/pdf",
      },
    ]);
  });

  it("maps file attachment with null filename to fallback", () => {
    const result = mapAttachmentsToFormValues([
      {
        id: "a1",
        type: "file",
        filename: null,
        objectKey: "key",
        mimeType: null,
      },
    ]);
    expect(result[0]).toEqual({
      id: "a1",
      type: "file",
      filename: "attachment",
      objectKey: "key",
      mimeType: undefined,
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
      { id: "a1", type: "file", filename: "x.pdf", objectKey: "k1" },
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
