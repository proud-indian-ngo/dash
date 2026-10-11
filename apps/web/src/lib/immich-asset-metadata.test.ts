import { describe, expect, it } from "bun:test";

import { toImmichAssetMetadata } from "./immich";

describe("toImmichAssetMetadata", () => {
  it("reads size and capture time from EXIF", () => {
    expect(
      toImmichAssetMetadata({
        exifInfo: {
          dateTimeOriginal: "2026-10-03T05:12:00.000Z",
          exifImageHeight: 3024,
          exifImageWidth: 4032,
          orientation: "1",
        },
        fileCreatedAt: "2026-10-04T00:00:00.000Z",
      })
    ).toEqual({
      height: 3024,
      takenAt: new Date("2026-10-03T05:12:00.000Z"),
      width: 4032,
    });
  });

  it("swaps size for rotated photos and falls back to fileCreatedAt", () => {
    expect(
      toImmichAssetMetadata({
        exifInfo: {
          exifImageHeight: 3024,
          exifImageWidth: 4032,
          orientation: "6",
        },
        fileCreatedAt: "2026-10-04T00:00:00.000Z",
      })
    ).toEqual({
      height: 4032,
      takenAt: new Date("2026-10-04T00:00:00.000Z"),
      width: 3024,
    });
  });

  it("returns nulls for missing or invalid values", () => {
    expect(
      toImmichAssetMetadata({
        exifInfo: { exifImageWidth: 0 },
        fileCreatedAt: "not a date",
      })
    ).toEqual({ height: null, takenAt: null, width: null });
    expect(toImmichAssetMetadata({})).toEqual({
      height: null,
      takenAt: null,
      width: null,
    });
  });
});
