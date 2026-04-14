import { describe, expect, it } from "vitest";
import z from "zod";

const createSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  content: z.string().min(1).max(50_000),
  now: z.number(),
});

const approveSchema = z.object({
  id: z.string(),
  now: z.number(),
});

const rejectSchema = z.object({
  id: z.string(),
  now: z.number(),
});

const editSchema = z.object({
  id: z.string(),
  content: z.string().min(1).max(50_000),
  now: z.number(),
});

const deleteSchema = z.object({
  id: z.string(),
});

describe("eventUpdate mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input", () => {
      const result = createSchema.safeParse({
        id: "upd-1",
        eventId: "evt-1",
        content: "This is an update about the event",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts content at max length (50000)", () => {
      const result = createSchema.safeParse({
        id: "upd-1",
        eventId: "evt-1",
        content: "x".repeat(50_000),
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty content", () => {
      const result = createSchema.safeParse({
        id: "upd-1",
        eventId: "evt-1",
        content: "",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects content over 50000 chars", () => {
      const result = createSchema.safeParse({
        id: "upd-1",
        eventId: "evt-1",
        content: "x".repeat(50_001),
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing eventId", () => {
      const result = createSchema.safeParse({
        id: "upd-1",
        content: "Update text",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = createSchema.safeParse({
        id: "upd-1",
        eventId: "evt-1",
        content: "Update text",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("approve", () => {
    it("accepts valid input", () => {
      const result = approveSchema.safeParse({
        id: "upd-1",
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
        id: "upd-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("reject", () => {
    it("accepts valid input", () => {
      const result = rejectSchema.safeParse({
        id: "upd-1",
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
        id: "upd-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("edit", () => {
    it("accepts valid input", () => {
      const result = editSchema.safeParse({
        id: "upd-1",
        content: "Updated content for the event",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty content", () => {
      const result = editSchema.safeParse({
        id: "upd-1",
        content: "",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects content over 50000 chars", () => {
      const result = editSchema.safeParse({
        id: "upd-1",
        content: "x".repeat(50_001),
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing content", () => {
      const result = editSchema.safeParse({
        id: "upd-1",
        now: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing now", () => {
      const result = editSchema.safeParse({
        id: "upd-1",
        content: "Some content",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("delete", () => {
    it("accepts valid input", () => {
      const result = deleteSchema.safeParse({
        id: "upd-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = deleteSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
