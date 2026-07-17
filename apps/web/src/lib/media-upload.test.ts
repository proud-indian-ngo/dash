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
const EVENT_ID = "e2e00000-0000-0000-0000-000000000101";

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
      eventEditorUploadSchema.parse({ ...image, eventId: EVENT_ID })
    ).toEqual({ ...image, eventId: EVENT_ID });
  });

  it("rejects unsupported MIME types and images over the shared limit", () => {
    expect(
      eventEditorUploadSchema.safeParse({
        ...image,
        eventId: EVENT_ID,
        mimeType: "application/pdf",
      }).success
    ).toBe(false);
    expect(
      eventEditorUploadSchema.safeParse({
        ...image,
        eventId: EVENT_ID,
        fileSize: MAX_IMAGE_SIZE_BYTES + 1,
      }).success
    ).toBe(false);
  });

  it("rejects a malformed event ID before database authorization", () => {
    expect(
      eventEditorUploadSchema.safeParse({ ...image, eventId: "not-an-id" })
        .success
    ).toBe(false);
  });
});
