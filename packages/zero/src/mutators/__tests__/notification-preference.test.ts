import { describe, expect, it } from "vitest";
import z from "zod";

const upsertSchema = z.object({
  channel: z.enum(["email", "whatsapp"]),
  enabled: z.boolean(),
  topicId: z.string().min(1),
});

const adminUpsertSchema = upsertSchema.extend({
  userId: z.string().min(1),
});

describe("notificationPreference mutator schemas", () => {
  describe("upsert", () => {
    it("accepts valid email preference", () => {
      const result = upsertSchema.safeParse({
        channel: "email",
        enabled: true,
        topicId: "topic-1",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid whatsapp preference", () => {
      const result = upsertSchema.safeParse({
        channel: "whatsapp",
        enabled: true,
        topicId: "topic-1",
      });
      expect(result.success).toBe(true);
    });

    it("accepts disabled preference", () => {
      const result = upsertSchema.safeParse({
        channel: "email",
        enabled: false,
        topicId: "topic-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid channel", () => {
      const result = upsertSchema.safeParse({
        channel: "sms",
        enabled: true,
        topicId: "topic-1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty topicId", () => {
      const result = upsertSchema.safeParse({
        channel: "email",
        enabled: true,
        topicId: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing topicId", () => {
      const result = upsertSchema.safeParse({
        channel: "email",
        enabled: true,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing channel", () => {
      const result = upsertSchema.safeParse({
        enabled: true,
        topicId: "topic-1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing enabled", () => {
      const result = upsertSchema.safeParse({
        channel: "email",
        topicId: "topic-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("adminUpsert", () => {
    it("accepts valid email preference with userId", () => {
      const result = adminUpsertSchema.safeParse({
        channel: "email",
        enabled: true,
        topicId: "topic-1",
        userId: "user-123",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid whatsapp preference with userId", () => {
      const result = adminUpsertSchema.safeParse({
        channel: "whatsapp",
        enabled: false,
        topicId: "topic-1",
        userId: "user-456",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing userId", () => {
      const result = adminUpsertSchema.safeParse({
        channel: "email",
        enabled: true,
        topicId: "topic-1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty userId", () => {
      const result = adminUpsertSchema.safeParse({
        channel: "email",
        enabled: true,
        topicId: "topic-1",
        userId: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty topicId", () => {
      const result = adminUpsertSchema.safeParse({
        channel: "email",
        enabled: true,
        topicId: "",
        userId: "user-123",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid channel", () => {
      const result = adminUpsertSchema.safeParse({
        channel: "push",
        enabled: true,
        topicId: "topic-1",
        userId: "user-123",
      });
      expect(result.success).toBe(false);
    });
  });
});
