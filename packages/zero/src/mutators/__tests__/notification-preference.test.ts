import { describe, expect, it } from "vitest";
import z from "zod";

const upsertSchema = z.object({
  topicId: z.string().min(1),
  channel: z.enum(["email", "whatsapp"]),
  enabled: z.boolean(),
});

const adminUpsertSchema = upsertSchema.extend({
  userId: z.string().min(1),
});

describe("notificationPreference mutator schemas", () => {
  describe("upsert", () => {
    it("accepts valid email preference", () => {
      const result = upsertSchema.safeParse({
        topicId: "topic-1",
        channel: "email",
        enabled: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid whatsapp preference", () => {
      const result = upsertSchema.safeParse({
        topicId: "topic-1",
        channel: "whatsapp",
        enabled: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts disabled preference", () => {
      const result = upsertSchema.safeParse({
        topicId: "topic-1",
        channel: "email",
        enabled: false,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid channel", () => {
      const result = upsertSchema.safeParse({
        topicId: "topic-1",
        channel: "sms",
        enabled: true,
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty topicId", () => {
      const result = upsertSchema.safeParse({
        topicId: "",
        channel: "email",
        enabled: true,
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
        topicId: "topic-1",
        enabled: true,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing enabled", () => {
      const result = upsertSchema.safeParse({
        topicId: "topic-1",
        channel: "email",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("adminUpsert", () => {
    it("accepts valid email preference with userId", () => {
      const result = adminUpsertSchema.safeParse({
        topicId: "topic-1",
        channel: "email",
        enabled: true,
        userId: "user-123",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid whatsapp preference with userId", () => {
      const result = adminUpsertSchema.safeParse({
        topicId: "topic-1",
        channel: "whatsapp",
        enabled: false,
        userId: "user-456",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing userId", () => {
      const result = adminUpsertSchema.safeParse({
        topicId: "topic-1",
        channel: "email",
        enabled: true,
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty userId", () => {
      const result = adminUpsertSchema.safeParse({
        topicId: "topic-1",
        channel: "email",
        enabled: true,
        userId: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty topicId", () => {
      const result = adminUpsertSchema.safeParse({
        topicId: "",
        channel: "email",
        enabled: true,
        userId: "user-123",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid channel", () => {
      const result = adminUpsertSchema.safeParse({
        topicId: "topic-1",
        channel: "push",
        enabled: true,
        userId: "user-123",
      });
      expect(result.success).toBe(false);
    });
  });
});
