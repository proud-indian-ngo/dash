import { describe, expect, it } from "vitest";
import z from "zod";

const uploadSchema = z
  .object({
    id: z.string(),
    eventId: z.string(),
    r2Key: z.string().optional(),
    immichAssetId: z.string().optional(),
    mimeType: z.string().optional(),
    caption: z.string().optional(),
    now: z.number(),
  })
  .refine((d) => d.r2Key || d.immichAssetId, {
    message: "Either r2Key or immichAssetId must be provided",
  });

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
      const result = uploadSchema.safeParse({
        id: "photo-1",
        eventId: "evt-1",
        r2Key: "photos/event/photo.jpg",
        mimeType: "image/jpeg",
        caption: "Team photo",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid input with immichAssetId", () => {
      const result = uploadSchema.safeParse({
        id: "photo-1",
        eventId: "evt-1",
        immichAssetId: "asset-uuid-123",
        mimeType: "image/jpeg",
        caption: "Team photo",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts with both r2Key and immichAssetId", () => {
      const result = uploadSchema.safeParse({
        id: "photo-1",
        eventId: "evt-1",
        r2Key: "photos/event/photo.jpg",
        immichAssetId: "asset-uuid-123",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts minimal valid input with r2Key", () => {
      const result = uploadSchema.safeParse({
        id: "photo-1",
        eventId: "evt-1",
        r2Key: "photos/event/photo.jpg",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects when neither r2Key nor immichAssetId provided", () => {
      const result = uploadSchema.safeParse({
        id: "photo-1",
        eventId: "evt-1",
        mimeType: "image/jpeg",
        caption: "Photo without source",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing eventId", () => {
      const result = uploadSchema.safeParse({
        id: "photo-1",
        r2Key: "photos/event/photo.jpg",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = uploadSchema.safeParse({
        id: "photo-1",
        eventId: "evt-1",
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
