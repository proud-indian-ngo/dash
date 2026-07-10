import {
  MAX_AVATAR_IMAGE_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import { describe, expect, it } from "vitest";
import { avatarUploadSchema, eventEditorUploadSchema } from "./media-upload";

const image = {
  fileName: "photo.jpg",
  fileSize: 1024,
  mimeType: "image/jpeg",
};

describe("avatarUploadSchema", () => {
  it("accepts a supported avatar within the avatar limit", () => {
    expect(avatarUploadSchema.parse(image)).toEqual(image);
  });

  it("rejects unsupported MIME types and oversized avatars", () => {
    expect(
      avatarUploadSchema.safeParse({ ...image, mimeType: "image/svg+xml" })
        .success
    ).toBe(false);
    expect(
      avatarUploadSchema.safeParse({
        ...image,
        fileSize: MAX_AVATAR_IMAGE_SIZE_BYTES + 1,
      }).success
    ).toBe(false);
  });
});

describe("eventEditorUploadSchema", () => {
  it("accepts a shared-limit image for an event", () => {
    expect(
      eventEditorUploadSchema.parse({ ...image, eventId: "event-1" })
    ).toEqual({ ...image, eventId: "event-1" });
  });

  it("rejects unsupported MIME types and images over the shared limit", () => {
    expect(
      eventEditorUploadSchema.safeParse({
        ...image,
        eventId: "event-1",
        mimeType: "application/pdf",
      }).success
    ).toBe(false);
    expect(
      eventEditorUploadSchema.safeParse({
        ...image,
        eventId: "event-1",
        fileSize: MAX_IMAGE_SIZE_BYTES + 1,
      }).success
    ).toBe(false);
  });
});
