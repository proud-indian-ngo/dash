import { describe, expect, it } from "vitest";

import {
  payeeSignatureStatement,
  signatureExpenseDay,
} from "./payee-signature";

// Synthetic details only.
const facts = {
  amountPaise: 50_000,
  categoryName: "Labour",
  description: "Cleaning the community hall",
  expenseDate: "2026-10-12",
  payeeName: "Test Payee",
};

describe("payeeSignatureStatement", () => {
  it("names the payee, amount, purpose and day", () => {
    expect(payeeSignatureStatement(facts)).toBe(
      "I, Test Payee, received ₹500 from Proud Indian for Cleaning the community hall on 12 Oct 2026."
    );
  });

  it("prints paise when the amount has them", () => {
    expect(
      payeeSignatureStatement({ ...facts, amountPaise: 99_950 })
    ).toContain("received ₹999.50 from");
  });

  it("falls back to the category without a description", () => {
    expect(payeeSignatureStatement({ ...facts, description: "  " })).toContain(
      "for Labour on"
    );
  });

  it("drops a trailing full stop and folds spaces", () => {
    expect(
      payeeSignatureStatement({
        ...facts,
        description: "Moving  chairs\nand tables.",
      })
    ).toContain("for Moving chairs and tables on 12 Oct 2026.");
  });

  it("reads an epoch expense date as the day in India", () => {
    // 11 Oct 2026, 20:00 UTC is 12 Oct in India.
    const epoch = Date.UTC(2026, 9, 11, 20, 0);
    expect(signatureExpenseDay(epoch)).toBe("2026-10-12");
    expect(payeeSignatureStatement({ ...facts, expenseDate: epoch })).toBe(
      payeeSignatureStatement(facts)
    );
  });
});
