import { describe, expect, it } from "bun:test";

import { MAX_AMOUNT_PAISE } from "@pi-dash/shared/money";

import {
  computeRunningTotalPaise,
  lineItemSchema,
  newLineItem,
  positiveRupeesSchema,
  toLineItemsPayload,
} from "./form-schemas";

describe("computeRunningTotalPaise", () => {
  it("sums valid amounts", () => {
    const items = [
      {
        amount: "100.50",
        categoryId: "c",
        description: "a",
        generateVoucher: false,
        id: "1",
      },
      {
        amount: "200",
        categoryId: "c",
        description: "b",
        generateVoucher: false,
        id: "2",
      },
    ];
    expect(computeRunningTotalPaise(items)).toBe(30_050);
  });

  it("returns 0 for empty array", () => {
    expect(computeRunningTotalPaise([])).toBe(0);
  });

  it("treats non-numeric amounts as 0", () => {
    const items = [
      {
        amount: "abc",
        categoryId: "c",
        description: "a",
        generateVoucher: false,
        id: "1",
      },
      {
        amount: "",
        categoryId: "c",
        description: "b",
        generateVoucher: false,
        id: "2",
      },
      {
        amount: "50",
        categoryId: "c",
        description: "c",
        generateVoucher: false,
        id: "3",
      },
    ];
    expect(computeRunningTotalPaise(items)).toBe(5000);
  });
});

describe("lineItemSchema", () => {
  const valid = {
    amount: "150.50",
    categoryId: "cat-1",
    description: "Taxi fare",
    generateVoucher: false,
    id: "li-1",
  };

  it("accepts valid line item", () => {
    expect(lineItemSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty categoryId", () => {
    expect(lineItemSchema.safeParse({ ...valid, categoryId: "" }).success).toBe(
      false
    );
  });

  it("rejects whitespace-only description", () => {
    expect(
      lineItemSchema.safeParse({ ...valid, description: "   " }).success
    ).toBe(false);
  });

  it("rejects empty amount", () => {
    expect(lineItemSchema.safeParse({ ...valid, amount: "" }).success).toBe(
      false
    );
  });

  it("rejects non-positive amounts", () => {
    expect(lineItemSchema.safeParse({ ...valid, amount: "0" }).success).toBe(
      false
    );
    expect(lineItemSchema.safeParse({ ...valid, amount: "-10" }).success).toBe(
      false
    );
  });

  it("accepts amounts that float arithmetic would distort", () => {
    expect(
      lineItemSchema.safeParse({ ...valid, amount: "19.99" }).success
    ).toBe(true);
  });

  it("rejects amount with more than 2 decimal places", () => {
    expect(
      lineItemSchema.safeParse({ ...valid, amount: "10.123" }).success
    ).toBe(false);
  });
});

const issue = (value: string) =>
  positiveRupeesSchema.safeParse(value).error?.issues[0]?.message;

describe("positiveRupeesSchema", () => {
  it("accepts rupee amounts with up to 2 decimals", () => {
    for (const ok of ["19.99", "1500", "5.", ".5", "0.01", "9999999999.99"]) {
      expect(positiveRupeesSchema.safeParse(ok).success).toBe(true);
    }
  });

  it("explains the accepted format", () => {
    for (const bad of ["1e3", "1.234", "abc", ".", "1,000"]) {
      expect(issue(bad)).toBe(
        "Enter an amount in rupees with up to 2 decimals"
      );
    }
    expect(issue("")).toBe("Amount required");
    expect(issue("0")).toBe("Must be greater than 0");
  });

  it("caps an amount at the old numeric(12,2) limit", () => {
    expect(issue("10000000000")).toBe(
      "Amount can be at most ₹9,99,99,99,999.99"
    );
  });
});

describe("toLineItemsPayload", () => {
  it("converts rupee text to paise and numbers the items", () => {
    const items = [
      { ...newLineItem(), amount: "19.99", categoryId: "c1", id: "a" },
      { ...newLineItem(), amount: "1500", categoryId: "c1", id: "b" },
    ];
    const payload = toLineItemsPayload(items);
    expect(payload.map((li) => li.amountPaise)).toEqual([1999, 150_000]);
    expect(payload.map((li) => li.sortOrder)).toEqual([0, 1]);
    expect(payload[0]).not.toHaveProperty("amount");
  });

  it("sends the voucher and payee only for ticked, eligible items", () => {
    const ticked = {
      ...newLineItem(),
      generateVoucher: true,
      payeeName: " Test Payee ",
      payeePhone: "+919876543210",
    };
    const payload = toLineItemsPayload(
      [
        { ...ticked, amount: "900" },
        // Ticked and named, then the amount grew past the limit.
        { ...ticked, amount: "1500" },
        { ...ticked, amount: "900", generateVoucher: false },
      ],
      100_000
    );
    expect(
      payload.map((li) => [li.generateVoucher, li.payeeName, li.payeePhone])
    ).toEqual([
      [true, "Test Payee", "+919876543210"],
      [false, null, null],
      [false, null, null],
    ]);
  });

  it("sends no voucher without a limit (vendor payments)", () => {
    const [item] = toLineItemsPayload([
      {
        ...newLineItem(),
        amount: "500",
        generateVoucher: true,
        payeeName: "X",
      },
    ]);
    expect(item?.generateVoucher).toBe(false);
    expect(item?.payeeName).toBeNull();
  });

  it("stores the payee name in NFC", () => {
    const decomposed = "Kr\u0323s\u0323n\u0323a";
    const [item] = toLineItemsPayload(
      [
        {
          ...newLineItem(),
          amount: "500",
          generateVoucher: true,
          payeeName: decomposed,
        },
      ],
      100_000
    );
    expect(item?.payeeName).toBe("Kṛṣṇa");
  });
});

describe("computeRunningTotalPaise with capped items", () => {
  it("totals several max-value items without leaving the safe range", () => {
    const max = "9999999999.99";
    const items = Array.from({ length: 20 }, () => ({
      ...newLineItem(),
      amount: max,
    }));
    expect(computeRunningTotalPaise(items)).toBe(20 * MAX_AMOUNT_PAISE);
  });
});
