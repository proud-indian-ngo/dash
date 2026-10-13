import { describe, expect, it } from "bun:test";

import {
  buildTransactionFormSchema,
  toTransactionPayload,
} from "./vendor-payment-transaction-form.schema";

const values = {
  amount: "19.99",
  attachments: [],
  description: "",
  paymentMethod: "UPI",
  paymentReference: "",
  transactionDate: new Date("2026-04-01T00:00:00Z"),
};

describe("toTransactionPayload", () => {
  it("converts the rupee amount to paise", () => {
    expect(toTransactionPayload(values)).toEqual({
      amountPaise: 1999,
      attachments: [],
      description: undefined,
      paymentMethod: "UPI",
      paymentReference: undefined,
      transactionDate: values.transactionDate.getTime(),
    });
  });
});

describe("buildTransactionFormSchema", () => {
  it("allows up to the remaining balance", () => {
    const schema = buildTransactionFormSchema(1999);
    expect(schema.safeParse(values).success).toBe(true);
    expect(schema.safeParse({ ...values, amount: "20" }).success).toBe(false);
  });

  it("rejects an amount above the per-transaction limit", () => {
    const result = buildTransactionFormSchema().safeParse({
      ...values,
      amount: "10000000000",
    });
    expect(result.error?.issues[0]?.message).toBe(
      "Amount can be at most ₹9,99,99,99,999.99"
    );
  });
});
