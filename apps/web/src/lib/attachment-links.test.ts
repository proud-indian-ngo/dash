import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/env/web", () => ({
  env: {
    VITE_CDN_URL: "http://localhost",
    VITE_ZERO_URL: "http://localhost",
  },
}));

import { getAttachmentLabel } from "./attachment-links";

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
        type: "file",
        filename: "receipt.pdf",
        objectKey: "uploads/receipt.pdf",
      })
    ).toBe("receipt.pdf");
  });

  it("falls back to objectKey when filename is null", () => {
    expect(
      getAttachmentLabel({
        type: "file",
        filename: null,
        objectKey: "uploads/doc.pdf",
      })
    ).toBe("uploads/doc.pdf");
  });

  it("falls back to 'Attachment' when both null", () => {
    expect(
      getAttachmentLabel({ type: "file", filename: null, objectKey: null })
    ).toBe("Attachment");
  });
});
