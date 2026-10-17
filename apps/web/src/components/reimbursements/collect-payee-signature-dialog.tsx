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
  type PayeeSignatureSignedFacts,
} from "@pi-dash/shared/payee-signature";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { type ReactNode, useState, useSyncExternalStore } from "react";
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
  /** The facts the statement is built from; the server checks them. */
  signedFacts: PayeeSignatureSignedFacts;
  /** What the payee acknowledges, shown above the pad. */
  statement: string;
}

/** Phones on their side: a short touch screen gets the full-screen sheet. */
const SHORT_TOUCH_SCREEN = "(pointer: coarse) and (max-height: 540px)";

function subscribeShortTouchScreen(onChange: () => void) {
  const query = window.matchMedia(SHORT_TOUCH_SCREEN);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useShortTouchScreen(): boolean {
  return useSyncExternalStore(
    subscribeShortTouchScreen,
    () => window.matchMedia(SHORT_TOUCH_SCREEN).matches,
    () => false
  );
}

const TITLE = "Collect payee signature";

/**
 * The payee reads the statement and signs on the volunteer's phone: a
 * full-screen sheet on phones, a dialog on wider screens. The strokes live
 * here, above both, so rotating a phone across the breakpoint keeps them.
 */
export function CollectPayeeSignatureDialog(props: CollectPayeeSignatureProps) {
  const { onOpenChange, open } = props;
  const shortTouchScreen = useShortTouchScreen();
  const isMobile = useIsMobile() || shortTouchScreen;
  // The dialog remounts each time it opens, so this is what the payee is
  // shown when it opens; a sync that changes the item meanwhile doesn't
  // change the statement under their pen (the server then refuses it).
  const [frozen] = useState(() => ({
    replacesAttachmentId: props.replacesAttachmentId,
    signedFacts: props.signedFacts,
    statement: props.statement,
  }));
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
    const save = async () => {
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
          replacesAttachmentId: frozen.replacesAttachmentId,
          signedFacts: frozen.signedFacts,
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
    };
    setSaving(true);
    await save()
      .catch((error: unknown) => {
        log.error({
          action: "collectPayeeSignature",
          component: "CollectPayeeSignatureDialog",
          lineItemId: props.lineItemId,
          message: error instanceof Error ? error.message : String(error),
        });
        toast.error(
          "Couldn't save the signature. Check the connection and try again"
        );
      })
      .finally(() => setSaving(false));
  });

  const description = `Hand the phone to ${props.payeeName} to read and sign.`;
  const confirmLabel = saving
    ? "Saving..."
    : enough
      ? "Confirm signature"
      : "Waiting for signature";

  const statement = (
    <p
      className={cn(
        "text-foreground font-medium",
        shortTouchScreen
          ? "text-base/relaxed"
          : "text-base/relaxed sm:text-lg/relaxed"
      )}
      data-testid="payee-signature-statement"
    >
      {frozen.statement}
    </p>
  );
  const pad = (
    <PadArea
      dateLabel={props.dateLabel}
      onClear={clear}
      onStrokesChange={setStrokes}
      onUndo={undo}
      // On a phone on its side the pad takes the height left under the
      // title, keeping its 2:1 shape, beside the statement.
      padClassName={
        shortTouchScreen ? "h-[calc(100dvh-12rem)] w-auto" : undefined
      }
      payeeName={props.payeeName}
      saving={saving}
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
      <Sheet
        forceMobile={shortTouchScreen}
        onOpenChange={handleOpenChange}
        open={open}
      >
        <SheetContent aria-label={TITLE}>
          <div className="flex min-h-[calc(100dvh-4.5rem)] flex-col">
            <SheetHeader
              className={cn("px-4 pt-1", shortTouchScreen ? "pb-1" : "pb-3")}
            >
              <SheetTitle className="text-base">{TITLE}</SheetTitle>
              <SheetDescription className={shortTouchScreen ? "sr-only" : ""}>
                {description}
              </SheetDescription>
            </SheetHeader>
            {shortTouchScreen ? (
              <div className="grid flex-1 grid-cols-[minmax(0,1fr)_auto] gap-4 px-4 pb-3">
                <div className="flex flex-col gap-3">
                  {statement}
                  <div className="mt-auto flex flex-col gap-2">
                    {confirmButton}
                    <Consent />
                  </div>
                </div>
                {pad}
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
                {statement}
                {pad}
                <div className="mt-auto flex flex-col gap-2">
                  {confirmButton}
                  <Consent />
                </div>
              </div>
            )}
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
        {statement}
        {pad}
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

function PadArea({
  dateLabel,
  onClear,
  onStrokesChange,
  onUndo,
  padClassName,
  payeeName,
  saving,
  strokes,
}: {
  dateLabel: string;
  onClear: () => void;
  onStrokesChange: (strokes: readonly SignatureStroke[]) => void;
  onUndo: () => void;
  padClassName?: string;
  payeeName: string;
  saving: boolean;
  strokes: readonly SignatureStroke[];
}) {
  const empty = strokes.length === 0;
  return (
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
        className={padClassName}
        fallback="If the payee can't sign here, print the voucher for a signature or thumb impression."
        hint="Sign or write your name with your finger"
        onStrokesChange={onStrokesChange}
        strokes={strokes}
      />
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
