import { describe, expect, it } from "vitest";
import {
  formatExportAttachmentLinks,
  groupExportAttachments,
  isExportableAttachment,
} from "./export-attachments";

describe("formatExportAttachmentLinks", () => {
  it("returns absolute authenticated links for file attachments", () => {
    expect(
      formatExportAttachmentLinks(
        [
          {
            filename: "receipt.pdf",
            id: "attachment-1",
            kind: "reimbursementAttachment",
            mimeType: "application/pdf",
            type: "file",
            url: null,
          },
        ],
        "https://dash.example.test"
      )
    ).toBe(
      "https://dash.example.test/api/attachments/download?id=attachment-1&kind=reimbursementAttachment"
    );
  });

  it("keeps external URL attachments and drops empty URLs", () => {
    expect(
      formatExportAttachmentLinks(
        [
          {
            filename: null,
            id: "url-1",
            kind: "advancePaymentAttachment",
            mimeType: null,
            type: "url",
            url: "https://example.com/document",
          },
          {
            filename: null,
            id: "url-2",
            kind: "advancePaymentAttachment",
            mimeType: null,
            type: "url",
            url: null,
          },
        ],
        "https://dash.example.test"
      )
    ).toBe("https://example.com/document");
  });

  it("omits legacy file rows without an object key", () => {
    expect(isExportableAttachment({ objectKey: null, type: "file" })).toBe(
      false
    );
    expect(
      isExportableAttachment({ objectKey: "legacy/receipt.pdf", type: "file" })
    ).toBe(true);
    expect(isExportableAttachment({ objectKey: null, type: "url" })).toBe(true);
  });

  it("groups only exportable rows with the configured attachment kind", () => {
    const grouped = groupExportAttachments(
      [
        {
          filename: "missing.pdf",
          id: "missing-file",
          mimeType: "application/pdf",
          objectKey: null,
          parentId: "request-1",
          type: "file" as const,
          url: null,
        },
        {
          filename: "receipt.pdf",
          id: "file-1",
          mimeType: "application/pdf",
          objectKey: "legacy/receipt.pdf",
          parentId: "request-1",
          type: "file" as const,
          url: null,
        },
      ],
      "reimbursementAttachment"
    );

    expect(grouped.get("request-1")).toEqual([
      {
        filename: "receipt.pdf",
        id: "file-1",
        kind: "reimbursementAttachment",
        mimeType: "application/pdf",
        type: "file",
        url: null,
      },
    ]);

    const advanceGrouped = groupExportAttachments(
      [
        {
          filename: null,
          id: "url-1",
          mimeType: null,
          objectKey: null,
          parentId: "advance-1",
          type: "url" as const,
          url: "https://example.test/invoice",
        },
      ],
      "advancePaymentAttachment"
    );
    expect(advanceGrouped.get("advance-1")?.[0]?.kind).toBe(
      "advancePaymentAttachment"
    );
  });
});
