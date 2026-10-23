import { describe, expect, it, setSystemTime } from "bun:test";

import { createSchema } from "../reimbursement";

describe("reimbursement mutator schemas", () => {
  describe("create", () => {
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

    it("accepts today's date before 05:30 in India", () => {
      // 02:00 on 17 Oct in India; the form sends 17 Oct as UTC midnight.
      setSystemTime(new Date("2026-10-16T20:30:00Z"));
      try {
        const result = createSchema.safeParse({
          attachments: [],
          expenseDate: Date.UTC(2026, 9, 17),
          id: "r-1",
          lineItems: [],
          title: "Late night auto",
        });
        expect(result.success).toBe(true);
      } finally {
        setSystemTime();
      }
    });
  });
});
