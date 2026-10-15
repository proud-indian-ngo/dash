import { Button } from "@pi-dash/design-system/components/ui/button";
import { FieldDescription } from "@pi-dash/design-system/components/ui/field";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { getRefCurrent } from "@pi-dash/design-system/hooks/get-ref-current";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  ALLOWED_APPROVAL_SCREENSHOT_TYPES,
  MAX_APPROVAL_SCREENSHOT_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import { log } from "evlog";
import { type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shared/responsive-alert-dialog";
import {
  deleteTemporaryUpload,
  getApprovalScreenshotUploadUrl,
} from "@/functions/attachments";

interface ApproveDialogProps {
  entityId: string;
  entityLabel: string;
  /** The record already holds a payment screenshot that approval can reuse. */
  hasExistingScreenshot?: boolean;
  hideScreenshot?: boolean;
  onConfirm: (message: string, screenshotKey?: string) => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Facts the approver checks before approving, such as what it is charged to. */
  summary?: ReactNode;
}

export function ApproveDialog({
  entityId,
  entityLabel,
  hasExistingScreenshot = false,
  hideScreenshot = false,
  onConfirm,
  onOpenChange,
  open,
  summary,
}: ApproveDialogProps) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [screenshotKey, setScreenshotKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cleanup = useEventCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (screenshotKey) {
      deleteTemporaryUpload({
        data: { key: screenshotKey },
      }).catch((error) => {
        log.error({
          action: "cleanup",
          component: "ApproveDialog",
          error: error instanceof Error ? error.message : String(error),
          screenshotKey,
        });
      });
    }
    setMessage("");
    setScreenshotKey(null);
    setPreviewUrl(null);
    setReplacing(false);
    setSubmitting(false);
    setUploading(false);
  });

  const handleFileChange = useEventCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const input = getRefCurrent(fileInputRef);
      if (input) {
        input.value = "";
      }
      if (!file) {
        return;
      }

      const mimeType =
        file.type as (typeof ALLOWED_APPROVAL_SCREENSHOT_TYPES)[number];
      if (!ALLOWED_APPROVAL_SCREENSHOT_TYPES.includes(mimeType)) {
        toast.error(
          "Invalid file type. Please upload a JPEG, PNG, or WebP image."
        );
        return;
      }
      if (file.size > MAX_APPROVAL_SCREENSHOT_SIZE_BYTES) {
        toast.error("File too large. Maximum size is 10 MB.");
        return;
      }

      setUploading(true);
      try {
        const { presignedUrl, key } = await getApprovalScreenshotUploadUrl({
          data: {
            fileName: file.name,
            fileSize: file.size,
            mimeType,
          },
        });

        const uploadRes = await fetch(presignedUrl, {
          body: file,
          headers: { "Content-Type": file.type },
          method: "PUT",
        });

        if (!uploadRes.ok) {
          throw new Error(`Upload failed: ${uploadRes.status}`);
        }

        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        setScreenshotKey(key);
        setPreviewUrl(URL.createObjectURL(file));
      } catch (error) {
        log.error({
          action: "uploadScreenshot",
          component: "ApproveDialog",
          entityId,
          error: error instanceof Error ? error.message : String(error),
          fileName: file.name,
        });
        toast.error("Couldn't upload screenshot — try again");
      } finally {
        setUploading(false);
      }
    }
  );

  const handleRemoveScreenshot = useEventCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (screenshotKey) {
      deleteTemporaryUpload({
        data: { key: screenshotKey },
      }).catch((error) => {
        log.error({
          action: "removeScreenshot",
          component: "ApproveDialog",
          error: error instanceof Error ? error.message : String(error),
          screenshotKey,
        });
      });
    }
    setScreenshotKey(null);
    setPreviewUrl(null);
  });
  const handleReplaceScreenshot = useEventCallback(() => setReplacing(true));
  const stableOnOpenChange0 = useEventCallback((isOpen: boolean) => {
    if (!isOpen && submitting) {
      return;
    }
    if (!isOpen) {
      cleanup();
    }
    onOpenChange(isOpen);
  });
  const stableOnClick2 = useEventCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setSubmitting(true);
      try {
        const confirmed = await onConfirm(message, screenshotKey ?? undefined);
        if (confirmed) {
          cleanup();
          onOpenChange(false);
        }
      } catch (error) {
        log.error({
          action: "confirm",
          component: "ApproveDialog",
          entityId,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error(`Couldn't approve ${entityLabel} — try again`);
      } finally {
        setSubmitting(false);
      }
    }
  );
  const stableOnMessageChange1 = useEventCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) =>
      setMessage(event.target.value)
  );
  const missingScreenshot = !(
    hideScreenshot ||
    screenshotKey ||
    hasExistingScreenshot
  );
  const showExistingScreenshot =
    hasExistingScreenshot && !replacing && !previewUrl;
  let actionLabel = "Approve";
  if (uploading) {
    actionLabel = "Uploading…";
  } else if (submitting) {
    actionLabel = "Approving…";
  }

  return (
    <AlertDialog onOpenChange={stableOnOpenChange0} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Approve {entityLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            {hideScreenshot
              ? `This action will approve the ${entityLabel} and notify the submitter. You can optionally add a message.`
              : `Approve only after the claimant has been paid. This will approve the ${entityLabel} and notify the submitter.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {summary ? <div className="text-sm">{summary}</div> : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="approve-message">Message (optional)</Label>
          <Textarea
            className="min-h-20"
            id="approve-message"
            onChange={stableOnMessageChange1}
            placeholder="Optional message to the submitter..."
            value={message}
          />
        </div>
        {hideScreenshot ? null : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="approval-screenshot">
              Payment screenshot
              <span aria-hidden="true" className="text-destructive">
                {" "}
                *
              </span>
            </Label>
            {showExistingScreenshot ? (
              <div className="flex items-center gap-3">
                <p className="text-sm">Payment screenshot already attached</p>
                <Button
                  onClick={handleReplaceScreenshot}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Replace
                </Button>
              </div>
            ) : null}
            {previewUrl ? (
              <div className="flex items-start gap-3">
                <img
                  alt="Payment screenshot preview"
                  className="h-20 w-20 rounded-md border object-cover"
                  height={80}
                  src={previewUrl}
                  width={80}
                />
                <Button
                  onClick={handleRemoveScreenshot}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Remove
                </Button>
              </div>
            ) : null}
            {showExistingScreenshot || previewUrl ? null : (
              <input
                accept="image/jpeg,image/png,image/webp"
                aria-describedby="approval-screenshot-description"
                aria-required={!hasExistingScreenshot}
                className="file:bg-muted text-sm file:mr-2 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                disabled={uploading}
                id="approval-screenshot"
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
            )}
            <FieldDescription id="approval-screenshot-description">
              Attach the screenshot of the payment to the claimant
            </FieldDescription>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting} onClick={cleanup}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={uploading || submitting || missingScreenshot}
            onClick={stableOnClick2}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
