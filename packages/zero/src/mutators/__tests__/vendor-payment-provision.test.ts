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

/** A client transaction for editing a request whose line is charged to the provision. */
function editTx() {
  const insertLine = mock();
  const insertHistory = mock();
  const existing = [
    {
      amountPaise: 15_000,
      categoryId: "cat-1",
      id: "line-1",
      provisionHeadId: PROVISION,
    },
  ];
  const tx = {
    location: "client",
    mutate: {
      vendorPayment: { update: mock() },
      vendorPaymentAttachment: { delete: mock(), insert: mock() },
      vendorPaymentHistory: { insert: insertHistory },
      vendorPaymentLineItem: { delete: mock(), insert: insertLine },
    },
    run: mock()
      .mockResolvedValueOnce({
        chargedTo: "organisation",
        costCentreId: "cc-blr",
        status: "completed",
        title: "Statutory audit",
        userId: "user-2",
      })
      .mockResolvedValueOnce({ createdBy: "user-2", status: "approved" })
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce([]),
  };
  return { insertHistory, insertLine, tx };
}

const edit = (tx: unknown, line: { amountPaise: number; categoryId: string }) =>
  vendorPaymentMutators.update.fn({
    args: {
      attachments: [],
      chargedTo: "organisation",
      id: "vp-1",
      lineItems: [
        {
          ...line,
          description: "Audit fee",
          generateVoucher: false,
          id: "line-1",
          sortOrder: 0,
        },
      ],
      title: "Statutory audit",
      vendorId: "vendor-1",
    },
    ctx: {
      permissions: ["requests.edit_all_statuses"],
      role: "finance_admin",
      userId: "user-1",
    },
    tx,
  } as never);

describe("editing a request with a line charged to a provision", () => {
  const notes = (insertHistory: ReturnType<typeof mock>) =>
    insertHistory.mock.calls.map((c) => String(c[0]?.note));

  it("keeps the charge when the line's category and amount stay", async () => {
    const { insertHistory, insertLine, tx } = editTx();
    await edit(tx, { amountPaise: 15_000, categoryId: "cat-1" });
    expect(insertLine).toHaveBeenCalledWith(
      expect.objectContaining({ id: "line-1", provisionHeadId: PROVISION })
    );
    expect(notes(insertHistory).some((n) => n.includes("provision"))).toBe(
      false
    );
  });

  it("keeps the charge when only the amount changes, and says so", async () => {
    const { insertHistory, insertLine, tx } = editTx();
    await edit(tx, { amountPaise: 18_000, categoryId: "cat-1" });
    expect(insertLine).toHaveBeenCalledWith(
      expect.objectContaining({ id: "line-1", provisionHeadId: PROVISION })
    );
    expect(notes(insertHistory)).toContain(
      "The line's amount changed; it is still charged to the provision"
    );
  });

  it("clears it, with a history note, when the category changes", async () => {
    const { insertHistory, insertLine, tx } = editTx();
    await edit(tx, { amountPaise: 15_000, categoryId: "cat-2" });
    expect(insertLine).toHaveBeenCalledWith(
      expect.objectContaining({ id: "line-1", provisionHeadId: null })
    );
    expect(notes(insertHistory)).toContain(
      "Provision charge cleared: the line charged to a provision changed category or was removed"
    );
  });
});
