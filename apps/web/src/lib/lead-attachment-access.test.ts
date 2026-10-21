import { describe, expect, it } from "bun:test";

import { isLeadReadableReimbursementFile } from "./lead-attachment-access";

const noLinks = {
  payeeSignatureAttachmentId: null,
  signedVoucherAttachmentId: null,
  voucherAttachmentId: null,
};

const file = (
  overrides: Partial<Parameters<typeof isLeadReadableReimbursementFile>[0]> = {}
) => ({
  history: [],
  id: "att-1",
  lineItems: [noLinks],
  objectKey: "app/attachments/reimbursements/r-1/receipt.jpg",
  ...overrides,
});

describe("a programme lead's reimbursement files", () => {
  it("opens a receipt", () => {
    expect(isLeadReadableReimbursementFile(file())).toBe(true);
  });

  it("never opens kept payment proof or a generated voucher", () => {
    expect(
      isLeadReadableReimbursementFile(
        file({
          objectKey:
            "app/approval-screenshots/reimbursements/r-1/approval-screenshots/proof.png",
        })
      )
    ).toBe(false);
    expect(
      isLeadReadableReimbursementFile(
        file({ objectKey: "app/vouchers/r-1/voucher.pdf" })
      )
    ).toBe(false);
  });

  it("never opens a linked payee signature or signed voucher", () => {
    expect(
      isLeadReadableReimbursementFile(
        file({
          lineItems: [{ ...noLinks, payeeSignatureAttachmentId: "att-1" }],
        })
      )
    ).toBe(false);
    expect(
      isLeadReadableReimbursementFile(
        file({
          lineItems: [{ ...noLinks, signedVoucherAttachmentId: "att-1" }],
        })
      )
    ).toBe(false);
  });

  it("never opens a replaced or unlinked signature or signed copy", () => {
    for (const metadata of [
      { attachmentId: "att-1" },
      { replacedAttachmentId: "att-1" },
      { unlinkedAttachmentIds: ["att-0", "att-1"] },
    ]) {
      expect(
        isLeadReadableReimbursementFile(file({ history: [{ metadata }] }))
      ).toBe(false);
    }
  });
});
