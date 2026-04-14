import { describe, expect, it } from "vitest";
import z from "zod";

const createSchema = z.object({
  id: z.string(),
  accountName: z.string().min(1),
  accountNumber: z.string().min(1),
  ifscCode: z.string().min(1),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

const setDefaultSchema = z.object({
  id: z.string().min(1),
});

describe("bankAccount mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input with all fields", () => {
      const result = createSchema.safeParse({
        id: "ba-1",
        accountName: "John Doe Savings",
        accountNumber: "1234567890123456",
        ifscCode: "HDFC0000001",
      });
      expect(result.success).toBe(true);
    });

    it("accepts minimal valid input", () => {
      const result = createSchema.safeParse({
        id: "ba-1",
        accountName: "Account",
        accountNumber: "123456",
        ifscCode: "CODE",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing accountName", () => {
      const result = createSchema.safeParse({
        id: "ba-1",
        accountNumber: "1234567890123456",
        ifscCode: "HDFC0000001",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty accountName", () => {
      const result = createSchema.safeParse({
        id: "ba-1",
        accountName: "",
        accountNumber: "1234567890123456",
        ifscCode: "HDFC0000001",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing accountNumber", () => {
      const result = createSchema.safeParse({
        id: "ba-1",
        accountName: "John Doe",
        ifscCode: "HDFC0000001",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty accountNumber", () => {
      const result = createSchema.safeParse({
        id: "ba-1",
        accountName: "John Doe",
        accountNumber: "",
        ifscCode: "HDFC0000001",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing ifscCode", () => {
      const result = createSchema.safeParse({
        id: "ba-1",
        accountName: "John Doe",
        accountNumber: "1234567890123456",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty ifscCode", () => {
      const result = createSchema.safeParse({
        id: "ba-1",
        accountName: "John Doe",
        accountNumber: "1234567890123456",
        ifscCode: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing id", () => {
      const result = createSchema.safeParse({
        accountName: "John Doe",
        accountNumber: "1234567890123456",
        ifscCode: "HDFC0000001",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("delete", () => {
    it("accepts valid input", () => {
      const result = deleteSchema.safeParse({
        id: "ba-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = deleteSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects empty id", () => {
      const result = deleteSchema.safeParse({
        id: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("setDefault", () => {
    it("accepts valid input", () => {
      const result = setDefaultSchema.safeParse({
        id: "ba-1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = setDefaultSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects empty id", () => {
      const result = setDefaultSchema.safeParse({
        id: "",
      });
      expect(result.success).toBe(false);
    });
  });
});
