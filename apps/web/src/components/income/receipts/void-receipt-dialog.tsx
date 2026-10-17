import { VOID_REASON_MAX, VOID_REASON_MIN } from "@pi-dash/shared/receipts";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { TextareaField } from "@/components/form/textarea-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { voidContributionReceipt } from "@/functions/contribution-receipts";
import { containsIdentifier } from "@/lib/income-import/normalize";

const voidSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(VOID_REASON_MIN, "Say why the receipt is voided")
    .max(VOID_REASON_MAX)
    .refine(
      (reason) => !containsIdentifier(reason),
      "Don't include ID numbers in the reason"
    ),
});

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

function VoidForm({
  number,
  onOpenChange,
  onVoided,
  receiptId,
}: {
  number: string;
  onOpenChange: (open: boolean) => void;
  onVoided?: () => void;
  receiptId: string;
}) {
  const voidReceipt = useServerFn(voidContributionReceipt);
  const form = useForm({
    defaultValues: { reason: "" },
    onSubmit: async ({ value }) => {
      await voidReceipt({ data: { reason: value.reason, receiptId } })
        .then(() => {
          toast.success(`Receipt ${number} voided`);
          onOpenChange(false);
          onVoided?.();
        })
        .catch((error: unknown) => {
          toast.error("Couldn't void the receipt", {
            description: errorMessage(error),
          });
        });
    },
    validators: { onChange: voidSchema, onSubmit: voidSchema },
  });
  return (
    <FormLayout form={form}>
      <TextareaField
        description="Kept with the receipt and printed on its PDF. Don't include ID numbers."
        isRequired
        label="Reason"
        name="reason"
      />
      <FormActions
        onCancel={() => onOpenChange(false)}
        submitLabel="Void receipt"
        submittingLabel="Voiding..."
      />
    </FormLayout>
  );
}

/**
 * Voids a receipt with a mandatory reason. The receipt keeps its number and
 * stays in the list; the gift goes back to Received and can be receipted
 * again under a new number.
 */
export function VoidReceiptDialog({
  onOpenChange,
  onVoided,
  receipt,
}: {
  onOpenChange: (open: boolean) => void;
  onVoided?: () => void;
  receipt: { id: string; number: string } | null;
}) {
  // Keyed by receipt, so the reason starts empty for each one.
  return (
    <Dialog onOpenChange={onOpenChange} open={receipt !== null}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Void receipt {receipt?.number}</DialogTitle>
          <DialogDescription>
            The number is never reused. The gift goes back to Received, so a
            corrected receipt can be issued under a new number.
          </DialogDescription>
        </DialogHeader>
        {receipt ? (
          <VoidForm
            key={receipt.id}
            number={receipt.number}
            onOpenChange={onOpenChange}
            onVoided={onVoided}
            receiptId={receipt.id}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
