import { describe, expect, it } from "vitest";
import { advancePaymentFormSchema } from "./advance-payment-form.schema";

const validLineItem = {
  id: "test-id-1",
  categoryId: "cat-1",
  description: "Office supplies",
  amount: "100.00",
};

const validFileAttachment = {
  id: "att-1",
  type: "file" as const,
  filename: "receipt.pdf",
  objectKey: "uploads/receipt.pdf",
  mimeType: "application/pdf",
};

const validUrlAttachment = {
  id: "att-2",
  type: "url" as const,
  url: "https://example.com/receipt.png",
};

const validData = {
  title: "Office Supplies Purchase",
  city: "bangalore" as const,
  bankAccountName: "HDFC Savings",
  bankAccountNumber: "1234567890",
  bankAccountIfscCode: "HDFC0001234",
  lineItems: [validLineItem],
  attachments: [],
};

describe("advancePaymentFormSchema", () => {
  it("accepts valid data with all fields", () => {
    const result = advancePaymentFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("accepts valid data with optional fields omitted", () => {
    const result = advancePaymentFormSchema.safeParse({
      title: "Test",
      city: "mumbai",
      bankAccountName: "SBI",
      lineItems: [validLineItem],
      attachments: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts file attachments", () => {
    const result = advancePaymentFormSchema.safeParse({
      ...validData,
      attachments: [validFileAttachment],
    });
    expect(result.success).toBe(true);
  });

  it("accepts url attachments", () => {
    const result = advancePaymentFormSchema.safeParse({
      ...validData,
      attachments: [validUrlAttachment],
    });
    expect(result.success).toBe(true);
  });

  it("accepts mixed attachments", () => {
    const result = advancePaymentFormSchema.safeParse({
      ...validData,
      attachments: [validFileAttachment, validUrlAttachment],
    });
    expect(result.success).toBe(true);
  });

  describe("title", () => {
    it("rejects empty title", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        title: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const titleError = result.error.issues.find(
          (i) => i.path.at(0) === "title"
        );
        expect(titleError?.message).toBe("Title is required");
      }
    });

    it("rejects missing title", () => {
      const { title: _, ...noTitle } = validData;
      const result = advancePaymentFormSchema.safeParse(noTitle);
      expect(result.success).toBe(false);
    });
  });

  describe("city", () => {
    it("accepts bangalore", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        city: "bangalore",
      });
      expect(result.success).toBe(true);
    });

    it("accepts mumbai", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        city: "mumbai",
      });
      expect(result.success).toBe(true);
    });

    it("rejects undefined city", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        city: undefined,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const cityError = result.error.issues.find(
          (i) => i.path.at(0) === "city"
        );
        expect(cityError?.message).toBe("City is required");
      }
    });

    it("rejects invalid city value", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        city: "delhi",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("bankAccountName", () => {
    it("rejects empty bank account name", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        bankAccountName: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find(
          (i) => i.path.at(0) === "bankAccountName"
        );
        expect(error?.message).toBe("Bank account is required");
      }
    });
  });

  describe("lineItems", () => {
    it("rejects empty line items array", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        lineItems: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find(
          (i) => i.path.at(0) === "lineItems"
        );
        expect(error?.message).toBe("At least one line item is required");
      }
    });

    it("accepts multiple line items", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        lineItems: [
          validLineItem,
          { ...validLineItem, id: "test-id-2", description: "Travel" },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects line item with empty categoryId", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        lineItems: [{ ...validLineItem, categoryId: "" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects line item with empty description", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        lineItems: [{ ...validLineItem, description: "" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects line item with empty amount", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        lineItems: [{ ...validLineItem, amount: "" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects line item with zero amount", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        lineItems: [{ ...validLineItem, amount: "0" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects line item with negative amount", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        lineItems: [{ ...validLineItem, amount: "-10" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects line item with more than 2 decimal places", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        lineItems: [{ ...validLineItem, amount: "10.123" }],
      });
      expect(result.success).toBe(false);
    });

    it("accepts line item with exactly 2 decimal places", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        lineItems: [{ ...validLineItem, amount: "10.50" }],
      });
      expect(result.success).toBe(true);
    });

    it("rejects whitespace-only description", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        lineItems: [{ ...validLineItem, description: "   " }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("attachments", () => {
    it("rejects url attachment with invalid url", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        attachments: [{ id: "a1", type: "url", url: "not-a-url" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects file attachment with empty filename", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        attachments: [
          { id: "a1", type: "file", filename: "", objectKey: "key" },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("rejects file attachment with empty objectKey", () => {
      const result = advancePaymentFormSchema.safeParse({
        ...validData,
        attachments: [
          { id: "a1", type: "file", filename: "f.pdf", objectKey: "" },
        ],
      });
      expect(result.success).toBe(false);
    });
  });
});
