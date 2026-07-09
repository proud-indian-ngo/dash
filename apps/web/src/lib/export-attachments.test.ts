import { describe, expect, it } from "vitest";
import { formatExportAttachmentLinks } from "./export-attachments";

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
});
