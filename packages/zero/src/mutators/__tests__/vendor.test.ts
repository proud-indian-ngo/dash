import { describe, expect, it } from "vitest";
import z from "zod";

const createSchema = z.object({
  address: z.string().optional(),
  bankAccountIfscCode: z.string().min(1),
  bankAccountName: z.string().min(1),
  bankAccountNumber: z.string().min(1),
  contactEmail: z.string().optional(),
  contactPhone: z.string().min(1),
  gstNumber: z.string().optional(),
  id: z.string(),
  name: z.string().min(1),
  panNumber: z.string().optional(),
  status: z.enum(["pending", "approved"]).optional(),
});

const deleteSchema = z.object({ id: z.string() });

describe("vendor mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input with all required fields", () => {
      const result = createSchema.safeParse({
        bankAccountIfscCode: "SBIN0001234",
        bankAccountName: "Acme Corp",
        bankAccountNumber: "1234567890",
        contactPhone: "+91-9876543210",
        id: "v-1",
        name: "Acme Corp",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid input with optional fields", () => {
      const result = createSchema.safeParse({
        address: "123 Main St",
        bankAccountIfscCode: "SBIN0001234",
        bankAccountName: "Acme Corp",
        bankAccountNumber: "1234567890",
        contactEmail: "acme@example.com",
        contactPhone: "+91-9876543210",
        gstNumber: "29ABCDE1234F1Z5",
        id: "v-1",
        name: "Acme Corp",
        panNumber: "ABCDE1234F",
        status: "approved",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createSchema.safeParse({
        bankAccountIfscCode: "SBIN",
        bankAccountName: "Acme",
        bankAccountNumber: "123",
        contactPhone: "+91-9876543210",
        id: "v-1",
        name: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty phone", () => {
      const result = createSchema.safeParse({
        bankAccountIfscCode: "SBIN",
        bankAccountName: "Acme",
        bankAccountNumber: "123",
        contactPhone: "",
        id: "v-1",
        name: "Acme",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty bank account fields", () => {
      expect(
        createSchema.safeParse({
          bankAccountIfscCode: "SBIN",
          bankAccountName: "",
          bankAccountNumber: "123",
          contactPhone: "123",
          id: "v-1",
          name: "Acme",
        }).success
      ).toBe(false);

      expect(
        createSchema.safeParse({
          bankAccountIfscCode: "SBIN",
          bankAccountName: "Acme",
          bankAccountNumber: "",
          contactPhone: "123",
          id: "v-1",
          name: "Acme",
        }).success
      ).toBe(false);

      expect(
        createSchema.safeParse({
          bankAccountIfscCode: "",
          bankAccountName: "Acme",
          bankAccountNumber: "123",
          contactPhone: "123",
          id: "v-1",
          name: "Acme",
        }).success
      ).toBe(false);
    });

    it("rejects invalid status", () => {
      const result = createSchema.safeParse({
        bankAccountIfscCode: "SBIN",
        bankAccountName: "Acme",
        bankAccountNumber: "123",
        contactPhone: "123",
        id: "v-1",
        name: "Acme",
        status: "rejected",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("delete", () => {
    it("accepts valid input", () => {
      const result = deleteSchema.safeParse({ id: "v-1" });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = deleteSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
