import type { EventPhoto } from "@pi-dash/zero/schema";
import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/env/web", () => ({
  env: { VITE_IMMICH_URL: "https://immich.example.test/" },
}));

import {
  getPhotoLightboxUrl,
  getPhotoThumbnailUrl,
  getR2MediaUrl,
  toPhotoSlide,
} from "./photo-utils";

const createPhoto = (overrides: Partial<EventPhoto> = {}): EventPhoto => ({
  caption: null,
  createdAt: 1,
  eventId: "event-1",
  id: "photo-1",
  immichAssetId: null,
  mimeType: null,
  r2Key: null,
  reviewedAt: null,
  reviewedBy: null,
  status: "pending",
  uploadedBy: "uploader-1",
  ...overrides,
});

const permissions = {
  canApprove: false,
  canDelete: false,
  canReject: false,
};

describe("event photo URLs", () => {
  it("builds encoded authenticated R2 media URLs", () => {
    expect(getR2MediaUrl("photo/one")).toBe(
      "/api/media/event-photo/photo%2Fone"
    );
  });

  it("uses authenticated R2 URLs for image thumbnails and lightboxes", () => {
    const photo = createPhoto({ id: "photo/one", r2Key: "events/photo.jpg" });

    expect(getPhotoThumbnailUrl(photo)).toBe(
      "/api/media/event-photo/photo%2Fone"
    );
    expect(getPhotoLightboxUrl(photo)).toBe(
      "/api/media/event-photo/photo%2Fone"
    );
    expect(
      toPhotoSlide({ ...photo, uploader: undefined }, permissions)
    ).toEqual(
      expect.objectContaining({
        src: "/api/media/event-photo/photo%2Fone",
        thumbnailSrc: "/api/media/event-photo/photo%2Fone",
        type: "image",
      })
    );
  });

  it("uses authenticated R2 video URLs without inventing a poster", () => {
    const photo = createPhoto({
      mimeType: "video/mp4",
      r2Key: "events/video.mp4",
    });

    expect(getPhotoThumbnailUrl(photo)).toBeNull();
    expect(getPhotoLightboxUrl(photo)).toBe("/api/media/event-photo/photo-1");
    expect(
      toPhotoSlide({ ...photo, uploader: undefined }, permissions)
    ).toEqual(
      expect.objectContaining({
        poster: undefined,
        sources: [
          {
            src: "/api/media/event-photo/photo-1",
            type: "video/mp4",
          },
        ],
        type: "video",
      })
    );
  });

  it("prefers Immich URLs when an asset has both storage references", () => {
    const photo = createPhoto({
      immichAssetId: "immich-1",
      r2Key: "events/photo.jpg",
    });

    expect(getPhotoThumbnailUrl(photo)).toBe("/api/immich/thumbnail/immich-1");
    expect(getPhotoLightboxUrl(photo)).toBe("/api/immich/original/immich-1");
  });
});
