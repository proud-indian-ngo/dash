import { describe, expect, it } from "bun:test";

import z from "zod";

import { createBankAccountArgs } from "../bank-account";

const deleteSchema = z.object({
  id: z.string().min(1),
});

const setDefaultSchema = z.object({
  id: z.string().min(1),
});

describe("bankAccount mutator schemas", () => {
  describe("create", () => {
    const parse = (value: Record<string, string>) =>
      createBankAccountArgs.safeParse({
        accountName: "John Doe",
        id: "ba-1",
        ...value,
      }).success;

    it("accepts bank details", () => {
      expect(
        parse({ accountNumber: "1234567890123456", ifscCode: "HDFC0000001" })
      ).toBe(true);
    });

    it("accepts a UPI ID or number alone", () => {
      expect(parse({ upiId: "john@okhdfc" })).toBe(true);
      expect(parse({ upiId: "9876543210" })).toBe(true);
    });

    it("accepts bank details and UPI together", () => {
      expect(
        parse({
          accountNumber: "1234567890",
          ifscCode: "HDFC0000001",
          upiId: "john@okhdfc",
        })
      ).toBe(true);
    });

    it("rejects an entry with neither", () => {
      expect(parse({})).toBe(false);
    });

    it("rejects an account number without a valid IFSC", () => {
      expect(parse({ accountNumber: "1234567890" })).toBe(false);
      expect(parse({ accountNumber: "1234567890", ifscCode: "CODE" })).toBe(
        false
      );
    });

    it("rejects an invalid UPI value", () => {
      expect(parse({ upiId: "john" })).toBe(false);
    });

    it("rejects an empty name or missing id", () => {
      expect(parse({ accountName: "", upiId: "john@okhdfc" })).toBe(false);
      expect(
        createBankAccountArgs.safeParse({
          accountName: "John Doe",
          upiId: "john@okhdfc",
        }).success
      ).toBe(false);
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
