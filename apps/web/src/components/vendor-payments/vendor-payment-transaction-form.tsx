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
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { AttachmentsSection } from "@/components/form/attachments-section";
import { CustomField } from "@/components/form/custom-field";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { type Attachment, attachmentSchema } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";

const transactionFormSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  description: z.string(),
  transactionDate: z.date({ message: "Date is required" }),
  paymentMethod: z.string(),
  paymentReference: z.string(),
  attachments: z.array(attachmentSchema),
});

interface TransactionFormDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  vendorPaymentId: string;
}

function TransactionFormContent({
  onOpenChange,
  vendorPaymentId,
}: {
  onOpenChange: (open: boolean) => void;
  vendorPaymentId: string;
}) {
  const zero = useZero();
  const entityId = uuidv7();

  const form = useForm({
    defaultValues: {
      amount: "",
      description: "",
      transactionDate: new Date(),
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
          transactionDate: parsed.transactionDate.getTime(),
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
    <FormLayout form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField isRequired label="Amount" name="amount" />
        <InputField label="Description" name="description" />
        <DateField isRequired label="Transaction Date" name="transactionDate" />
        <InputField label="Payment Method" name="paymentMethod" />
        <InputField label="Payment Reference" name="paymentReference" />
      </div>

      <CustomField<Attachment[]> label="Attachments" name="attachments">
        {(field) => (
          <AttachmentsSection
            entityId={entityId}
            onChange={(attachments) => field.handleChange(attachments)}
            value={field.state.value ?? []}
          />
        )}
      </CustomField>

      <FormActions
        cancelLabel="Cancel"
        onCancel={() => onOpenChange(false)}
        submitLabel="Record Payment"
        submittingLabel="Recording..."
      />
    </FormLayout>
  );
}

export function TransactionFormDialog({
  onOpenChange,
  open,
  vendorPaymentId,
}: TransactionFormDialogProps) {
  const [formKey, setFormKey] = useState(0);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Record a payment made against this vendor payment.
          </DialogDescription>
        </DialogHeader>
        <TransactionFormContent
          key={formKey}
          onOpenChange={onOpenChange}
          vendorPaymentId={vendorPaymentId}
        />
      </DialogContent>
    </Dialog>
  );
}
