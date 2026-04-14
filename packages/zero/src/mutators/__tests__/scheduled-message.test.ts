import { describe, expect, it } from "vitest";
import z from "zod";

const recipientSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["group", "user"]),
});

const attachmentSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  r2Key: z.string(),
});

const createSchema = z.object({
  attachments: z.array(attachmentSchema).max(5).optional(),
  id: z.string(),
  message: z.string().min(1),
  recipients: z.array(recipientSchema).min(1).max(10),
  scheduledAt: z.number(),
});

const updateSchema = z.object({
  attachments: z.array(attachmentSchema).max(5).optional(),
  id: z.string(),
  message: z.string().min(1),
  recipients: z.array(recipientSchema).min(1).max(10),
  scheduledAt: z.number(),
});

const cancelSchema = z.object({
  id: z.string(),
});

const deleteSchema = z.object({
  id: z.string(),
});

const retryRecipientSchema = z.object({
  recipientId: z.string(),
});

describe("scheduledMessage mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input with all fields", () => {
      const result = createSchema.safeParse({
        id: "msg-1",
        message: "Hello everyone",
        recipients: [
          { id: "grp-1", label: "Group A", type: "group" },
          { id: "user-1", label: "John", type: "user" },
        ],
        scheduledAt: 1_700_000_000_000,
        attachments: [
          {
            fileName: "document.pdf",
            mimeType: "application/pdf",
            r2Key: "docs/file.pdf",
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts minimal valid input", () => {
      const result = createSchema.safeParse({
        id: "msg-1",
        message: "Hello",
        recipients: [{ id: "user-1", label: "John", type: "user" }],
        scheduledAt: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty message", () => {
      const result = createSchema.safeParse({
        id: "msg-1",
        message: "",
        recipients: [{ id: "user-1", label: "John", type: "user" }],
        scheduledAt: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty recipients", () => {
      const result = createSchema.safeParse({
        id: "msg-1",
        message: "Hello",
        recipients: [],
        scheduledAt: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects >10 recipients", () => {
      const result = createSchema.safeParse({
        id: "msg-1",
        message: "Hello",
        recipients: Array.from({ length: 11 }, (_, i) => ({
          id: `user-${i}`,
          label: `User ${i}`,
          type: "user" as const,
        })),
        scheduledAt: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects >5 attachments", () => {
      const result = createSchema.safeParse({
        id: "msg-1",
        message: "Hello",
        recipients: [{ id: "user-1", label: "John", type: "user" }],
        scheduledAt: 1_700_000_000_000,
        attachments: Array.from({ length: 6 }, (_, i) => ({
          fileName: `file${i}.pdf`,
          mimeType: "application/pdf",
          r2Key: `docs/file${i}.pdf`,
        })),
      });
      expect(result.success).toBe(false);
    });

    it("accepts exactly 5 attachments", () => {
      const result = createSchema.safeParse({
        id: "msg-1",
        message: "Hello",
        recipients: [{ id: "user-1", label: "John", type: "user" }],
        scheduledAt: 1_700_000_000_000,
        attachments: Array.from({ length: 5 }, (_, i) => ({
          fileName: `file${i}.pdf`,
          mimeType: "application/pdf",
          r2Key: `docs/file${i}.pdf`,
        })),
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid recipient type", () => {
      const result = createSchema.safeParse({
        id: "msg-1",
        message: "Hello",
        recipients: [{ id: "user-1", label: "John", type: "invalid" }],
        scheduledAt: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("update", () => {
    it("accepts valid update", () => {
      const result = updateSchema.safeParse({
        id: "msg-1",
        message: "Updated message",
        recipients: [{ id: "user-1", label: "John", type: "user" }],
        scheduledAt: 1_700_000_000_000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing message in update", () => {
      const result = updateSchema.safeParse({
        id: "msg-1",
        recipients: [{ id: "user-1", label: "John", type: "user" }],
        scheduledAt: 1_700_000_000_000,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("cancel", () => {
    it("accepts valid input", () => {
      const result = cancelSchema.safeParse({ id: "msg-1" });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = cancelSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("delete", () => {
    it("accepts valid input", () => {
      const result = deleteSchema.safeParse({ id: "msg-1" });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = deleteSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("retryRecipient", () => {
    it("accepts valid input", () => {
      const result = retryRecipientSchema.safeParse({
        recipientId: "rec-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing recipientId", () => {
      const result = retryRecipientSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
