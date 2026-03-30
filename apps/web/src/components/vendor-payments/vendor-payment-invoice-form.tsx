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
import { useRef, useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { AttachmentsSection } from "@/components/form/attachments-section";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { type Attachment, attachmentSchema } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";

const invoiceFormSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  invoiceDate: z.date({ message: "Invoice date is required" }),
  attachments: z
    .array(attachmentSchema)
    .min(1, "At least one invoice attachment is required"),
});

interface InvoiceFormDialogProps {
  initialValues?: {
    invoiceNumber: string;
    invoiceDate: Date | null;
    attachments: Attachment[];
  };
  mode: "submit" | "edit";
  onOpenChange: (open: boolean) => void;
  open: boolean;
  vendorPaymentId: string;
}

function InvoiceFormContent({
  initialValues,
  mode,
  onOpenChange,
  vendorPaymentId,
}: {
  initialValues?: InvoiceFormDialogProps["initialValues"];
  mode: "submit" | "edit";
  onOpenChange: (open: boolean) => void;
  vendorPaymentId: string;
}) {
  const zero = useZero();
  const entityIdRef = useRef(uuidv7());
  const entityId = entityIdRef.current;

  const form = useForm({
    defaultValues: {
      invoiceNumber: initialValues?.invoiceNumber ?? "",
      invoiceDate: initialValues?.invoiceDate ?? undefined,
      attachments: (initialValues?.attachments ?? []) as Attachment[],
    },
    onSubmit: async ({ value }) => {
      const parsed = invoiceFormSchema.parse(value);

      const mutatorName = mode === "submit" ? "submitInvoice" : "updateInvoice";

      const res = await zero.mutate(
        mutators.vendorPayment[mutatorName]({
          id: vendorPaymentId,
          invoiceNumber: parsed.invoiceNumber,
          invoiceDate: parsed.invoiceDate.getTime(),
          attachments: parsed.attachments,
        })
      ).server;

      handleMutationResult(res, {
        mutation: `vendorPayment.${mutatorName}`,
        entityId: vendorPaymentId,
        successMsg: mode === "submit" ? "Invoice submitted" : "Invoice updated",
        errorMsg:
          mode === "submit"
            ? "Failed to submit invoice"
            : "Failed to update invoice",
      });

      if (res.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: {
      onChange: invoiceFormSchema,
      onSubmit: invoiceFormSchema,
    },
  });

  return (
    <FormLayout form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField isRequired label="Invoice Number" name="invoiceNumber" />
        <DateField isRequired label="Invoice Date" name="invoiceDate" />
      </div>

      <form.Field name="attachments">
        {(field) => (
          <AttachmentsSection
            entityId={entityId}
            onChange={(attachments) => field.handleChange(attachments)}
            value={(field.state.value ?? []) as Attachment[]}
          />
        )}
      </form.Field>

      <FormActions
        cancelLabel="Cancel"
        onCancel={() => onOpenChange(false)}
        submitLabel={mode === "submit" ? "Submit Invoice" : "Update Invoice"}
        submittingLabel={mode === "submit" ? "Submitting..." : "Updating..."}
      />
    </FormLayout>
  );
}

export function InvoiceFormDialog({
  initialValues,
  mode,
  onOpenChange,
  open,
  vendorPaymentId,
}: InvoiceFormDialogProps) {
  const [formKey, setFormKey] = useState(0);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "submit" ? "Upload Invoice" : "Edit Invoice"}
          </DialogTitle>
          <DialogDescription>
            {mode === "submit"
              ? "Upload the vendor invoice to complete this payment."
              : "Update the invoice details and resubmit for review."}
          </DialogDescription>
        </DialogHeader>
        <InvoiceFormContent
          initialValues={initialValues}
          key={formKey}
          mode={mode}
          onOpenChange={onOpenChange}
          vendorPaymentId={vendorPaymentId}
        />
      </DialogContent>
    </Dialog>
  );
}
