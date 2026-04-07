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
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, {
      message: "Must be a positive number",
    }),
  description: z.string(),
  transactionDate: z.date({ message: "Date is required" }),
  paymentMethod: z.string(),
  paymentReference: z.string(),
  attachments: z.array(attachmentSchema),
});

export interface TransactionFormValues {
  amount: string;
  attachments: Attachment[];
  description: string;
  paymentMethod: string;
  paymentReference: string;
  transactionDate: Date;
}

interface TransactionFormDialogProps {
  canApprove: boolean;
  initialValues?: TransactionFormValues;
  mode?: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  open: boolean;
  transactionId?: string;
  vendorPaymentId: string;
}

function TransactionFormContent({
  canApprove,
  initialValues,
  mode,
  onOpenChange,
  transactionId,
  vendorPaymentId,
}: {
  canApprove: boolean;
  initialValues?: TransactionFormValues;
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  transactionId?: string;
  vendorPaymentId: string;
}) {
  const zero = useZero();
  const entityId = mode === "edit" && transactionId ? transactionId : uuidv7();

  const form = useForm({
    defaultValues: initialValues ?? {
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

      if (mode === "edit" && transactionId) {
        const res = await zero.mutate(
          mutators.vendorPaymentTransaction.update({
            id: transactionId,
            amount,
            description: parsed.description || undefined,
            transactionDate: parsed.transactionDate.getTime(),
            paymentMethod: parsed.paymentMethod || undefined,
            paymentReference: parsed.paymentReference || undefined,
            attachments: parsed.attachments,
          })
        ).server;

        handleMutationResult(res, {
          mutation: "vendorPaymentTransaction.update",
          entityId: transactionId,
          successMsg: "Payment updated",
          errorMsg: "Failed to update payment",
        });

        if (res.type !== "error") {
          onOpenChange(false);
        }
      } else {
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
      }
    },
    validators: {
      onChange: transactionFormSchema,
      onSubmit: transactionFormSchema,
    },
  });

  const isEdit = mode === "edit";
  let submitLabel = "Request Payment";
  let submittingLabel = "Requesting...";
  if (isEdit) {
    submitLabel = "Update Payment";
    submittingLabel = "Updating...";
  } else if (canApprove) {
    submitLabel = "Record Payment";
    submittingLabel = "Recording...";
  }

  return (
    <FormLayout form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField isRequired label="Amount" name="amount" />
        <InputField label="Description" name="description" />
        <DateField isRequired label="Transaction Date" name="transactionDate" />
        {canApprove ? (
          <>
            <InputField label="Payment Method" name="paymentMethod" />
            <InputField label="Payment Reference" name="paymentReference" />
          </>
        ) : null}
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
        submitLabel={submitLabel}
        submittingLabel={submittingLabel}
      />
    </FormLayout>
  );
}

export function TransactionFormDialog({
  canApprove,
  initialValues,
  mode = "create",
  onOpenChange,
  open,
  transactionId,
  vendorPaymentId,
}: TransactionFormDialogProps) {
  const [formKey, setFormKey] = useState(0);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(nextOpen);
  };

  const isEdit = mode === "edit";
  let title = "Request Payment";
  let description =
    "Request a payment against this vendor payment. An approver will record the payment details.";
  if (isEdit) {
    title = "Edit Payment";
    description = "Update this payment record.";
  } else if (canApprove) {
    title = "Record Payment";
    description = "Record a payment made against this vendor payment.";
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <TransactionFormContent
          canApprove={canApprove}
          initialValues={initialValues}
          key={formKey}
          mode={mode}
          onOpenChange={onOpenChange}
          transactionId={transactionId}
          vendorPaymentId={vendorPaymentId}
        />
      </DialogContent>
    </Dialog>
  );
}
