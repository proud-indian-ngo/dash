import { describe, expect, it } from "vitest";
import { createSchema } from "../reimbursement";

describe("reimbursement mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input", () => {
      const result = createSchema.safeParse({
        id: "r-1",
        title: "Travel expenses",
        city: "bangalore",
        expenseDate: new Date("2025-01-15").getTime(),
        lineItems: [
          {
            id: "li-1",
            categoryId: "cat-1",
            description: "Travel",
            amount: 500,
            sortOrder: 0,
          },
        ],
        attachments: [],
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid input without optional fields", () => {
      const result = createSchema.safeParse({
        id: "r-1",
        title: "Travel expenses",
        expenseDate: new Date("2025-01-15").getTime(),
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty title", () => {
      const result = createSchema.safeParse({
        id: "r-1",
        title: "",
        expenseDate: new Date("2025-01-15").getTime(),
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing title", () => {
      const result = createSchema.safeParse({
        id: "r-1",
        expenseDate: new Date("2025-01-15").getTime(),
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects future expenseDate", () => {
      const result = createSchema.safeParse({
        id: "r-1",
        title: "Future expense",
        expenseDate: new Date("2099-12-31").getTime(),
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid expenseDate", () => {
      const result = createSchema.safeParse({
        id: "r-1",
        title: "Bad date",
        expenseDate: "not-a-date" as unknown as number,
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid city enum value", () => {
      const result = createSchema.safeParse({
        id: "r-1",
        title: "Test",
        city: "mumbai",
        expenseDate: new Date("2025-01-15").getTime(),
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid city enum value", () => {
      const result = createSchema.safeParse({
        id: "r-1",
        title: "Test",
        city: "delhi",
        expenseDate: new Date("2025-01-15").getTime(),
        lineItems: [],
        attachments: [],
      });
      expect(result.success).toBe(false);
    });
  });
});
