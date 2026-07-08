import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import {
  type Attachment,
  attachmentSchema,
  formatINR,
} from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";

function buildTransactionFormSchema(remainingAmount?: number) {
  return z.object({
    amount: z
      .string()
      .min(1, "Amount is required")
      .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, {
        message: "Must be a positive number",
      })
      .refine(
        (v) => remainingAmount === undefined || Number(v) <= remainingAmount,
        {
          message: `Exceeds remaining balance of ${formatINR(remainingAmount ?? 0)}`,
        }
      ),
    attachments: z.array(attachmentSchema),
    description: z.string(),
    paymentMethod: z.string(),
    paymentReference: z.string(),
    transactionDate: z.date({ message: "Date is required" }),
  });
}

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
  remainingAmount?: number;
  transactionId?: string;
  vendorPaymentId: string;
}

function TransactionFormContent({
  canApprove,
  initialValues,
  mode,
  onOpenChange,
  remainingAmount,
  transactionId,
  vendorPaymentId,
}: {
  canApprove: boolean;
  initialValues?: TransactionFormValues;
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  remainingAmount?: number;
  transactionId?: string;
  vendorPaymentId: string;
}) {
  const zero = useZero();
  const entityId = mode === "edit" && transactionId ? transactionId : uuidv7();
  const schema = buildTransactionFormSchema(remainingAmount);

  const form = useForm({
    defaultValues: initialValues ?? {
      amount: "",
      attachments: [] as Attachment[],
      description: "",
      paymentMethod: "",
      paymentReference: "",
      transactionDate: new Date(),
    },
    onSubmit: async ({ value }) => {
      const parsed = schema.parse(value);
      const amount = Number(parsed.amount);

      if (mode === "edit" && transactionId) {
        const res = await zero.mutate(
          mutators.vendorPaymentTransaction.update({
            amount,
            attachments: parsed.attachments,
            description: parsed.description || undefined,
            id: transactionId,
            paymentMethod: parsed.paymentMethod || undefined,
            paymentReference: parsed.paymentReference || undefined,
            transactionDate: parsed.transactionDate.getTime(),
          })
        ).server;

        handleMutationResult(res, {
          entityId: transactionId,
          errorMsg: "Couldn't update payment",
          mutation: "vendorPaymentTransaction.update",
          successMsg: "Payment updated",
        });

        if (res.type !== "error") {
          onOpenChange(false);
        }
      } else {
        const res = await zero.mutate(
          mutators.vendorPaymentTransaction.create({
            amount,
            attachments: parsed.attachments,
            description: parsed.description || undefined,
            id: entityId,
            paymentMethod: parsed.paymentMethod || undefined,
            paymentReference: parsed.paymentReference || undefined,
            transactionDate: parsed.transactionDate.getTime(),
            vendorPaymentId,
          })
        ).server;

        handleMutationResult(res, {
          entityId,
          errorMsg: "Couldn't record payment",
          mutation: "vendorPaymentTransaction.create",
          successMsg: "Payment recorded",
        });

        if (res.type !== "error") {
          onOpenChange(false);
        }
      }
    },
    validators: {
      onChange: schema,
      onSubmit: schema,
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

  const stableOnCancel0 = useEventCallback(() => onOpenChange(false));

  return (
    <FormLayout form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <InputField isRequired label="Amount" name="amount" />
          {remainingAmount !== undefined && (
            <p className="mt-1 text-muted-foreground text-xs">
              Remaining: {formatINR(remainingAmount)}
            </p>
          )}
        </div>
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
            onChange={field.handleChange}
            value={field.state.value ?? []}
          />
        )}
      </CustomField>

      <FormActions
        cancelLabel="Cancel"
        onCancel={stableOnCancel0}
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
  remainingAmount,
  transactionId,
  vendorPaymentId,
}: TransactionFormDialogProps) {
  const [formKey, setFormKey] = useState(0);

  const handleOpenChange = useEventCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(nextOpen);
  });

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
          remainingAmount={remainingAmount}
          transactionId={transactionId}
          vendorPaymentId={vendorPaymentId}
        />
      </DialogContent>
    </Dialog>
  );
}
