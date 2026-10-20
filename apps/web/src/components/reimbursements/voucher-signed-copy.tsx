import { Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { MAX_ATTACHMENT_FILE_SIZE_BYTES } from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import type { ReimbursementAttachment } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { uploadSingleAttachment } from "@/components/form/attachment-upload";
import { FilePreviewButton } from "@/components/shared/file-preview";
import {
  getRequestUploadUrl,
  getVendorPaymentInvoiceUploadUrl,
  toAllowedMimeType,
} from "@/functions/attachments";
import {
  getAttachmentLabel,
  getAttachmentPreviewHref,
} from "@/lib/attachment-links";
import { ATTACHMENT_ACCEPT } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";

function AttachmentLink({
  attachment,
  label,
}: {
  attachment: ReimbursementAttachment | undefined;
  label: string;
}) {
  if (!attachment?.objectKey) {
    return null;
  }
  return (
    <FilePreviewButton
      className="text-primary text-xs font-medium underline-offset-2 hover:underline"
      src={getAttachmentPreviewHref(attachment, {
        id: attachment.id,
        kind: "reimbursementAttachment",
      })}
      fileName={getAttachmentLabel(attachment)}
      mimeType={attachment.mimeType}
    >
      {label}
    </FilePreviewButton>
  );
}

/**
 * The voucher and its signed copy for one approved line item: view either,
 * and upload or replace the copy the payee signed or thumb-printed.
 */
export function VoucherSignedCopy({
  attachments,
  canUpload,
  lineItemId,
  reimbursementId,
  signedVoucherAttachmentId,
  voucherAttachmentId,
}: {
  attachments: readonly ReimbursementAttachment[];
  canUpload: boolean;
  lineItemId: string;
  reimbursementId: string;
  signedVoucherAttachmentId: null | string | undefined;
  voucherAttachmentId: string;
}) {
  const zero = useZero();
  const requestUploadUrl = useServerFn(getRequestUploadUrl);
  const vendorPaymentInvoiceUploadUrl = useServerFn(
    getVendorPaymentInvoiceUploadUrl
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const voucher = attachments.find((a) => a.id === voucherAttachmentId);
  const signed = signedVoucherAttachmentId
    ? attachments.find((a) => a.id === signedVoucherAttachmentId)
    : undefined;

  const openPicker = useEventCallback(() => inputRef.current?.click());

  const handleFile = useEventCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }
      if (file.size > MAX_ATTACHMENT_FILE_SIZE_BYTES) {
        toast.error("The file is too large");
        return;
      }
      setIsUploading(true);
      await uploadSingleAttachment(file, {
        getRequestUploadUrl: requestUploadUrl,
        getVendorPaymentInvoiceUploadUrl: vendorPaymentInvoiceUploadUrl,
        toAllowedMimeType,
      })
        .then(async (uploaded) => {
          if (uploaded.type !== "file") {
            return;
          }
          const res = await zero.mutate(
            mutators.reimbursement.attachSignedVoucher({
              lineItemId,
              reimbursementId,
              replacesAttachmentId: signedVoucherAttachmentId ?? null,
              signedCopy: {
                filename: uploaded.filename,
                id: uploaded.id,
                mimeType: uploaded.mimeType,
                objectKey: uploaded.objectKey,
              },
            })
          ).server;
          handleMutationResult(res, {
            entityId: lineItemId,
            errorMsg: "Couldn't save the signed voucher",
            mutation: "reimbursement.attachSignedVoucher",
            successMsg: "Signed voucher uploaded",
          });
        })
        .catch((error: unknown) => {
          log.error({
            action: "uploadSignedVoucher",
            component: "VoucherSignedCopy",
            lineItemId,
            message: error instanceof Error ? error.message : String(error),
          });
          toast.error("Couldn't upload the signed voucher");
        })
        .finally(() => setIsUploading(false));
    }
  );

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <AttachmentLink attachment={voucher} label="View voucher" />
      <AttachmentLink attachment={signed} label="Signed copy" />
      {canUpload ? (
        <>
          <input
            accept={ATTACHMENT_ACCEPT}
            aria-label="Signed voucher file"
            className="hidden"
            onChange={handleFile}
            ref={inputRef}
            type="file"
          />
          <Button
            className="h-auto px-1.5 py-0.5 text-xs"
            disabled={isUploading}
            onClick={openPicker}
            size="sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              className="size-3"
              icon={Upload01Icon}
              strokeWidth={2}
            />
            {isUploading
              ? "Uploading..."
              : signed
                ? "Replace signed copy"
                : "Upload signed copy"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
