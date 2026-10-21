import { Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { MAX_ATTACHMENT_FILE_SIZE_BYTES } from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { FilePreviewButton } from "@/components/shared/file-preview";
import {
  getGrantAgreementUploadUrl,
  toAllowedMimeType,
} from "@/functions/attachments";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";
import { ATTACHMENT_ACCEPT } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";

/** The signed agreement: view it, and for finance.manage upload or replace it. */
export function GrantAgreementFile({
  canManage,
  grant,
}: {
  canManage: boolean;
  grant: {
    agreementFilename?: string | null;
    agreementMimeType?: string | null;
    agreementObjectKey?: string | null;
    id: string;
  };
}) {
  const zero = useZero();
  const uploadUrl = useServerFn(getGrantAgreementUploadUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const openPicker = useEventCallback(() => inputRef.current?.click());
  const uploadAgreement = async (file: File) => {
    const mimeType = toAllowedMimeType(file.type);
    const { key, presignedUrl } = await uploadUrl({
      data: { fileName: file.name, fileSize: file.size, mimeType },
    });
    const response = await fetch(presignedUrl, {
      body: file,
      headers: { "Content-Type": file.type },
      method: "PUT",
    });
    if (!response.ok) {
      throw new Error("Upload request failed");
    }
    return { key, mimeType };
  };

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
      await uploadAgreement(file)
        .then(async ({ key, mimeType }) => {
          const res = await zero.mutate(
            mutators.grant.setAgreement({
              agreement: { filename: file.name, mimeType, objectKey: key },
              grantId: grant.id,
            })
          ).server;
          handleMutationResult(res, {
            entityId: grant.id,
            errorMsg: "Couldn't save the agreement",
            mutation: "grant.setAgreement",
            successMsg: "Agreement uploaded",
          });
        })
        .catch((error: unknown) => {
          log.error({
            action: "uploadGrantAgreement",
            component: "GrantAgreementFile",
            grantId: grant.id,
            message: error instanceof Error ? error.message : String(error),
          });
          toast.error("Couldn't upload the agreement");
        })
        .finally(() => setIsUploading(false));
    }
  );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {grant.agreementObjectKey ? (
        <FilePreviewButton
          className="text-primary truncate font-medium underline-offset-2 hover:underline"
          data-testid="grant-agreement-link"
          fileName={grant.agreementFilename ?? "Agreement"}
          mimeType={grant.agreementMimeType}
          src={getProtectedAttachmentHref(
            { id: grant.id, kind: "grantAgreement" },
            "inline"
          )}
        >
          {grant.agreementFilename ?? "Agreement"}
        </FilePreviewButton>
      ) : (
        <span className="text-muted-foreground">Not uploaded</span>
      )}
      {canManage ? (
        <>
          <input
            accept={ATTACHMENT_ACCEPT}
            aria-label="Agreement file"
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
              : grant.agreementObjectKey
                ? "Replace"
                : "Upload"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
