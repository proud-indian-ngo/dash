import { describe, expect, it, mock } from "bun:test";

import { LEDGER_ACCOUNT_HEAD_IDS } from "@pi-dash/shared/constants";

import type { Context } from "../../context";
import { vendorPaymentMutators } from "../vendor-payment";

const APPROVER: Context = {
  permissions: ["requests.approve"],
  role: "finance_admin",
  userId: "user-1",
};

const PROVISION = LEDGER_ACCOUNT_HEAD_IDS.auditFeesPayable;

/** A client transaction over an invoice waiting for approval and its lines. */
function approvalTx(lines: { id: string; provisionHeadId?: string | null }[]) {
  const updateRequest = mock();
  const updateLine = mock();
  const tx = {
    location: "client",
    mutate: {
      vendorPayment: { update: updateRequest },
      vendorPaymentHistory: { insert: mock() },
      vendorPaymentLineItem: { update: updateLine },
    },
    run: mock()
      .mockResolvedValueOnce({
        status: "invoice_pending",
        title: "Statutory audit",
        userId: "user-2",
      })
      .mockResolvedValueOnce(lines),
  };
  return { tx, updateLine, updateRequest };
}

const approve = (tx: unknown, args: Record<string, unknown>) =>
  vendorPaymentMutators.approveInvoice.fn({
    args: { id: "vp-1", ...args },
    ctx: APPROVER,
    tx,
  } as never);

describe("approving an invoice charged to a provision", () => {
  it("charges the chosen lines to the provision and leaves the others on their category", async () => {
    const { tx, updateLine, updateRequest } = approvalTx([
      { id: "line-1" },
      { id: "line-2" },
    ]);
    await approve(tx, {
      provisionHeadId: PROVISION,
      provisionLineIds: ["line-1"],
    });
    expect(updateLine).toHaveBeenCalledTimes(1);
    expect(updateLine).toHaveBeenCalledWith(
      expect.objectContaining({ id: "line-1", provisionHeadId: PROVISION })
    );
    expect(updateRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" })
    );
  });

  it("puts a line back on its category when it is no longer chosen", async () => {
    const { tx, updateLine } = approvalTx([
      { id: "line-1", provisionHeadId: PROVISION },
    ]);
    await approve(tx, {});
    expect(updateLine).toHaveBeenCalledWith(
      expect.objectContaining({ id: "line-1", provisionHeadId: null })
    );
  });

  it("refuses a head that is not a provision, and a line of another request", async () => {
    const notProvision = approvalTx([{ id: "line-1" }]);
    await expect(
      approve(notProvision.tx, {
        provisionHeadId: LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances,
        provisionLineIds: ["line-1"],
      })
    ).rejects.toThrow("A line can only be charged to a provision");
    const otherLine = approvalTx([{ id: "line-1" }]);
    await expect(
      approve(otherLine.tx, {
        provisionHeadId: PROVISION,
        provisionLineIds: ["line-9"],
      })
    ).rejects.toThrow("That line isn't on this vendor payment");
    expect(otherLine.updateRequest).not.toHaveBeenCalled();
  });
});
