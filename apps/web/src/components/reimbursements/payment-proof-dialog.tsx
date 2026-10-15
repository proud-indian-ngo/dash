import { FieldDescription } from "@pi-dash/design-system/components/ui/field";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useState } from "react";
import { uuidv7 } from "uuidv7";

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
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

/**
 * Adds the payment screenshot to an approved reimbursement that has none,
 * or replaces it (the old one stays among the attachments). The books post
 * the claim once it has its proof.
 */
export function PaymentProofDialog({
  onOpenChange,
  open,
  reimbursementId,
  replacing,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  reimbursementId: string;
  /** The claim already has a screenshot, which this replaces. */
  replacing: boolean;
}) {
  const zero = useZero();
  const [submitting, setSubmitting] = useState(false);
  const upload = usePaymentScreenshotUpload(
    "PaymentProofDialog",
    reimbursementId
  );
  const { screenshotKey, uploading } = upload;

  const close = useEventCallback(() => {
    upload.reset();
    setSubmitting(false);
    onOpenChange(false);
  });
  const handleOpenChange = useEventCallback((isOpen: boolean) => {
    if (isOpen) {
      onOpenChange(true);
    } else if (!submitting) {
      close();
    }
  });
  const handleSave = useEventCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (!screenshotKey) {
        return;
      }
      setSubmitting(true);
      try {
        const res = await zero.mutate(
          mutators.reimbursement.addPaymentProof({
            approvalScreenshotKey: screenshotKey,
            id: reimbursementId,
            keptAttachmentId: replacing ? uuidv7() : undefined,
            replacing,
          })
        ).server;
        handleMutationResult(res, {
          entityId: reimbursementId,
          errorMsg: getMutationResultErrorMessage(
            res.type === "error" ? res.error : undefined,
            "Couldn't save the payment proof"
          ),
          mutation: "reimbursement.addPaymentProof",
          successMsg: replacing
            ? "Payment proof replaced"
            : "Payment proof added",
        });
        if (res.type !== "error") {
          close();
        }
      } finally {
        setSubmitting(false);
      }
    }
  );

  let actionLabel = replacing ? "Replace proof" : "Add proof";
  if (uploading) {
    actionLabel = "Uploading…";
  } else if (submitting) {
    actionLabel = "Saving…";
  }

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {replacing ? "Replace payment proof?" : "Add payment proof"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {replacing
              ? "The new screenshot becomes the payment proof. The current one stays with the claim's attachments."
              : "Attach the screenshot of the payment to the claimant. The claim then goes into the books."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="payment-proof-screenshot">
            Payment screenshot
            <span aria-hidden="true" className="text-destructive">
              {" "}
              *
            </span>
          </Label>
          <PaymentScreenshotInput
            describedBy="payment-proof-screenshot-description"
            id="payment-proof-screenshot"
            required
            upload={upload}
          />
          <FieldDescription id="payment-proof-screenshot-description">
            A JPEG, PNG or WebP image, up to 10 MB
          </FieldDescription>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={uploading || submitting || !screenshotKey}
            onClick={handleSave}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
