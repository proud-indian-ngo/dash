import type { AllowedMimeType } from "@pi-dash/shared/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadSingleAttachment } from "./attachment-upload";

describe("uploadSingleAttachment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the dedicated invoice signer when a vendor payment is provided", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 })
    );
    const getRequestUploadUrl = vi.fn();
    const getVendorPaymentInvoiceUploadUrl = vi.fn().mockResolvedValue({
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
