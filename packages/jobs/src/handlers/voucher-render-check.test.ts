import { describe, expect, it } from "bun:test";

import {
  claimantDeclaration,
  onlySignatureChanged,
  type RenderedFrom,
  stillAsRendered,
  voucherPayee,
} from "./voucher-render-check";

const rendered: RenderedFrom = {
  amountPaise: 80_000,
  categoryId: "cat-1",
  claimantId: "claimant-1",
  description: "Cleaning",
  expenseDate: "2026-10-01",
  payeeName: "Test Payee",
  payeePhone: "+919876543210",
  payeeSignatureAttachmentId: "att-sig",
};
const { claimantId, expenseDate, ...item } = rendered;
const request = { claimantId, expenseDate };

describe("stillAsRendered", () => {
  it("links a voucher whose item and date are unchanged", () => {
    expect(stillAsRendered(item, request, rendered)).toBe(true);
  });

  it.each([
    ["amount", { amountPaise: 90_000 }],
    ["category", { categoryId: "cat-2" }],
    ["description", { description: "Painting" }],
    ["payee", { payeeName: "Other Payee" }],
    ["mobile", { payeePhone: null }],
    ["payee signature", { payeeSignatureAttachmentId: null }],
  ])("discards a render when the %s changed", (_, change) => {
    expect(stillAsRendered({ ...item, ...change }, request, rendered)).toBe(
      false
    );
  });

  it("discards a render when the day changed or the item is gone", () => {
    expect(
      stillAsRendered(item, { ...request, expenseDate: "2026-10-02" }, rendered)
    ).toBe(false);
    expect(stillAsRendered(undefined, request, rendered)).toBe(false);
    expect(stillAsRendered(item, undefined, rendered)).toBe(false);
  });

  it("discards a render when the claimant changed", () => {
    expect(
      stillAsRendered(item, { ...request, claimantId: "claimant-2" }, rendered)
    ).toBe(false);
  });
});

describe("onlySignatureChanged", () => {
  it("renders again when only the signature changed", () => {
    expect(
      onlySignatureChanged(
        { ...item, payeeSignatureAttachmentId: "att-new" },
        request,
        rendered
      )
    ).toBe(true);
  });

  it("leaves other changes to the job their edit queued", () => {
    expect(onlySignatureChanged(item, request, rendered)).toBe(false);
    expect(
      onlySignatureChanged(
        { ...item, amountPaise: 1, payeeSignatureAttachmentId: "att-new" },
        request,
        rendered
      )
    ).toBe(false);
    expect(onlySignatureChanged(undefined, request, rendered)).toBe(false);
  });
});

describe("voucherPayee", () => {
  const claimant = { name: "Asha Rao", phone: "+919000000001" };

  it("prints a named payee with their own mobile", () => {
    expect(
      voucherPayee({ payeeName: " Ravi ", payeePhone: null }, claimant)
    ).toEqual({ paidTo: "Ravi", payeePhone: null });
  });

  it("prints the claimant and their mobile when no payee is stored", () => {
    expect(
      voucherPayee({ payeeName: null, payeePhone: null }, claimant)
    ).toEqual({ paidTo: "Asha Rao", payeePhone: "+919000000001" });
  });

  it("prints a claimant name outside the English-letters rule", () => {
    expect(
      voucherPayee(
        { payeeName: null, payeePhone: null },
        { name: "आशा राव", phone: null }
      )
    ).toEqual({ paidTo: "आशा राव", payeePhone: null });
  });

  it("leaves out a claimant mobile that isn't an Indian mobile", () => {
    expect(
      voucherPayee(
        { payeeName: null, payeePhone: null },
        { name: "Asha Rao", phone: "+14155550123" }
      ).payeePhone
    ).toBeNull();
  });

  it("falls back to Unknown without a claimant", () => {
    expect(
      voucherPayee({ payeeName: null, payeePhone: null }, undefined)
    ).toEqual({ paidTo: "Unknown", payeePhone: null });
  });
});

describe("claimantDeclaration", () => {
  const submittedAt = new Date("2026-10-12T10:10:00Z");
  const request = {
    createdAt: new Date("2026-10-12T09:00:00Z"),
    createdBy: "claimant-1",
    submittedAt,
    userId: "claimant-1",
  };
  const paidToClaimant = { payeeName: null };

  it("declares a claim the claimant submitted, at submission", () => {
    expect(
      claimantDeclaration({
        claimantName: "Asha Rao",
        creatorName: undefined,
        item: paidToClaimant,
        request,
      })
    ).toEqual({
      claimantName: "Asha Rao",
      declaredAt: submittedAt.getTime(),
      kind: "self",
    });
  });

  it("says who raised a claim for the claimant", () => {
    expect(
      claimantDeclaration({
        claimantName: "Asha Rao",
        creatorName: "Test Finance",
        item: paidToClaimant,
        request: { ...request, createdBy: "finance-1" },
      })
    ).toEqual({
      claimantName: "Asha Rao",
      creatorName: "Test Finance",
      declaredAt: submittedAt.getTime(),
      kind: "raised",
    });
  });

  it("falls back to creation for claims from before submittedAt", () => {
    expect(
      claimantDeclaration({
        claimantName: "Asha Rao",
        creatorName: undefined,
        item: paidToClaimant,
        request: { ...request, createdBy: null, submittedAt: null },
      })?.declaredAt
    ).toBe(request.createdAt.getTime());
  });

  it("gives a named payee none: they sign", () => {
    expect(
      claimantDeclaration({
        claimantName: "Asha Rao",
        creatorName: undefined,
        item: { payeeName: "Ravi" },
        request,
      })
    ).toBeNull();
  });
});
