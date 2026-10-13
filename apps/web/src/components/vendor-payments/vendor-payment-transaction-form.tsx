import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  formatPaise,
  rupeesToPaise,
  tryRupeesToPaise,
} from "@pi-dash/shared/money";
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
import { type Attachment, attachmentSchema } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";

function buildTransactionFormSchema(remainingPaise?: number) {
  return z.object({
    amount: z
      .string()
      .min(1, "Amount is required")
      .refine((v) => (tryRupeesToPaise(v) ?? 0) > 0, {
        message: "Must be a positive number with at most 2 decimals",
      })
      .refine(
        (v) =>
          remainingPaise === undefined ||
          (tryRupeesToPaise(v) ?? 0) <= remainingPaise,
        {
          message: `Exceeds remaining balance of ${formatPaise(remainingPaise ?? 0)}`,
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
  remainingPaise?: number;
  transactionId?: string;
  vendorPaymentId: string;
}

function TransactionFormContent({
  canApprove,
  initialValues,
  mode,
  onOpenChange,
  remainingPaise,
  transactionId,
  vendorPaymentId,
}: {
  canApprove: boolean;
  initialValues?: TransactionFormValues;
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  remainingPaise?: number;
  transactionId?: string;
  vendorPaymentId: string;
}) {
  const zero = useZero();
  const entityId = mode === "edit" && transactionId ? transactionId : uuidv7();
  const schema = buildTransactionFormSchema(remainingPaise);

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
      const amountPaise = rupeesToPaise(parsed.amount);

      if (mode === "edit" && transactionId) {
        const res = await zero.mutate(
          mutators.vendorPaymentTransaction.update({
            amountPaise,
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
            amountPaise,
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
  let submitLabel = "Request payment";
  let submittingLabel = "Requesting...";

  if (isEdit) {
    submitLabel = "Update Payment";
    submittingLabel = "Updating...";
  } else if (canApprove) {
    submitLabel = "Record payment";
    submittingLabel = "Recording...";
  }

  const stableOnCancel0 = useEventCallback(() => onOpenChange(false));

  return (
    <FormLayout form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <InputField isRequired label="Amount" name="amount" />
          {remainingPaise !== undefined && (
            <p className="text-muted-foreground mt-1 text-xs">
              Remaining: {formatPaise(remainingPaise)}
            </p>
          )}
        </div>
        <InputField label="Description" name="description" />
        <DateField isRequired label="Transaction date" name="transactionDate" />
        {canApprove ? (
          <>
            <InputField label="Payment method" name="paymentMethod" />
            <InputField label="Payment reference" name="paymentReference" />
          </>
        ) : null}
      </div>

      <CustomField<Attachment[]> label="Attachments" name="attachments">
        {(field) => (
          <AttachmentsSection
            fileDownloadKind="vendorPaymentTransactionAttachment"
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
  remainingPaise,
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
  let title = "Request payment";
  let description =
    "Request a payment against this vendor payment. An approver will record the payment details.";

  if (isEdit) {
    title = "Edit Payment";
    description = "Update this payment record.";
  } else if (canApprove) {
    title = "Record payment";
    description = "Record a payment made against this vendor payment.";
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-md)">
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
          remainingPaise={remainingPaise}
          transactionId={transactionId}
          vendorPaymentId={vendorPaymentId}
        />
      </DialogContent>
    </Dialog>
  );
}
