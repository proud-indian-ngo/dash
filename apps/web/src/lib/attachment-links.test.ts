import { describe, expect, it } from "bun:test";

import {
  getAttachmentDownloadHref,
  getAttachmentPreviewHref,
} from "./attachment-links";

describe("protected attachment links", () => {
  const attachment = {
    filename: "receipt.pdf",
    objectKey: "legacy/private/receipt.pdf",
    type: "file" as const,
  };

  it("builds a download URL from a typed persisted reference", () => {
    expect(
      getAttachmentDownloadHref(attachment, {
        id: "attachment-1",
        kind: "reimbursementAttachment",
      })
    ).toBe(
      "/api/attachments/download?id=attachment-1&kind=reimbursementAttachment"
    );
  });

  it("builds an inline preview URL from a typed persisted reference", () => {
    expect(
      getAttachmentPreviewHref(attachment, {
        id: "message-1",
        key: "legacy/private/receipt.pdf",
        kind: "scheduledMessageAttachment",
      })
    ).toBe(
      "/api/attachments/download?id=message-1&key=legacy%2Fprivate%2Freceipt.pdf&kind=scheduledMessageAttachment&disposition=inline"
    );
  });

  it("does not expose a file object key without a persisted reference", () => {
    expect(getAttachmentDownloadHref(attachment)).toBe("#");
    expect(getAttachmentPreviewHref(attachment)).toBe("#");
  });

  it("keeps external URL attachments direct", () => {
    const external = { type: "url" as const, url: "https://example.com" };
    expect(getAttachmentDownloadHref(external)).toBe("https://example.com");
    expect(getAttachmentPreviewHref(external)).toBe("https://example.com");
  });
});
