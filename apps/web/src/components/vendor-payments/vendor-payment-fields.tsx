import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import type { ExpenseCategory } from "@pi-dash/zero/schema";
import { AttachmentsSection } from "@/components/form/attachments-section";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { InputField } from "@/components/form/input-field";
import { LineItemsEditor } from "@/components/form/line-items-editor";
import { VendorFormDialog } from "@/components/vendors/vendor-form-dialog";
import type { Attachment } from "@/lib/form-schemas";

interface VendorPaymentFieldsProps {
  categoryList: ExpenseCategory[];
  entityId: string;
  isEdit: boolean;
  onCancel: () => void;
  onVendorCreated: (vendorId: string) => void;
  onVendorDialogOpenChange: (open: boolean) => void;
  vendorDialogOpen: boolean;
  vendorOptions: { label: string; value: string }[];
}

export function VendorPaymentFields({
  categoryList,
  entityId,
  isEdit,
  onCancel,
  onVendorCreated,
  vendorDialogOpen,
  vendorOptions,
  onVendorDialogOpenChange,
}: VendorPaymentFieldsProps) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField isRequired label="Title" name="title" />
        <CustomField<string | undefined>
          isRequired
          label="Vendor"
          name="vendorId"
        >
          {(field) => (
            <div className="flex gap-2">
              <Select
                onValueChange={(val) => field.handleChange(val)}
                value={field.state.value ?? ""}
              >
                <SelectTrigger
                  aria-describedby={
                    field.state.meta.errors.length > 0
                      ? `${field.name}-error`
                      : undefined
                  }
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  className="w-full"
                  id={field.name}
                  onBlur={field.handleBlur}
                >
                  <span
                    className="flex flex-1 items-center text-left"
                    data-slot="select-value"
                  >
                    {vendorOptions.find((o) => o.value === field.state.value)
                      ?.label ?? "Select vendor"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {vendorOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                aria-label="Add new vendor"
                onClick={() => onVendorDialogOpenChange(true)}
                size="icon"
                type="button"
                variant="outline"
              >
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              </Button>
            </div>
          )}
        </CustomField>
      </div>

      <Separator />

      <LineItemsEditor categories={categoryList} />

      <Separator />

      <CustomField<Attachment[]>
        label="Quotation / Supporting Documents"
        name="attachments"
      >
        {(field) => (
          <AttachmentsSection
            entityId={entityId}
            onChange={(attachments) => field.handleChange(attachments)}
            value={field.state.value ?? []}
          />
        )}
      </CustomField>

      <Separator />

      <FormActions
        cancelLabel="Cancel"
        disableWhenInvalid={false}
        onCancel={onCancel}
        submitLabel={isEdit ? "Save changes" : "Submit"}
        submittingLabel={isEdit ? "Saving..." : "Submitting..."}
      />

      <VendorFormDialog
        mode="inline"
        onCreated={onVendorCreated}
        onOpenChange={onVendorDialogOpenChange}
        open={vendorDialogOpen}
        vendor={null}
      />
    </>
  );
}
