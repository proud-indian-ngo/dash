import { Delete02Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import { cn } from "@pi-dash/design-system/lib/utils";
import {
  PAYEE_SIGNATURE_CONSENT,
  PAYEE_SIGNATURE_MAX_BYTES,
  PAYEE_SIGNATURE_MIME_TYPE,
} from "@pi-dash/shared/payee-signature";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { uploadSingleAttachment } from "@/components/form/attachment-upload";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/shared/responsive-sheet";
import { SignaturePad } from "@/components/shared/signature-pad";
import {
  getRequestUploadUrl,
  getVendorPaymentInvoiceUploadUrl,
  toAllowedMimeType,
} from "@/functions/attachments";
import { getMutationResultErrorMessage } from "@/lib/mutation-result";
import {
  hasEnoughInk,
  type SignatureStroke,
  signaturePngBlob,
} from "@/lib/signature-ink";

export interface CollectPayeeSignatureProps {
  /** The expense day as people read it, printed under the pad. */
  dateLabel: string;
  lineItemId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  payeeName: string;
  reimbursementId: string;
  /** The signature being replaced, so a re-collect never races another. */
  replacesAttachmentId: null | string;
  /** What the payee acknowledges, shown above the pad and stored with it. */
  statement: string;
}

const TITLE = "Collect payee signature";

/**
 * The payee reads the statement and signs on the volunteer's phone: a
 * full-screen sheet on phones, a dialog on wider screens. The strokes live
 * here, above both, so rotating a phone across the breakpoint keeps them.
 */
export function CollectPayeeSignatureDialog(props: CollectPayeeSignatureProps) {
  const { onOpenChange, open } = props;
  const isMobile = useIsMobile();
  const zero = useZero();
  const requestUploadUrl = useServerFn(getRequestUploadUrl);
  const vendorPaymentInvoiceUploadUrl = useServerFn(
    getVendorPaymentInvoiceUploadUrl
  );
  const [strokes, setStrokes] = useState<readonly SignatureStroke[]>([]);
  const [saving, setSaving] = useState(false);
  const enough = hasEnoughInk(strokes);

  const handleOpenChange = useEventCallback((next: boolean) => {
    // Closing mid-save would hide the result; the save finishes first.
    if (!(saving && !next)) {
      onOpenChange(next);
    }
  });
  const undo = useEventCallback(() => setStrokes((all) => all.slice(0, -1)));
  const clear = useEventCallback(() => setStrokes([]));

  const confirm = useEventCallback(async () => {
    if (!enough || saving) {
      return;
    }
    setSaving(true);
    try {
      const blob = await signaturePngBlob(strokes);
      if (blob.size > PAYEE_SIGNATURE_MAX_BYTES) {
        toast.error(
          "That signature is too detailed to save. Clear and sign again"
        );
        return;
      }
      const uploaded = await uploadSingleAttachment(
        new File([blob], "payee-signature.png", {
          type: PAYEE_SIGNATURE_MIME_TYPE,
        }),
        {
          getRequestUploadUrl: requestUploadUrl,
          getVendorPaymentInvoiceUploadUrl: vendorPaymentInvoiceUploadUrl,
          toAllowedMimeType,
        }
      );
      if (uploaded.type !== "file") {
        return;
      }
      const result = await zero.mutate(
        mutators.reimbursement.collectPayeeSignature({
          attachmentId: uploaded.id,
          lineItemId: props.lineItemId,
          objectKey: uploaded.objectKey,
          reimbursementId: props.reimbursementId,
          replacesAttachmentId: props.replacesAttachmentId,
          statement: props.statement,
        })
      ).server;
      if (result.type === "error") {
        const message = getMutationResultErrorMessage(
          result.error,
          "Couldn't save the signature"
        );
        log.error({
          component: "CollectPayeeSignatureDialog",
          entityId: props.lineItemId,
          error: message,
          mutation: "reimbursement.collectPayeeSignature",
        });
        toast.error(message);
        return;
      }
      toast.success("Signature saved");
      onOpenChange(false);
    } catch (error) {
      log.error({
        action: "collectPayeeSignature",
        component: "CollectPayeeSignatureDialog",
        lineItemId: props.lineItemId,
        message: error instanceof Error ? error.message : String(error),
      });
      toast.error(
        "Couldn't save the signature. Check the connection and try again"
      );
    } finally {
      setSaving(false);
    }
  });

  const description = `Hand the phone to ${props.payeeName} to read and sign.`;
  const confirmLabel = saving
    ? "Saving..."
    : enough
      ? "Confirm signature"
      : "Waiting for signature";

  const body = (
    <SignatureBody
      dateLabel={props.dateLabel}
      onClear={clear}
      onStrokesChange={setStrokes}
      onUndo={undo}
      payeeName={props.payeeName}
      saving={saving}
      statement={props.statement}
      strokes={strokes}
    />
  );
  const confirmButton = (
    <Button
      className={isMobile ? "h-11 w-full" : undefined}
      disabled={!enough || saving}
      onClick={confirm}
      type="button"
    >
      {confirmLabel}
    </Button>
  );

  if (isMobile) {
    return (
      <Sheet onOpenChange={handleOpenChange} open={open}>
        <SheetContent aria-label={TITLE}>
          <div className="flex min-h-[calc(100dvh-4.5rem)] flex-col">
            <SheetHeader className="px-4 pt-1 pb-3">
              <SheetTitle className="text-base">{TITLE}</SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
              {body}
              <div className="mt-auto flex flex-col gap-2">
                {confirmButton}
                <Consent />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter className="sm:items-center">
          <Consent className="sm:mr-auto" />
          <Button
            disabled={saving}
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          {confirmButton}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Consent({ className }: { className?: string }) {
  return (
    <p className={cn("text-muted-foreground text-xs", className)}>
      {PAYEE_SIGNATURE_CONSENT}
    </p>
  );
}

function SignatureBody({
  dateLabel,
  onClear,
  onStrokesChange,
  onUndo,
  payeeName,
  saving,
  statement,
  strokes,
}: {
  dateLabel: string;
  onClear: () => void;
  onStrokesChange: (strokes: readonly SignatureStroke[]) => void;
  onUndo: () => void;
  payeeName: string;
  saving: boolean;
  statement: string;
  strokes: readonly SignatureStroke[];
}) {
  const empty = strokes.length === 0;
  return (
    <div className="flex flex-col gap-4">
      <p
        className="text-foreground text-base/relaxed font-medium sm:text-lg/relaxed"
        data-testid="payee-signature-statement"
      >
        {statement}
      </p>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-end gap-1">
          <PadAction
            disabled={empty || saving}
            icon={<HugeiconsIcon icon={Undo02Icon} strokeWidth={2} />}
            label="Undo"
            onClick={onUndo}
          />
          <PadAction
            disabled={empty || saving}
            icon={<HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />}
            label="Clear"
            onClick={onClear}
          />
        </div>
        <SignaturePad
          ariaLabel={`Signature pad for ${payeeName}`}
          baselineEnd={dateLabel}
          baselineStart={payeeName}
          hint="Sign or write your name with your finger"
          onStrokesChange={onStrokesChange}
          strokes={strokes}
        />
      </div>
    </div>
  );
}

function PadAction({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      disabled={disabled}
      onClick={onClick}
      size="sm"
      type="button"
      variant="ghost"
    >
      {icon}
      {label}
    </Button>
  );
}
