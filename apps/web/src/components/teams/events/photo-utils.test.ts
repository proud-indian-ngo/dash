import type { EventPhoto } from "@pi-dash/zero/schema";
import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/env/web", () => ({
  env: {
    VITE_IMMICH_URL: "https://immich.example.test/",
  },
}));

import { getPhotoLightboxUrl, getPhotoThumbnailUrl } from "./photo-utils";

const basePhoto = {
  caption: "Team photo",
  id: "photo-id",
  immichAssetId: null,
  mimeType: "image/jpeg",
  r2Key: "app/photos/event-id/photo.jpg",
} as EventPhoto;

describe("event photo urls", () => {
  it("routes R2 thumbnails through the authorized attachment endpoint", () => {
    expect(getPhotoThumbnailUrl(basePhoto)).toBe(
      "/api/attachments/download?filename=Team+photo&id=photo-id&kind=eventPhoto"
    );
  });

  it("routes R2 originals through the authorized attachment endpoint", () => {
    expect(getPhotoLightboxUrl(basePhoto)).toBe(
      "/api/attachments/download?filename=Team+photo&id=photo-id&kind=eventPhoto"
    );
  });
});
