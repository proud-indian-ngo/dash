import { describe, expect, it } from "vitest";

import { formatExportAttachments } from "./export-attachments";

describe("formatExportAttachments", () => {
  it("turns exported file attachments into absolute authorized download links", () => {
    expect(
      formatExportAttachments(
        [
          {
            filename: "receipt.pdf",
            id: "attachment-id",
            kind: "reimbursementAttachment",
            mimeType: "application/pdf",
            type: "file",
            url: null,
          },
        ],
        "https://dash.example.test"
      )
    ).toBe(
      "https://dash.example.test/api/attachments/download?filename=receipt.pdf&id=attachment-id&kind=reimbursementAttachment"
    );
  });

  it("keeps exported URL attachments as direct links", () => {
    expect(
      formatExportAttachments(
        [
          {
            filename: null,
            id: "attachment-id",
            kind: "advancePaymentAttachment",
            mimeType: null,
            type: "url",
            url: "https://example.test/receipt",
          },
        ],
        "https://dash.example.test"
      )
    ).toBe("https://example.test/receipt");
  });
});
