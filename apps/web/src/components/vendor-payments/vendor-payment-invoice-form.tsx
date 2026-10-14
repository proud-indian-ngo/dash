import { FieldError } from "@pi-dash/design-system/components/ui/field";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@pi-dash/design-system/components/ui/toggle-group";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type VendorPaymentNoInvoiceReason,
  vendorPaymentNoInvoiceReasonValues,
} from "@pi-dash/shared/constants";
import { NO_INVOICE_REASON_LABELS } from "@pi-dash/shared/vendor-payment";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import type z from "zod";

import { AttachmentsSection } from "@/components/form/attachments-section";
import { CustomField } from "@/components/form/custom-field";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import {
  type FormFieldApi,
  getFieldErrorState,
} from "@/components/form/form-context";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import type { Attachment } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";
import { invoiceFormSchema } from "@/lib/vendor-payment-invoice-schema";

export type InvoiceKind = "invoice" | "no_invoice";

const reasonOptions = vendorPaymentNoInvoiceReasonValues.map((value) => ({
  label: NO_INVOICE_REASON_LABELS[value],
  value,
}));

const KIND_ITEM_CLASS =
  "h-auto min-h-8 flex-1 whitespace-normal py-2 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground";

export interface InvoiceFormInitialValues {
  attachments: Attachment[];
  invoiceDate: Date | null;
  invoiceNumber: string;
  kind: InvoiceKind;
  noInvoiceNote: string;
  noInvoiceReason: VendorPaymentNoInvoiceReason | null;
}

interface InvoiceFormDialogProps {
  defaultDocumentDate?: Date;
  initialValues?: InvoiceFormInitialValues;
  mode: "submit" | "edit";
  onOpenChange: (open: boolean) => void;
  open: boolean;
  vendorPaymentId: string;
}

function submitLabels(mode: "submit" | "edit", kind: InvoiceKind) {
  if (kind === "invoice") {
    return mode === "submit"
      ? { label: "Submit invoice", pending: "Submitting..." }
      : { label: "Update invoice", pending: "Updating..." };
  }
  return mode === "submit"
    ? { label: "Submit for review", pending: "Submitting..." }
    : { label: "Update", pending: "Updating..." };
}

function InvoiceFormContent({
  defaultDocumentDate,
  initialValues,
  mode,
  onOpenChange,
  vendorPaymentId,
}: {
  defaultDocumentDate?: Date;
  initialValues?: InvoiceFormInitialValues;
  mode: "submit" | "edit";
  onOpenChange: (open: boolean) => void;
  vendorPaymentId: string;
}) {
  const zero = useZero();

  const form = useForm({
    defaultValues: {
      attachments: (initialValues?.attachments ?? []) as Attachment[],
      invoiceDate: initialValues?.invoiceDate ?? undefined,
      invoiceNumber: initialValues?.invoiceNumber ?? "",
      kind: initialValues?.kind ?? "invoice",
      noInvoiceNote: initialValues?.noInvoiceNote ?? "",
      noInvoiceReason: initialValues?.noInvoiceReason ?? "",
    } as z.input<typeof invoiceFormSchema>,
    onSubmit: async ({ value }) => {
      const parsed = invoiceFormSchema.parse(value);
      const mutatorName = mode === "submit" ? "submitInvoice" : "updateInvoice";
      const isInvoice = parsed.kind === "invoice";
      // Zero represents Postgres date columns as UTC midnight.
      const invoiceDate = Date.UTC(
        parsed.invoiceDate.getFullYear(),
        parsed.invoiceDate.getMonth(),
        parsed.invoiceDate.getDate()
      );

      const args =
        parsed.kind === "invoice"
          ? {
              attachments: parsed.attachments,
              id: vendorPaymentId,
              invoiceDate,
              invoiceNumber: parsed.invoiceNumber.trim(),
              kind: "invoice" as const,
            }
          : {
              attachments: parsed.attachments,
              id: vendorPaymentId,
              invoiceDate,
              kind: "no_invoice" as const,
              noInvoiceNote: parsed.noInvoiceNote.trim() || undefined,
              noInvoiceReason: parsed.noInvoiceReason,
            };

      const res = await zero.mutate(mutators.vendorPayment[mutatorName](args))
        .server;

      const noun = isInvoice ? "invoice" : "details";
      handleMutationResult(res, {
        entityId: vendorPaymentId,
        errorMsg:
          mode === "submit"
            ? `Couldn't submit ${noun}`
            : `Couldn't update ${noun}`,
        mutation: `vendorPayment.${mutatorName}`,
        successMsg:
          mode === "submit"
            ? `${isInvoice ? "Invoice" : "Details"} submitted`
            : `${isInvoice ? "Invoice" : "Details"} updated`,
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
  const stableOnCancel0 = useEventCallback(() => onOpenChange(false));
  const selectKind = useEventCallback((next: string[]) => {
    const picked = next[0];
    if (picked === "invoice" || picked === "no_invoice") {
      form.setFieldValue("kind", picked);
      if (picked === "no_invoice" && !form.state.values.invoiceDate) {
        form.setFieldValue("invoiceDate", defaultDocumentDate);
      }
    }
  });

  return (
    <FormLayout form={form}>
      <CustomField<InvoiceKind>
        controlId="invoice-kind"
        label="Do you have an invoice?"
        name="kind"
      >
        {(field) => (
          <ToggleGroup
            aria-label="Do you have an invoice?"
            className="w-full"
            id="invoice-kind"
            onValueChange={selectKind}
            value={[field.state.value]}
            variant="outline"
          >
            <ToggleGroupItem
              className={KIND_ITEM_CLASS}
              size="sm"
              value="invoice"
            >
              Yes, upload invoice
            </ToggleGroupItem>
            <ToggleGroupItem
              className={KIND_ITEM_CLASS}
              size="sm"
              value="no_invoice"
            >
              No invoice
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </CustomField>

      <form.Subscribe
        selector={(state) => ({
          kind: state.values.kind,
          reason: state.values.noInvoiceReason,
        })}
      >
        {({ kind, reason }) =>
          kind === "invoice" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                isRequired
                label="Invoice number"
                name="invoiceNumber"
              />
              <DateField isRequired label="Invoice date" name="invoiceDate" />
            </div>
          ) : (
            <>
              <SelectField
                isRequired
                label="Reason"
                name="noInvoiceReason"
                options={reasonOptions}
                placeholder="Pick a reason"
              />
              <DateField
                isRequired
                label={reason === "other" ? "Date" : "Receipt or challan date"}
                name="invoiceDate"
              />
              <TextareaField
                description={
                  reason === "other"
                    ? "Explain why this payment has no invoice."
                    : undefined
                }
                isRequired={reason === "other"}
                label={reason === "other" ? "Note" : "Note (optional)"}
                name="noInvoiceNote"
                rows={3}
              />
            </>
          )
        }
      </form.Subscribe>

      <form.Subscribe selector={(state) => state.values.kind}>
        {(kind) => (
          <form.Field name="attachments">
            {(field) => {
              const { hasError, errorMessageId } = getFieldErrorState(
                field as unknown as FormFieldApi,
                form.state.submissionAttempts > 0
              );
              return (
                <div className="flex flex-col gap-2">
                  <AttachmentsSection
                    description={
                      kind === "invoice"
                        ? undefined
                        : "Rent receipt, agreement or challan, if you have one"
                    }
                    fileDownloadKind="vendorPaymentAttachment"
                    label={
                      kind === "invoice" ? "Attachments" : "Proof (optional)"
                    }
                    onChange={field.handleChange}
                    value={(field.state.value ?? []) as Attachment[]}
                    vendorPaymentInvoiceId={vendorPaymentId}
                  />
                  {hasError ? (
                    <FieldError
                      errors={field.state.meta.errors}
                      id={errorMessageId}
                    />
                  ) : null}
                </div>
              );
            }}
          </form.Field>
        )}
      </form.Subscribe>

      <form.Subscribe selector={(state) => state.values.kind}>
        {(kind) => {
          const labels = submitLabels(mode, kind);
          return (
            <FormActions
              cancelLabel="Cancel"
              disableWhenInvalid={false}
              onCancel={stableOnCancel0}
              submitLabel={labels.label}
              submittingLabel={labels.pending}
            />
          );
        }}
      </form.Subscribe>
    </FormLayout>
  );
}

export function InvoiceFormDialog({
  defaultDocumentDate,
  initialValues,
  mode,
  onOpenChange,
  open,
  vendorPaymentId,
}: InvoiceFormDialogProps) {
  const [formKey, setFormKey] = useState(0);

  const handleOpenChange = useEventCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(nextOpen);
  });

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>
            {mode === "submit" ? "Add invoice or reason" : "Edit details"}
          </DialogTitle>
          <DialogDescription>
            {mode === "submit"
              ? "Upload the vendor invoice, or say why this payment has none."
              : "Update the invoice or the reason and proof for a payment without one."}
          </DialogDescription>
        </DialogHeader>
        <InvoiceFormContent
          defaultDocumentDate={defaultDocumentDate}
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
