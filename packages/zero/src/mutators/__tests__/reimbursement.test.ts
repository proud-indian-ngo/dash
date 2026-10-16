import { describe, expect, it } from "bun:test";

import { createSchema } from "../reimbursement";

describe("reimbursement mutator schemas", () => {
  describe("create", () => {
    it("accepts valid input", () => {
      const result = createSchema.safeParse({
        attachments: [],
        costCentreId: "cc-blr",
        expenseDate: new Date("2025-01-15").getTime(),
        id: "r-1",
        lineItems: [
          {
            amountPaise: 50_000,
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

    it("accepts a cost centre id", () => {
      const result = createSchema.safeParse({
        attachments: [],
        costCentreId: "cc-mum",
        expenseDate: new Date("2025-01-15").getTime(),
        id: "r-1",
        lineItems: [],
        title: "Test",
      });
      expect(result.success).toBe(true);
    });

    it("rejects a cost centre that is not an id string", () => {
      const result = createSchema.safeParse({
        attachments: [],
        costCentreId: 42,
        expenseDate: new Date("2025-01-15").getTime(),
        id: "r-1",
        lineItems: [],
        title: "Test",
      });
      expect(result.success).toBe(false);
    });
  });
});
