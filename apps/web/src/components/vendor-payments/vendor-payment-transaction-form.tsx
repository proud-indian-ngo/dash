import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useMemo } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { AttachmentsSection } from "@/components/form/attachments-section";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { type Attachment, attachmentSchema } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";

const transactionFormSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  description: z.string(),
  transactionDate: z.string().min(1, "Date is required"),
  paymentMethod: z.string(),
  paymentReference: z.string(),
  attachments: z.array(attachmentSchema),
});

interface TransactionFormDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  vendorPaymentId: string;
}

export function TransactionFormDialog({
  onOpenChange,
  open,
  vendorPaymentId,
}: TransactionFormDialogProps) {
  const zero = useZero();
  // Fresh ID each time dialog opens to prevent PK conflicts on resubmission
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on open to regenerate UUID per dialog open
  const entityId = useMemo(() => uuidv7(), [open]);

  const form = useForm({
    defaultValues: {
      amount: "",
      description: "",
      transactionDate: new Date().toISOString().slice(0, 16),
      paymentMethod: "",
      paymentReference: "",
      attachments: [] as Attachment[],
    },
    onSubmit: async ({ value }) => {
      const parsed = transactionFormSchema.parse(value);
      const amount = Number(parsed.amount);
      if (Number.isNaN(amount) || amount <= 0) {
        throw new Error("Amount must be a positive number");
      }

      const res = await zero.mutate(
        mutators.vendorPaymentTransaction.create({
          id: entityId,
          vendorPaymentId,
          amount,
          description: parsed.description || undefined,
          transactionDate: new Date(parsed.transactionDate).getTime(),
          paymentMethod: parsed.paymentMethod || undefined,
          paymentReference: parsed.paymentReference || undefined,
          attachments: parsed.attachments,
        })
      ).server;

      handleMutationResult(res, {
        mutation: "vendorPaymentTransaction.create",
        entityId,
        successMsg: "Payment recorded",
        errorMsg: "Failed to record payment",
      });

      if (res.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: {
      onChange: transactionFormSchema,
      onSubmit: transactionFormSchema,
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Record a payment made against this vendor payment.
          </DialogDescription>
        </DialogHeader>
        <FormLayout
          className="flex flex-col gap-4"
          form={form}
          key={open ? "open" : "closed"}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField isRequired label="Amount" name="amount" type="number" />
            <InputField label="Description" name="description" />
            <InputField
              isRequired
              label="Date"
              name="transactionDate"
              type="datetime-local"
            />
            <InputField label="Payment Method" name="paymentMethod" />
            <InputField label="Payment Reference" name="paymentReference" />
          </div>

          <form.Field name="attachments">
            {/* biome-ignore lint/suspicious/noExplicitAny: form field type mismatch */}
            {(field: any) => (
              <AttachmentsSection
                entityId={entityId}
                onChange={(attachments: Attachment[]) =>
                  field.handleChange(attachments)
                }
                value={field.state.value as Attachment[]}
              />
            )}
          </form.Field>

          <FormActions
            cancelLabel="Cancel"
            disableWhenInvalid={false}
            onCancel={() => onOpenChange(false)}
            submitLabel="Record Payment"
            submittingLabel="Recording..."
          />
        </FormLayout>
      </DialogContent>
    </Dialog>
  );
}
