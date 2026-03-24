import { describe, expect, it } from "vitest";
import z from "zod";

const createSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  whatsappGroupId: z.string().optional(),
  createWhatsAppGroup: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  whatsappGroupId: z.string().optional(),
});

const deleteSchema = z.object({ id: z.string() });

const addMemberSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  userId: z.string(),
  role: z.enum(["member", "lead"]).default("member"),
});

const removeMemberSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
});

const setMemberRoleSchema = z.object({
  memberId: z.string(),
  role: z.enum(["member", "lead"]),
});

describe("team mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input with all fields", () => {
      const result = createSchema.safeParse({
        id: "t-1",
        name: "Engineering",
        description: "The eng team",
        whatsappGroupId: "wg-1",
        createWhatsAppGroup: false,
      });
      expect(result.success).toBe(true);
    });

    it("accepts minimal valid input", () => {
      const result = createSchema.safeParse({
        id: "t-1",
        name: "Engineering",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createSchema.safeParse({
        id: "t-1",
        name: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing name", () => {
      const result = createSchema.safeParse({
        id: "t-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("update", () => {
    it("accepts valid input", () => {
      const result = updateSchema.safeParse({
        id: "t-1",
        name: "Updated name",
        description: "New description",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = updateSchema.safeParse({
        id: "t-1",
        name: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing id", () => {
      const result = updateSchema.safeParse({
        name: "Test",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("delete", () => {
    it("accepts valid input", () => {
      const result = deleteSchema.safeParse({ id: "t-1" });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = deleteSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("addMember", () => {
    it("accepts valid input with default role", () => {
      const result = addMemberSchema.safeParse({
        id: "tm-1",
        teamId: "t-1",
        userId: "u-1",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe("member");
      }
    });

    it("accepts valid input with lead role", () => {
      const result = addMemberSchema.safeParse({
        id: "tm-1",
        teamId: "t-1",
        userId: "u-1",
        role: "lead",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe("lead");
      }
    });

    it("rejects invalid role", () => {
      const result = addMemberSchema.safeParse({
        id: "tm-1",
        teamId: "t-1",
        userId: "u-1",
        role: "admin",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing teamId", () => {
      const result = addMemberSchema.safeParse({
        id: "tm-1",
        userId: "u-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("removeMember", () => {
    it("accepts valid input", () => {
      const result = removeMemberSchema.safeParse({
        teamId: "t-1",
        memberId: "tm-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing memberId", () => {
      const result = removeMemberSchema.safeParse({
        teamId: "t-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("setMemberRole", () => {
    it("accepts valid input", () => {
      const result = setMemberRoleSchema.safeParse({
        memberId: "tm-1",
        role: "lead",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid role", () => {
      const result = setMemberRoleSchema.safeParse({
        memberId: "tm-1",
        role: "admin",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing memberId", () => {
      const result = setMemberRoleSchema.safeParse({
        role: "member",
      });
      expect(result.success).toBe(false);
    });
  });
});
