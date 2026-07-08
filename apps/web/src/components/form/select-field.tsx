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
  options,
  placeholder,
  submitted,
  triggerClassName,
}: {
  disabled: boolean;
  field: FormFieldApi<string | undefined>;
  isRequired: boolean;
  options: SelectOption[];
  placeholder: string;
  submitted: boolean;
  triggerClassName: string;
}) {
  const selectedValue = field.state.value;
  const selectedLabel =
    options.find((option) => option.value === selectedValue)?.label ??
    placeholder;
  const handleOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      field.handleBlur();
    }
  });

  return (
    <Select
      disabled={disabled}
      onOpenChange={handleOpenChange}
      onValueChange={field.handleChange}
      value={selectedValue ?? ""}
    >
      <SelectTrigger
        {...fieldErrorProps(field, submitted)}
        aria-required={isRequired}
        className={triggerClassName}
        id={field.name}
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
  isRequired = false,
  label,
  name,
  options,
  placeholder = "Select an option",
  triggerClassName = "w-full",
  validators,
}: SelectFieldProps) {
  const resolvedForm = useResolvedForm(form, "SelectField");
  return (
    <CustomField<string | undefined>
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
          isRequired={isRequired}
          options={options}
          placeholder={placeholder}
          submitted={resolvedForm.state.submissionAttempts > 0}
          triggerClassName={triggerClassName}
        />
      )}
    </CustomField>
  );
}
