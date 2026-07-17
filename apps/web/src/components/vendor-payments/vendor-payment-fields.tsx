import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@pi-dash/design-system/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { ExpenseCategory } from "@pi-dash/zero/schema";
import { AttachmentsSection } from "@/components/form/attachments-section";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import type { FormFieldApi } from "@/components/form/form-context";
import {
  fieldErrorProps,
  useResolvedForm,
} from "@/components/form/form-context";
import { InputField } from "@/components/form/input-field";
import { LineItemsEditor } from "@/components/form/line-items-editor";
import type { SelectOption } from "@/components/form/select-field";
import { SelectField } from "@/components/form/select-field";
import { VendorFormDialog } from "@/components/vendors/vendor-form-dialog";
import type { Attachment } from "@/lib/form-schemas";
import { cityOptions } from "@/lib/form-schemas";

interface VendorPaymentFieldsProps {
  categoryList: ExpenseCategory[];
  entityId: string;
  eventOptions: SelectOption[];
  isEdit: boolean;
  onCancel: () => void;
  onVendorCreated: (vendorId: string) => void;
  onVendorDialogOpenChange: (open: boolean) => void;
  vendorDialogOpen: boolean;
  vendorOptions: { label: string; value: string }[];
}

function VendorSelectField({
  field,
  onVendorDialogOpenChange,
  submitted,
  vendorOptions,
}: {
  field: FormFieldApi<string | undefined>;
  onVendorDialogOpenChange: (open: boolean) => void;
  submitted: boolean;
  vendorOptions: { label: string; value: string }[];
}) {
  const handleOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      field.handleBlur();
    }
  });
  const handleAddVendor = useEventCallback(() =>
    onVendorDialogOpenChange(true)
  );
  const handleValueChange = useEventCallback((value: string | null) => {
    field.handleChange(value ?? undefined);
  });

  return (
    <div className="flex gap-2">
      <Select
        onOpenChange={handleOpenChange}
        onValueChange={handleValueChange}
        value={field.state.value ?? ""}
      >
        <SelectTrigger
          {...fieldErrorProps(field, submitted)}
          className="w-full"
          id={field.name}
        >
          <span
            className="flex flex-1 items-center text-left"
            data-slot="select-value"
          >
            {vendorOptions.find((o) => o.value === field.state.value)?.label ??
              "Select vendor"}
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
        onClick={handleAddVendor}
        size="icon"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
      </Button>
    </div>
  );
}

function EventSelectField({
  eventOptions,
  field,
}: {
  eventOptions: SelectOption[];
  field: FormFieldApi<string | undefined>;
}) {
  const items = ["", ...eventOptions.map((o) => o.value)];
  const optionMap = new Map(eventOptions.map((o) => [o.value, o.label]));
  const itemToStringLabel = useEventCallback((value: string) =>
    value === "" ? "No event" : (optionMap.get(value) ?? String(value))
  );
  const handleValueChange = useEventCallback((value: string | null) =>
    field.handleChange(value === "" || value === null ? undefined : value)
  );

  return (
    <Combobox
      items={items}
      itemToStringLabel={itemToStringLabel}
      onValueChange={handleValueChange}
      value={field.state.value ?? ""}
    >
      <ComboboxInput
        className="w-full"
        id={field.name}
        onBlur={field.handleBlur}
        placeholder="No event"
        showClear={!!field.state.value}
      />
      <ComboboxContent>
        <ComboboxList>
          {(itemValue) => (
            <ComboboxItem key={itemValue} value={itemValue}>
              {itemValue === ""
                ? "No event"
                : (optionMap.get(itemValue) ?? itemValue)}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>No matching events.</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}

export function VendorPaymentFields({
  categoryList,
  entityId,
  eventOptions,
  isEdit,
  onCancel,
  onVendorCreated,
  vendorDialogOpen,
  vendorOptions,
  onVendorDialogOpenChange,
}: VendorPaymentFieldsProps) {
  const resolvedForm = useResolvedForm(undefined, "VendorPaymentFields");
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField isRequired label="Title" name="title" />
        <SelectField
          isRequired
          label="City"
          name="city"
          options={cityOptions}
          placeholder="Select city"
        />
        <CustomField<string | undefined>
          isRequired
          label="Vendor"
          name="vendorId"
        >
          {(field) => {
            const submitted = resolvedForm.state.submissionAttempts > 0;
            return (
              <VendorSelectField
                field={field}
                onVendorDialogOpenChange={onVendorDialogOpenChange}
                submitted={submitted}
                vendorOptions={vendorOptions}
              />
            );
          }}
        </CustomField>
        <CustomField<string | undefined> label="Event" name="eventId">
          {(field) => (
            <EventSelectField eventOptions={eventOptions} field={field} />
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
            fileDownloadKind="vendorPaymentAttachment"
            onChange={field.handleChange}
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
