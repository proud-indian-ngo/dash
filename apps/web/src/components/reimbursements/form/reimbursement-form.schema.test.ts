import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";

import {
  advancePaymentRequestFormSchema,
  createReimbursementRequestFormSchema,
  createRequestFormSchema,
  reimbursementRequestFormSchema,
  requestFormSchema,
} from "./reimbursement-form.schema";

const validLineItem = {
  amount: "100.00",
  categoryId: "cat-1",
  description: "Office supplies",
  generateVoucher: false,
  id: "test-id-1",
};

const validReimbursement = {
  attachments: [],
  bankAccountIfscCode: "HDFC0001234",
  bankAccountName: "HDFC Savings",
  bankAccountNumber: "1234567890",
  chargedTo: "organisation" as const,
  city: "bangalore" as const,
  expenseDate: new Date(2025, 5, 1),
  lineItems: [validLineItem],
  title: "Monthly Reimbursement",
  type: "reimbursement" as const,
};

const validAdvancePayment = {
  attachments: [],
  bankAccountIfscCode: "HDFC0001234",
  bankAccountName: "HDFC Savings",
  bankAccountNumber: "1234567890",
  city: "mumbai" as const,
  lineItems: [validLineItem],
  title: "Travel Advance",
  type: "advance_payment" as const,
};

beforeEach(() => {
  setSystemTime(new Date(2025, 5, 15));
});

afterEach(() => {});

describe("reimbursementRequestFormSchema", () => {
  it("accepts valid reimbursement data", () => {
    const result = reimbursementRequestFormSchema.safeParse(validReimbursement);
    expect(result.success).toBe(true);
  });

  it("requires the event when charged to an event", () => {
    const result = reimbursementRequestFormSchema.safeParse({
      ...validReimbursement,
      chargedTo: "event",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["eventId"]);
    expect(
      reimbursementRequestFormSchema.safeParse({
        ...validReimbursement,
        chargedTo: "event",
        eventId: "ev-1",
      }).success
    ).toBe(true);
  });

  it("requires the programme when charged to a programme", () => {
    const result = reimbursementRequestFormSchema.safeParse({
      ...validReimbursement,
      chargedTo: "programme",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["chargedProgrammeId"]);
    expect(
      reimbursementRequestFormSchema.safeParse({
        ...validReimbursement,
        chargedProgrammeId: "edu",
        chargedTo: "programme",
      }).success
    ).toBe(true);
  });

  it("rejects empty title", () => {
    const result = reimbursementRequestFormSchema.safeParse({
      ...validReimbursement,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects undefined city", () => {
    const result = reimbursementRequestFormSchema.safeParse({
      ...validReimbursement,
      city: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty line items", () => {
    const result = reimbursementRequestFormSchema.safeParse({
      ...validReimbursement,
      lineItems: [],
    });
    expect(result.success).toBe(false);
  });

  describe("expenseDate", () => {
    it("rejects empty expense date", () => {
      const result = reimbursementRequestFormSchema.safeParse({
        ...validReimbursement,
        expenseDate: undefined,
      });
      expect(result.success).toBe(false);
    });

    it("rejects future expense date", () => {
      const result = reimbursementRequestFormSchema.safeParse({
        ...validReimbursement,
        expenseDate: new Date(2025, 11, 31),
      });
      expect(result.success).toBe(false);
    });

    it("accepts today as expense date", () => {
      const result = reimbursementRequestFormSchema.safeParse({
        ...validReimbursement,
        expenseDate: new Date(),
      });
      expect(result.success).toBe(true);
    });

    it("accepts past expense date", () => {
      const result = reimbursementRequestFormSchema.safeParse({
        ...validReimbursement,
        expenseDate: new Date(2025, 0, 1),
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("advancePaymentRequestFormSchema", () => {
  it("accepts valid advance payment data (no expenseDate)", () => {
    const result =
      advancePaymentRequestFormSchema.safeParse(validAdvancePayment);
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = advancePaymentRequestFormSchema.safeParse({
      ...validAdvancePayment,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects undefined city", () => {
    const result = advancePaymentRequestFormSchema.safeParse({
      ...validAdvancePayment,
      city: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty line items", () => {
    const result = advancePaymentRequestFormSchema.safeParse({
      ...validAdvancePayment,
      lineItems: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("requestFormSchema (discriminated union)", () => {
  it("selects reimbursement schema for type reimbursement", () => {
    const result = requestFormSchema.safeParse(validReimbursement);
    expect(result.success).toBe(true);
  });

  it("selects advance payment schema for type advance_payment", () => {
    const result = requestFormSchema.safeParse(validAdvancePayment);
    expect(result.success).toBe(true);
  });

  it("rejects reimbursement with undefined expenseDate via discriminated union", () => {
    const result = requestFormSchema.safeParse({
      ...validReimbursement,
      expenseDate: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("accepts advance payment without expenseDate via discriminated union", () => {
    const result = requestFormSchema.safeParse(validAdvancePayment);
    expect(result.success).toBe(true);
  });
});

describe("voucher payee checks", () => {
  const voucherItem = (overrides: Record<string, unknown> = {}) => ({
    ...validLineItem,
    amount: "500",
    generateVoucher: true,
    payeeName: "Test Payee",
    payeePhone: "+919876543210",
    ...overrides,
  });
  const messages = (lineItem: Record<string, unknown>, limitPaise = 100_000) =>
    createReimbursementRequestFormSchema(limitPaise)
      .safeParse({ ...validReimbursement, lineItems: [lineItem] })
      .error?.issues.map((issue) => [issue.path.join("."), issue.message]) ??
    [];

  it("accepts a named payee with or without a mobile", () => {
    expect(messages(voucherItem())).toEqual([]);
    expect(messages(voucherItem({ payeePhone: "" }))).toEqual([]);
  });

  it("requires the payee's name on a ticked, eligible item", () => {
    expect(messages(voucherItem({ payeeName: " " }))).toEqual([
      ["lineItems.0.payeeName", "Name who was paid"],
    ]);
  });

  it("needs no payee on an item paid to the claimant", () => {
    expect(
      messages(
        voucherItem({ payeeIsClaimant: true, payeeName: "", payeePhone: "x" })
      )
    ).toEqual([]);
  });

  it("requires the name again once paid to the claimant is unticked", () => {
    expect(
      messages(voucherItem({ payeeIsClaimant: false, payeeName: "" }))
    ).toEqual([["lineItems.0.payeeName", "Name who was paid"]]);
  });

  it("wants the name in English letters", () => {
    expect(messages(voucherItem({ payeeName: "रमेश" }))).toEqual([
      ["lineItems.0.payeeName", "Write the name in English letters"],
    ]);
    expect(messages(voucherItem({ payeeName: "Kṛṣṇa Ḍhaṇḍapāṇi" }))).toEqual(
      []
    );
  });

  it("refuses a mobile that isn't Indian", () => {
    expect(messages(voucherItem({ payeePhone: "+14155550123" }))).toEqual([
      ["lineItems.0.payeePhone", "Enter an Indian mobile number"],
    ]);
  });

  it("ignores a ticked item whose amount grew past the limit", () => {
    expect(
      messages(voucherItem({ amount: "1500", payeeName: "", payeePhone: "x" }))
    ).toEqual([]);
  });

  it("ignores a legacy opted-in item over a lowered limit", () => {
    // Opted in under a ₹1,000 limit, no payee; the limit is now ₹200.
    expect(
      messages(
        voucherItem({ payeeName: undefined, payeePhone: undefined }),
        20_000
      )
    ).toEqual([]);
  });

  it("checks payees under a raised limit", () => {
    expect(
      messages(voucherItem({ amount: "2000", payeeName: "" }), 200_000)
    ).toEqual([["lineItems.0.payeeName", "Name who was paid"]]);
  });

  it("never checks payees on an advance payment", () => {
    expect(
      createRequestFormSchema(100_000).safeParse({
        ...validAdvancePayment,
        lineItems: [voucherItem({ payeeName: "" })],
      }).success
    ).toBe(true);
  });
});
