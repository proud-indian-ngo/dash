import { describe, expect, it } from "bun:test";

import {
  MAX_APPROVAL_SCREENSHOT_SIZE_BYTES,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  MAX_AVATAR_IMAGE_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_KALAKRITI_MUSIC_SIZE_BYTES,
  MAX_KALAKRITI_SCORECARD_SIZE_BYTES,
  MAX_SCHEDULED_MESSAGE_FILE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import { MAX_KALAKRITI_INVENTORY_PHOTO_SIZE_BYTES } from "@pi-dash/shared/kalakriti-inventory";

import {
  approvalScreenshotUploadSchema,
  avatarUploadSchema,
  eventEditorUploadSchema,
  eventPhotoUploadSchema,
  kalakritiEntryMusicUploadSchema,
  kalakritiInventoryPhotoUploadSchema,
  kalakritiScorecardUploadSchema,
  requestUploadSchema,
  scheduledMessageUploadSchema,
  vendorPaymentInvoiceUploadSchema,
} from "./media-upload";

const image = {
  fileName: "photo.jpg",
  fileSize: 1024,
  mimeType: "image/jpeg" as const,
};
const EVENT_ID = "e2e00000-0000-0000-0000-000000000101";

describe("Kalakriti scorecard upload schema", () => {
  const scorecard = {
    divisionId: EVENT_ID,
    editionId: EVENT_ID,
    fileName: "scores.pdf",
    fileSize: MAX_KALAKRITI_SCORECARD_SIZE_BYTES,
    mimeType: "application/pdf",
  };

  it("accepts PDF, JPEG and PNG through the 20 MB boundary", () => {
    for (const mimeType of ["application/pdf", "image/jpeg", "image/png"]) {
      expect(
        kalakritiScorecardUploadSchema.safeParse({ ...scorecard, mimeType })
          .success
      ).toBe(true);
    }
  });

  it("rejects unsupported, empty, oversized, and invalid scope uploads", () => {
    for (const change of [
      { mimeType: "image/webp" },
      { fileSize: 0 },
      { fileSize: MAX_KALAKRITI_SCORECARD_SIZE_BYTES + 1 },
      { divisionId: "wrong" },
    ]) {
      expect(
        kalakritiScorecardUploadSchema.safeParse({ ...scorecard, ...change })
          .success
      ).toBe(false);
    }
  });
});

describe("Kalakriti inventory photo upload schema", () => {
  const photo = { ...image, editionId: EVENT_ID };

  it("accepts shared image types at the 5 MB boundary", () => {
    for (const mimeType of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]) {
      expect(
        kalakritiInventoryPhotoUploadSchema.safeParse({
          ...photo,
          mimeType,
          fileSize: MAX_KALAKRITI_INVENTORY_PHOTO_SIZE_BYTES,
        }).success
      ).toBe(true);
    }
  });

  it("rejects invalid scope, unsupported type, empty and oversized photos", () => {
    for (const change of [
      { editionId: "invalid" },
      { mimeType: "image/svg+xml" },
      { fileSize: 0 },
      { fileSize: MAX_KALAKRITI_INVENTORY_PHOTO_SIZE_BYTES + 1 },
    ]) {
      expect(
        kalakritiInventoryPhotoUploadSchema.safeParse({ ...photo, ...change })
          .success
      ).toBe(false);
    }
  });
});

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

describe("protected temporary upload schemas", () => {
  it("accepts request and scheduled-message files within shared limits", () => {
    expect(requestUploadSchema.safeParse(image).success).toBe(true);
    expect(scheduledMessageUploadSchema.safeParse(image).success).toBe(true);
    expect(
      scheduledMessageUploadSchema.safeParse({
        ...image,
        mimeType: "audio/mpeg",
      }).success
    ).toBe(true);
  });

  it("rejects unsupported request files and oversized scheduled videos", () => {
    expect(
      requestUploadSchema.safeParse({
        ...image,
        mimeType: "application/octet-stream",
      }).success
    ).toBe(false);
    expect(
      scheduledMessageUploadSchema.safeParse({
        ...image,
        fileSize: MAX_SCHEDULED_MESSAGE_FILE_SIZE_BYTES + 1,
        mimeType: "audio/mpeg",
      }).success
    ).toBe(false);
    expect(
      requestUploadSchema.safeParse({
        ...image,
        fileSize: MAX_ATTACHMENT_FILE_SIZE_BYTES + 1,
      }).success
    ).toBe(false);
  });

  it("requires a valid vendor-payment scope for invoice uploads", () => {
    expect(
      vendorPaymentInvoiceUploadSchema.safeParse({
        ...image,
        vendorPaymentId: EVENT_ID,
      }).success
    ).toBe(true);
    expect(
      vendorPaymentInvoiceUploadSchema.safeParse({
        ...image,
        vendorPaymentId: "not-an-id",
      }).success
    ).toBe(false);
  });

  it("accepts Kalakriti music files and rejects PDF, WAV, and oversized tracks", () => {
    const music = {
      centerId: EVENT_ID,
      divisionId: EVENT_ID,
      editionId: EVENT_ID,
      fileName: "track.mp3",
      fileSize: 1024,
      mimeType: "audio/mpeg" as const,
    };
    expect(kalakritiEntryMusicUploadSchema.safeParse(music).success).toBe(true);
    expect(
      kalakritiEntryMusicUploadSchema.parse({ ...music, entryId: EVENT_ID })
        .entryId
    ).toBe(EVENT_ID);
    expect(
      kalakritiEntryMusicUploadSchema.safeParse({
        ...music,
        entryId: "invalid",
      }).success
    ).toBe(false);
    expect(
      kalakritiEntryMusicUploadSchema.safeParse({
        ...music,
        mimeType: "application/pdf",
      }).success
    ).toBe(false);
    expect(
      kalakritiEntryMusicUploadSchema.safeParse({
        ...music,
        mimeType: "audio/wav",
      }).success
    ).toBe(false);
    expect(
      kalakritiEntryMusicUploadSchema.safeParse({
        ...music,
        fileSize: MAX_KALAKRITI_MUSIC_SIZE_BYTES + 1,
      }).success
    ).toBe(false);
  });

  it("limits approval screenshots to safe images and 10 MB", () => {
    expect(approvalScreenshotUploadSchema.safeParse(image).success).toBe(true);
    expect(
      approvalScreenshotUploadSchema.safeParse({
        ...image,
        fileSize: MAX_APPROVAL_SCREENSHOT_SIZE_BYTES + 1,
      }).success
    ).toBe(false);
    expect(
      approvalScreenshotUploadSchema.safeParse({
        ...image,
        mimeType: "image/gif",
      }).success
    ).toBe(false);
  });

  it("validates event photo scope and image/video limits", () => {
    expect(
      eventPhotoUploadSchema.safeParse({ ...image, eventId: EVENT_ID }).success
    ).toBe(true);
    expect(
      eventPhotoUploadSchema.safeParse({
        ...image,
        eventId: EVENT_ID,
        fileSize: MAX_VIDEO_SIZE_BYTES,
        mimeType: "video/quicktime",
      }).success
    ).toBe(true);
    expect(
      eventPhotoUploadSchema.safeParse({
        ...image,
        eventId: EVENT_ID,
        fileSize: MAX_IMAGE_SIZE_BYTES + 1,
      }).success
    ).toBe(false);
    expect(
      eventPhotoUploadSchema.safeParse({
        ...image,
        eventId: "not-an-id",
      }).success
    ).toBe(false);
  });
});
