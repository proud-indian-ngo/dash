import { describe, expect, it } from "bun:test";

import {
  contentDispositionFilename,
  previewFailureMessage,
  previewKind,
} from "./file-preview";

describe("previewKind", () => {
  it("draws PDFs and shows images", () => {
    expect(previewKind("application/pdf")).toBe("pdf");
    expect(previewKind("Application/PDF; charset=binary")).toBe("pdf");
    expect(previewKind("image/png")).toBe("image");
    expect(previewKind("image/heic")).toBe("image");
  });

  it("offers everything else as a download", () => {
    expect(previewKind("video/mp4")).toBe("other");
    expect(
      previewKind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe("other");
    expect(previewKind("")).toBe("other");
  });
});

describe("contentDispositionFilename", () => {
  it("prefers the UTF-8 name over the ASCII fallback", () => {
    expect(
      contentDispositionFilename(
        `inline; filename="____.pdf"; filename*=UTF-8''%E0%A4%B0%E0%A4%B8%E0%A5%80%E0%A4%A6.pdf`
      )
    ).toBe("रसीद.pdf");
  });

  it("reads a quoted or bare name", () => {
    expect(
      contentDispositionFilename('attachment; filename="PI-2026-27-0001.pdf"')
    ).toBe("PI-2026-27-0001.pdf");
    expect(contentDispositionFilename("inline; filename=scan.png")).toBe(
      "scan.png"
    );
  });

  it("falls back when the encoding is malformed or there is no name", () => {
    expect(
      contentDispositionFilename(
        `inline; filename="plain.pdf"; filename*=UTF-8''%E0%A4.pdf`
      )
    ).toBe("plain.pdf");
    expect(contentDispositionFilename("inline")).toBeNull();
    expect(contentDispositionFilename(null)).toBeNull();
  });
});

describe("previewFailureMessage", () => {
  it("names the reason a new tab would fail too", () => {
    expect(previewFailureMessage(403)).toBe(
      "You don't have access to this file."
    );
    expect(previewFailureMessage(404)).toBe(
      "This file is no longer available."
    );
    expect(previewFailureMessage(429)).toContain("Try again in a minute");
    expect(previewFailureMessage(null)).toContain("Check your connection");
  });
});
