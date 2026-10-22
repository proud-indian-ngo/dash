import { describe, expect, it } from "bun:test";

import {
  mapLineItemsToFormValues,
  mapQuotationAttachmentsToFormValues,
  paiseToFormAmount,
} from "./submission-mappers";

describe("paiseToFormAmount", () => {
  it("prefills exact rupee text without trailing zeros", () => {
    expect(paiseToFormAmount(1999)).toBe("19.99");
    expect(paiseToFormAmount(150_000)).toBe("1500");
    expect(paiseToFormAmount(150_050)).toBe("1500.5");
    expect(paiseToFormAmount(1)).toBe("0.01");
    expect(paiseToFormAmount(10)).toBe("0.1");
    expect(paiseToFormAmount(100)).toBe("1");
  });
});

describe("mapLineItemsToFormValues", () => {
  it("maps paise amounts to rupee strings", () => {
    const result = mapLineItemsToFormValues([
      { amountPaise: 15_050, categoryId: "c1", description: "Taxi", id: "1" },
    ]);
    expect(result).toEqual([
      {
        amount: "150.5",
        categoryId: "c1",
        description: "Taxi",
        generateVoucher: false,
        id: "1",
        payeeIsClaimant: false,
        payeeName: "",
        payeePhone: "",
      },
    ]);
  });

  it("ticks paid to the claimant on a voucher item with no payee", () => {
    const item = { amountPaise: 50_000, categoryId: "c1", description: "A" };
    const result = mapLineItemsToFormValues([
      { ...item, generateVoucher: true, id: "1", payeeName: null },
      { ...item, generateVoucher: true, id: "2", payeeName: "Ravi" },
      { ...item, generateVoucher: false, id: "3", payeeName: null },
    ]);
    expect(result.map((li) => li.payeeIsClaimant)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("maps null description to empty string", () => {
    const result = mapLineItemsToFormValues([
      { amountPaise: 10_000, categoryId: "c1", description: null, id: "1" },
    ]);
    expect(result.at(0)?.description).toBe("");
  });

  it("drops trailing zero paise like the old number display", () => {
    const result = mapLineItemsToFormValues([
      { amountPaise: 20_000, categoryId: "c1", description: "A", id: "1" },
      { amountPaise: 1999, categoryId: "c1", description: "B", id: "2" },
    ]);
    expect(result.map((li) => li.amount)).toEqual(["200", "19.99"]);
  });

  it("returns empty array for empty input", () => {
    expect(mapLineItemsToFormValues([])).toEqual([]);
  });
});

describe("mapQuotationAttachmentsToFormValues", () => {
  it("leaves out invoice files so editing a request with an invoice saves", () => {
    const result = mapQuotationAttachmentsToFormValues([
      {
        filename: "quote.pdf",
        id: "q1",
        mimeType: "application/pdf",
        objectKey: "prod/attachments/vendor-payments/vp1/quotation/quote.pdf",
        purpose: "quotation",
        type: "file",
      },
      {
        filename: "invoice.pdf",
        id: "i1",
        mimeType: "application/pdf",
        objectKey: "prod/attachments/vendor-payments/vp1/invoice/invoice.pdf",
        purpose: "invoice",
        type: "file",
      },
      {
        id: "q2",
        purpose: "quotation",
        type: "url",
        url: "https://example.com/quote",
      },
    ]);
    expect(result.map((att) => att.id)).toEqual(["q1", "q2"]);
  });
});
