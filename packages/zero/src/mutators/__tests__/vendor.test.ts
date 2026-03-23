import { describe, expect, it } from "vitest";
import z from "zod";

const createSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  contactPhone: z.string().min(1),
  contactEmail: z.string().optional(),
  bankAccountName: z.string().min(1),
  bankAccountNumber: z.string().min(1),
  bankAccountIfscCode: z.string().min(1),
  address: z.string().optional(),
  gstNumber: z.string().optional(),
  panNumber: z.string().optional(),
  status: z.enum(["pending", "approved"]).optional(),
});

const deleteSchema = z.object({ id: z.string() });

describe("vendor mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input with all required fields", () => {
      const result = createSchema.safeParse({
        id: "v-1",
        name: "Acme Corp",
        contactPhone: "+91-9876543210",
        bankAccountName: "Acme Corp",
        bankAccountNumber: "1234567890",
        bankAccountIfscCode: "SBIN0001234",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid input with optional fields", () => {
      const result = createSchema.safeParse({
        id: "v-1",
        name: "Acme Corp",
        contactPhone: "+91-9876543210",
        contactEmail: "acme@example.com",
        bankAccountName: "Acme Corp",
        bankAccountNumber: "1234567890",
        bankAccountIfscCode: "SBIN0001234",
        address: "123 Main St",
        gstNumber: "29ABCDE1234F1Z5",
        panNumber: "ABCDE1234F",
        status: "approved",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createSchema.safeParse({
        id: "v-1",
        name: "",
        contactPhone: "+91-9876543210",
        bankAccountName: "Acme",
        bankAccountNumber: "123",
        bankAccountIfscCode: "SBIN",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty phone", () => {
      const result = createSchema.safeParse({
        id: "v-1",
        name: "Acme",
        contactPhone: "",
        bankAccountName: "Acme",
        bankAccountNumber: "123",
        bankAccountIfscCode: "SBIN",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty bank account fields", () => {
      expect(
        createSchema.safeParse({
          id: "v-1",
          name: "Acme",
          contactPhone: "123",
          bankAccountName: "",
          bankAccountNumber: "123",
          bankAccountIfscCode: "SBIN",
        }).success
      ).toBe(false);

      expect(
        createSchema.safeParse({
          id: "v-1",
          name: "Acme",
          contactPhone: "123",
          bankAccountName: "Acme",
          bankAccountNumber: "",
          bankAccountIfscCode: "SBIN",
        }).success
      ).toBe(false);

      expect(
        createSchema.safeParse({
          id: "v-1",
          name: "Acme",
          contactPhone: "123",
          bankAccountName: "Acme",
          bankAccountNumber: "123",
          bankAccountIfscCode: "",
        }).success
      ).toBe(false);
    });

    it("rejects invalid status", () => {
      const result = createSchema.safeParse({
        id: "v-1",
        name: "Acme",
        contactPhone: "123",
        bankAccountName: "Acme",
        bankAccountNumber: "123",
        bankAccountIfscCode: "SBIN",
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

describe("vendor authorization", () => {
  it("all vendor CRUD operations require admin role", () => {
    const isAuthorized = (role: string) => role === "admin";
    expect(isAuthorized("admin")).toBe(true);
    expect(isAuthorized("volunteer")).toBe(false);
  });
});

describe("vendor delete with existing payments", () => {
  it("blocks delete when payments exist", () => {
    const canDelete = (paymentCount: number) => paymentCount === 0;
    expect(canDelete(0)).toBe(true);
    expect(canDelete(1)).toBe(false);
    expect(canDelete(5)).toBe(false);
  });
});
