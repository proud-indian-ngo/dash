import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/env/web", () => ({
  env: {
    VITE_CDN_URL: "http://localhost",
    VITE_ZERO_URL: "http://localhost",
  },
}));

import {
  getAttachmentDownloadHref,
  getAttachmentLabel,
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

describe("getAttachmentDownloadHref", () => {
  it("builds structured download url for persisted attachments", () => {
    expect(
      getAttachmentDownloadHref(
        {
          filename: "receipt.pdf",
          objectKey: "prefix/attachments/request/receipt.pdf",
          type: "file",
        },
        { id: "attachment-id", kind: "reimbursementAttachment" }
      )
    ).toBe(
      "/api/attachments/download?filename=receipt.pdf&id=attachment-id&kind=reimbursementAttachment"
    );
  });

  it("does not build raw-key download url without a persisted target", () => {
    expect(
      getAttachmentDownloadHref({
        filename: "receipt.pdf",
        objectKey: "prefix/attachments/request/receipt.pdf",
        type: "file",
      })
    ).toBe("#");
  });

  it("includes scheduled message key only with scheduled message target", () => {
    expect(
      getAttachmentDownloadHref(
        {
          filename: "media.png",
          objectKey: "prefix/scheduled-messages/user/media.png",
          type: "file",
        },
        {
          id: "message-id",
          key: "prefix/scheduled-messages/user/media.png",
          kind: "scheduledMessageAttachment",
        }
      )
    ).toBe(
      "/api/attachments/download?filename=media.png&id=message-id&kind=scheduledMessageAttachment&key=prefix%2Fscheduled-messages%2Fuser%2Fmedia.png"
    );
  });
});
