import { describe, expect, it } from "vitest";
import { createSchema } from "../reimbursement";

describe("reimbursement mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input", () => {
      const result = createSchema.safeParse({
        attachments: [],
        city: "bangalore",
        expenseDate: new Date("2025-01-15").getTime(),
        id: "r-1",
        lineItems: [
          {
            amount: 500,
            categoryId: "cat-1",
            description: "Travel",
            id: "li-1",
            sortOrder: 0,
          },
        ],
        title: "Travel expenses",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid input without optional fields", () => {
      const result = createSchema.safeParse({
        attachments: [],
        expenseDate: new Date("2025-01-15").getTime(),
        id: "r-1",
        lineItems: [],
        title: "Travel expenses",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty title", () => {
      const result = createSchema.safeParse({
        attachments: [],
        expenseDate: new Date("2025-01-15").getTime(),
        id: "r-1",
        lineItems: [],
        title: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing title", () => {
      const result = createSchema.safeParse({
        attachments: [],
        expenseDate: new Date("2025-01-15").getTime(),
        id: "r-1",
        lineItems: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects future expenseDate", () => {
      const result = createSchema.safeParse({
        attachments: [],
        expenseDate: new Date("2099-12-31").getTime(),
        id: "r-1",
        lineItems: [],
        title: "Future expense",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid expenseDate", () => {
      const result = createSchema.safeParse({
        attachments: [],
        expenseDate: "not-a-date" as unknown as number,
        id: "r-1",
        lineItems: [],
        title: "Bad date",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid city enum value", () => {
      const result = createSchema.safeParse({
        attachments: [],
        city: "mumbai",
        expenseDate: new Date("2025-01-15").getTime(),
        id: "r-1",
        lineItems: [],
        title: "Test",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid city enum value", () => {
      const result = createSchema.safeParse({
        attachments: [],
        city: "delhi",
        expenseDate: new Date("2025-01-15").getTime(),
        id: "r-1",
        lineItems: [],
        title: "Test",
      });
      expect(result.success).toBe(false);
    });
  });
});
