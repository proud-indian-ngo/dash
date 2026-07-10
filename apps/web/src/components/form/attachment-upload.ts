import type { AllowedMimeType } from "@pi-dash/shared/constants";
import { uuidv7 } from "uuidv7";
import type { Attachment } from "@/lib/form-schemas";

interface UploadResult {
  key: string;
  presignedUrl: string;
}

interface UploadSingleAttachmentDeps {
  getRequestUploadUrl: (input: {
    data: {
      fileName: string;
      fileSize: number;
      mimeType: AllowedMimeType;
    };
  }) => Promise<UploadResult>;
  getVendorPaymentInvoiceUploadUrl: (input: {
    data: {
      fileName: string;
      fileSize: number;
      mimeType: AllowedMimeType;
      vendorPaymentId: string;
    };
  }) => Promise<UploadResult>;
  toAllowedMimeType: (value: string) => AllowedMimeType;
  vendorPaymentInvoiceId?: string;
}

export async function uploadSingleAttachment(
  file: File,
  deps: UploadSingleAttachmentDeps
): Promise<Attachment> {
  const uploadData = {
    fileName: file.name,
    fileSize: file.size,
    mimeType: deps.toAllowedMimeType(file.type),
  };
  const { presignedUrl, key } = deps.vendorPaymentInvoiceId
    ? await deps.getVendorPaymentInvoiceUploadUrl({
        data: {
          ...uploadData,
          vendorPaymentId: deps.vendorPaymentInvoiceId,
        },
      })
    : await deps.getRequestUploadUrl({ data: uploadData });

  const response = await fetch(presignedUrl, {
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error("Upload request failed");
  }

  return {
    filename: file.name,
    id: uuidv7(),
    mimeType: file.type,
    objectKey: key,
    type: "file",
  };
}
