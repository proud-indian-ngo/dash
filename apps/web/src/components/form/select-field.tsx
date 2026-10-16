import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { ReactNode } from "react";

import { CustomField } from "./custom-field";
import {
  type FieldValidatorConfig,
  type FormFieldApi,
  type FormInstance,
  fieldErrorProps,
  useFormSubmitted,
  useResolvedForm,
} from "./form-context";

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectFieldProps {
  description?: ReactNode;
  disabled?: boolean;
  form?: FormInstance;
  hideLabel?: boolean;
  id?: string;
  isRequired?: boolean;
  label: string;
  name: string;
  options: SelectOption[];
  placeholder?: string;
  triggerClassName?: string;
  validators?: FieldValidatorConfig<string | undefined>;
}

function SelectFieldControl({
  disabled,
  field,
  isRequired,
  id,
  options,
  placeholder,
  submitted,
  triggerClassName,
}: {
  disabled: boolean;
  field: FormFieldApi<string | undefined>;
  isRequired: boolean;
  id?: string;
  options: SelectOption[];
  placeholder: string;
  submitted: boolean;
  triggerClassName: string;
}) {
  const selectedValue = field.state.value;
  const selectedLabel =
    options.find((option) => option.value === selectedValue)?.label ??
    placeholder;
  // Base UI resets the value to null, with no user action, when the items
  // change and no longer hold it (for example a channel that swaps the mode
  // of receipt and its options in one update). The form owns the value, so
  // only a chosen item changes it.
  const handleValueChange = useEventCallback(
    (value: string | null, details: { cancel: () => void }) => {
      if (value === null) {
        details.cancel();
        return;
      }
      field.handleChange(value);
    }
  );
  const handleOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      field.handleBlur();
    }
  });

  return (
    <Select
      disabled={disabled}
      onOpenChange={handleOpenChange}
      onValueChange={handleValueChange}
      value={selectedValue ?? ""}
    >
      <SelectTrigger
        {...fieldErrorProps(field, submitted)}
        aria-required={isRequired}
        className={triggerClassName}
        id={id ?? field.name}
      >
        <span
          className="flex flex-1 items-center text-left"
          data-slot="select-value"
        >
          {selectedLabel}
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SelectField({
  description,
  disabled = false,
  form,
  hideLabel = false,
  id,
  isRequired = false,
  label,
  name,
  options,
  placeholder = "Select an option",
  triggerClassName = "w-full",
  validators,
}: SelectFieldProps) {
  const resolvedForm = useResolvedForm(form, "SelectField");
  const submitted = useFormSubmitted(resolvedForm);
  return (
    <CustomField<string | undefined>
      controlId={id}
      description={description}
      form={form}
      hideLabel={hideLabel}
      isRequired={isRequired}
      label={label}
      name={name}
      validators={validators}
    >
      {(field) => (
        <SelectFieldControl
          disabled={disabled}
          field={field}
          id={id}
          isRequired={isRequired}
          options={options}
          placeholder={placeholder}
          submitted={submitted}
          triggerClassName={triggerClassName}
        />
      )}
    </CustomField>
  );
}
