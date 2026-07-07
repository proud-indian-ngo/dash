import { describe, expect, it } from "vitest";
import { createSchema } from "../advance-payment";

describe("advancePayment mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input", () => {
      const result = createSchema.safeParse({
        attachments: [],
        city: "bangalore",
        id: "ap-1",
        lineItems: [
          {
            amount: 2000,
            categoryId: "cat-1",
            description: "Supplies",
            id: "li-1",
            sortOrder: 0,
          },
        ],
        title: "Event supplies",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid input without optional fields", () => {
      const result = createSchema.safeParse({
        attachments: [],
        id: "ap-1",
        lineItems: [],
        title: "Event supplies",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty title", () => {
      const result = createSchema.safeParse({
        attachments: [],
        id: "ap-1",
        lineItems: [],
        title: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing title", () => {
      const result = createSchema.safeParse({
        attachments: [],
        id: "ap-1",
        lineItems: [],
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid city enum value", () => {
      const result = createSchema.safeParse({
        attachments: [],
        city: "mumbai",
        id: "ap-1",
        lineItems: [],
        title: "Test",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid city enum value", () => {
      const result = createSchema.safeParse({
        attachments: [],
        city: "delhi",
        id: "ap-1",
        lineItems: [],
        title: "Test",
      });
      expect(result.success).toBe(false);
    });

    it("does not require expenseDate field", () => {
      const result = createSchema.safeParse({
        attachments: [],
        id: "ap-1",
        lineItems: [],
        title: "No date needed",
      });
      expect(result.success).toBe(true);
    });

    it("accepts bank account fields", () => {
      const result = createSchema.safeParse({
        attachments: [],
        bankAccountIfscCode: "SBIN0001234",
        bankAccountName: "John Doe",
        bankAccountNumber: "1234567890",
        id: "ap-1",
        lineItems: [],
        title: "With bank info",
      });
      expect(result.success).toBe(true);
    });
  });
});
