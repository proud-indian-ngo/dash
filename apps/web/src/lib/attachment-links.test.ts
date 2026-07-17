import { describe, expect, it } from "vitest";
import {
  getAttachmentDownloadHref,
  getAttachmentLabel,
  getAttachmentPreviewHref,
} from "./attachment-links";

describe("getAttachmentLabel", () => {
  it("returns url for url attachment", () => {
    expect(
      getAttachmentLabel({ type: "url", url: "https://example.com" })
    ).toBe("https://example.com");
  });

  it("returns 'Attachment' when url is null", () => {
    expect(getAttachmentLabel({ type: "url", url: null })).toBe("Attachment");
  });

  it("returns filename for file attachment", () => {
    expect(
      getAttachmentLabel({
        filename: "receipt.pdf",
        objectKey: "uploads/receipt.pdf",
        type: "file",
      })
    ).toBe("receipt.pdf");
  });

  it("falls back to objectKey when filename is null", () => {
    expect(
      getAttachmentLabel({
        filename: null,
        objectKey: "uploads/doc.pdf",
        type: "file",
      })
    ).toBe("uploads/doc.pdf");
  });

  it("falls back to 'Attachment' when both null", () => {
    expect(
      getAttachmentLabel({ filename: null, objectKey: null, type: "file" })
    ).toBe("Attachment");
  });
});

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
