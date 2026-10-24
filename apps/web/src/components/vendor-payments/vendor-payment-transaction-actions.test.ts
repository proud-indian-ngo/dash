import { describe, expect, it } from "bun:test";

import { getTransactionActions } from "./vendor-payment-transaction-actions";

const base = {
  canDeleteAll: false,
  canDeleteOwn: true,
  canEditAll: false,
  isInvoiceLocked: false,
  isPending: true,
  isPosted: false,
  isRecorder: true,
  isVoided: false,
};

describe("getTransactionActions", () => {
  it("lets the recorder edit and delete a pending payment", () => {
    expect(getTransactionActions(base)).toEqual({
      canDelete: true,
      canEdit: true,
    });
  });

  it("denies a payment someone else recorded", () => {
    expect(getTransactionActions({ ...base, isRecorder: false })).toEqual({
      canDelete: false,
      canEdit: false,
    });
  });

  it("denies the recorder once the payment is reviewed or the invoice is locked", () => {
    for (const override of [{ isPending: false }, { isInvoiceLocked: true }]) {
      expect(getTransactionActions({ ...base, ...override })).toEqual({
        canDelete: false,
        canEdit: false,
      });
    }
  });

  it("needs delete_own for the recorder to delete", () => {
    expect(getTransactionActions({ ...base, canDeleteOwn: false })).toEqual({
      canDelete: false,
      canEdit: true,
    });
  });

  it("lets edit_all and delete_all holders act on anyone's pending payment", () => {
    expect(
      getTransactionActions({
        ...base,
        canDeleteAll: true,
        canEditAll: true,
        isRecorder: false,
      })
    ).toEqual({ canDelete: true, canEdit: true });
  });

  it("does not grant edit_all access to reviewed payments", () => {
    expect(
      getTransactionActions({
        ...base,
        canDeleteAll: true,
        canEditAll: true,
        isPending: false,
        isRecorder: false,
      })
    ).toEqual({ canDelete: true, canEdit: false });
  });

  it("never changes an invoice-locked, posted, or voided payment", () => {
    const admin = { ...base, canDeleteAll: true, canEditAll: true };
    expect(getTransactionActions({ ...admin, isInvoiceLocked: true })).toEqual({
      canDelete: false,
      canEdit: false,
    });
    expect(getTransactionActions({ ...admin, isPosted: true })).toEqual({
      canDelete: false,
      canEdit: false,
    });
    expect(getTransactionActions({ ...admin, isVoided: true })).toEqual({
      canDelete: false,
      canEdit: false,
    });
  });
});
