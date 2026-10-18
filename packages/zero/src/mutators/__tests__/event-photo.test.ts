import { describe, expect, it } from "bun:test";

import z from "zod";

import { eventPhotoUploadSchema } from "../event-photo";

const approveSchema = z.object({
  id: z.string(),
  now: z.number(),
});

const batchApproveSchema = z.object({
  ids: z.array(z.string()),
  now: z.number(),
});

const rejectSchema = z.object({
  id: z.string(),
  now: z.number(),
});

const deleteSchema = z.object({
  id: z.string(),
});

describe("eventPhoto mutator schemas", () => {
  describe("upload", () => {
    it("accepts valid input with r2Key", () => {
      const result = eventPhotoUploadSchema.safeParse({
        caption: "Team photo",
        eventId: "evt-1",
        id: "photo-1",
        mimeType: "image/jpeg",
        now: 1_700_000_000_000,
        r2Key: "photos/event/photo.jpg",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid input with immichAssetId", () => {
      const result = eventPhotoUploadSchema.safeParse({
        caption: "Team photo",
        eventId: "evt-1",
        id: "photo-1",
        immichAssetId: "asset-uuid-123",
        immichUploadReceipt: "receipt",
        mimeType: "image/jpeg",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects with both r2Key and Immich source fields", () => {
      const result = eventPhotoUploadSchema.safeParse({
        eventId: "evt-1",
        id: "photo-1",
        immichAssetId: "asset-uuid-123",
        immichUploadReceipt: "receipt",
        mimeType: "image/jpeg",
        now: 1_700_000_000_000,
        r2Key: "photos/event/photo.jpg",
      });
      expect(result.success).toBe(false);
    });

    it("accepts minimal valid input with r2Key", () => {
      const result = eventPhotoUploadSchema.safeParse({
        eventId: "evt-1",
        id: "photo-1",
        now: 1_700_000_000_000,
        r2Key: "photos/event/photo.jpg",
      });
      expect(result.success).toBe(true);
    });

    it("rejects when neither r2Key nor immichAssetId provided", () => {
      const result = eventPhotoUploadSchema.safeParse({
        caption: "Photo without source",
        eventId: "evt-1",
        id: "photo-1",
        mimeType: "image/jpeg",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a bare Immich asset ID or missing direct-upload MIME type", () => {
      const base = {
        eventId: "evt-1",
        id: "photo-1",
        immichAssetId: "asset-uuid-123",
        now: 1_700_000_000_000,
      };

      expect(eventPhotoUploadSchema.safeParse(base).success).toBe(false);
      expect(
        eventPhotoUploadSchema.safeParse({
          ...base,
          immichUploadReceipt: "receipt",
        }).success
      ).toBe(false);
    });

    it("rejects missing eventId", () => {
      const result = eventPhotoUploadSchema.safeParse({
        id: "photo-1",
        now: 1_700_000_000_000,
        r2Key: "photos/event/photo.jpg",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = eventPhotoUploadSchema.safeParse({
        eventId: "evt-1",
        id: "photo-1",
        r2Key: "photos/event/photo.jpg",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("approve", () => {
    it("accepts valid input", () => {
      const result = approveSchema.safeParse({
        id: "photo-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = approveSchema.safeParse({
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = approveSchema.safeParse({
        id: "photo-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("batchApprove", () => {
    it("accepts valid input with multiple ids", () => {
      const result = batchApproveSchema.safeParse({
        ids: ["photo-1", "photo-2", "photo-3"],
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts single id in array", () => {
      const result = batchApproveSchema.safeParse({
        ids: ["photo-1"],
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty ids array", () => {
      const result = batchApproveSchema.safeParse({
        ids: [],
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing ids", () => {
      const result = batchApproveSchema.safeParse({
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = batchApproveSchema.safeParse({
        ids: ["photo-1"],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("reject", () => {
    it("accepts valid input", () => {
      const result = rejectSchema.safeParse({
        id: "photo-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = rejectSchema.safeParse({
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = rejectSchema.safeParse({
        id: "photo-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("delete", () => {
    it("accepts valid input", () => {
      const result = deleteSchema.safeParse({
        id: "photo-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = deleteSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
