import { Button } from "@pi-dash/design-system/components/ui/button";
import { FieldDescription } from "@pi-dash/design-system/components/ui/field";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { log } from "evlog";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { PaymentScreenshotInput } from "@/components/form/payment-screenshot-input";
import { usePaymentScreenshotUpload } from "@/components/form/use-payment-screenshot-upload";
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
  const [replacing, setReplacing] = useState(false);
  const upload = usePaymentScreenshotUpload("ApproveDialog", entityId);
  const { previewUrl, screenshotKey, uploading } = upload;

  const cleanup = useEventCallback(() => {
    upload.reset();
    setMessage("");
    setReplacing(false);
    setSubmitting(false);
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
      await onConfirm(message, screenshotKey ?? undefined)
        .then((confirmed) => {
          if (confirmed) {
            cleanup();
            onOpenChange(false);
          }
        })
        .catch((error: unknown) => {
          log.error({
            action: "confirm",
            component: "ApproveDialog",
            entityId,
            error: error instanceof Error ? error.message : String(error),
          });
          toast.error(`Couldn't approve ${entityLabel} — try again`);
        })
        .finally(() => setSubmitting(false));
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
            ) : (
              <PaymentScreenshotInput
                describedBy="approval-screenshot-description"
                id="approval-screenshot"
                required={!hasExistingScreenshot}
                upload={upload}
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
