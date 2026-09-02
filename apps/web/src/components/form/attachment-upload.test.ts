import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import type { AllowedMimeType } from "@pi-dash/shared/constants";

import { uploadSingleAttachment } from "./attachment-upload";

describe("uploadSingleAttachment", () => {
  beforeEach(() => {
    mock.restore();
  });

  it("uses the dedicated invoice signer when a vendor payment is provided", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 })
    );
    const getRequestUploadUrl = mock();
    const getVendorPaymentInvoiceUploadUrl = mock().mockResolvedValue({
      key: "app/attachments/tmp/user-1/invoice.pdf",
      presignedUrl: "https://r2.example.test/upload",
    });

    await uploadSingleAttachment(
      new File(["invoice"], "invoice.pdf", { type: "application/pdf" }),
      {
        getRequestUploadUrl,
        getVendorPaymentInvoiceUploadUrl,
        toAllowedMimeType: (value) => value as AllowedMimeType,
        vendorPaymentInvoiceId: "vendor-payment-1",
      }
    );

    expect(getRequestUploadUrl).not.toHaveBeenCalled();
    expect(getVendorPaymentInvoiceUploadUrl).toHaveBeenCalledWith({
      data: {
        fileName: "invoice.pdf",
        fileSize: 7,
        mimeType: "application/pdf",
        vendorPaymentId: "vendor-payment-1",
      },
    });
  });
});
