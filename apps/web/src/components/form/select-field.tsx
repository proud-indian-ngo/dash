import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import type { ReactNode } from "react";

import { CustomField } from "./custom-field";
import {
  type FieldValidatorConfig,
  type FormInstance,
  fieldErrorProps,
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
      {(field) => {
        const selectedValue = field.state.value;
        const selectedLabel =
          options.find((option) => option.value === selectedValue)?.label ??
          placeholder;

        return (
          <Select
            disabled={disabled}
            onValueChange={(value) => field.handleChange(value)}
            value={selectedValue ?? ""}
          >
            <SelectTrigger
              {...fieldErrorProps(field)}
              className={triggerClassName}
              id={field.name}
              onBlur={field.handleBlur}
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
      }}
    </CustomField>
  );
}
