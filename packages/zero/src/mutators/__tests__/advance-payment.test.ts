import { describe, expect, it } from "vitest";
import { createSchema } from "../advance-payment";

describe("advancePayment mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input", () => {
      const result = createSchema.safeParse({
        id: "ap-1",
        title: "Event supplies",
        city: "bangalore",
        lineItems: [
          {
            id: "li-1",
            categoryId: "cat-1",
            description: "Supplies",
            amount: 2000,
            sortOrder: 0,
          },
        ],
        attachments: [],
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid input without optional fields", () => {
      const result = createSchema.safeParse({
        id: "ap-1",
        title: "Event supplies",
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty title", () => {
      const result = createSchema.safeParse({
        id: "ap-1",
        title: "",
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing title", () => {
      const result = createSchema.safeParse({
        id: "ap-1",
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid city enum value", () => {
      const result = createSchema.safeParse({
        id: "ap-1",
        title: "Test",
        city: "mumbai",
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid city enum value", () => {
      const result = createSchema.safeParse({
        id: "ap-1",
        title: "Test",
        city: "delhi",
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(false);
    });

    it("does not require expenseDate field", () => {
      const result = createSchema.safeParse({
        id: "ap-1",
        title: "No date needed",
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(true);
    });

    it("accepts bank account fields", () => {
      const result = createSchema.safeParse({
        id: "ap-1",
        title: "With bank info",
        bankAccountName: "John Doe",
        bankAccountNumber: "1234567890",
        bankAccountIfscCode: "SBIN0001234",
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(true);
    });
  });
});
