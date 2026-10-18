import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import {
  createImmichUploadReceipt,
  verifyImmichUploadReceipt,
} from "./immich-upload-receipt";

const NOW = 1_800_000_000_000;
const claim = {
  assetId: "asset-1",
  eventId: "event-1",
  mimeType: "image/jpeg",
  photoId: "photo-1",
  userId: "user-1",
};

afterEach(() => {
  mock.restore();
});

describe("Immich upload receipts", () => {
  it("verifies only the exact bound upload claim", () => {
    spyOn(Date, "now").mockReturnValue(NOW);
    const receipt = createImmichUploadReceipt(claim);

    expect(verifyImmichUploadReceipt({ ...claim, receipt })).toBe(true);
    for (const changed of [
      { assetId: "asset-2" },
      { eventId: "event-2" },
      { mimeType: "image/png" },
      { photoId: "photo-2" },
      { userId: "user-2" },
    ]) {
      expect(verifyImmichUploadReceipt({ ...claim, ...changed, receipt })).toBe(
        false
      );
    }
  });

  it("rejects expired and malformed receipts", () => {
    const now = spyOn(Date, "now").mockReturnValue(NOW);
    const receipt = createImmichUploadReceipt(claim);
    now.mockReturnValue(NOW + 10 * 60 * 1000);

    expect(verifyImmichUploadReceipt({ ...claim, receipt })).toBe(false);
    for (const malformed of [
      "",
      "invalid",
      `${NOW}.not-hex`,
      `${NOW}.deadbeef.extra`,
      "x".repeat(97),
    ]) {
      expect(verifyImmichUploadReceipt({ ...claim, receipt: malformed })).toBe(
        false
      );
    }
  });
});
