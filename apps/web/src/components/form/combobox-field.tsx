import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@pi-dash/design-system/components/ui/combobox";
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
import type { SelectOption } from "./select-field";

/**
 * A single-choice field with type-ahead search. Use it wherever the options
 * are records (people, events, vendors, donors, programmes) rather than a
 * short fixed list; `SelectField` stays for enums such as status or kind.
 */
interface ComboboxFieldProps {
  description?: ReactNode;
  disabled?: boolean;
  emptyMessage?: string;
  form?: FormInstance;
  hideLabel?: boolean;
  id?: string;
  isRequired?: boolean;
  label: string;
  name: string;
  options: SelectOption[];
  placeholder?: string;
  validators?: FieldValidatorConfig<string | undefined>;
}

function ComboboxFieldControl({
  disabled,
  emptyMessage,
  field,
  id,
  isRequired,
  options,
  placeholder,
  submitted,
}: {
  disabled: boolean;
  emptyMessage: string;
  field: FormFieldApi<string | undefined>;
  id?: string;
  isRequired: boolean;
  options: SelectOption[];
  placeholder: string;
  submitted: boolean;
}) {
  const items = options.map((o) => o.value);
  const labels = new Map(options.map((o) => [o.value, o.label]));
  const itemToStringLabel = useEventCallback(
    (value: string) => labels.get(value) ?? value
  );
  const handleValueChange = useEventCallback((value: string | null) =>
    field.handleChange(value === null || value === "" ? undefined : value)
  );
  const value = field.state.value ?? "";

  return (
    <Combobox
      disabled={disabled}
      items={items}
      itemToStringLabel={itemToStringLabel}
      onValueChange={handleValueChange}
      value={value}
    >
      <ComboboxInput
        {...fieldErrorProps(field, submitted)}
        aria-required={isRequired}
        className="w-full"
        id={id ?? field.name}
        onBlur={field.handleBlur}
        placeholder={placeholder}
        showClear={!isRequired && value !== ""}
      />
      <ComboboxContent>
        <ComboboxList>
          {(itemValue: string) => (
            <ComboboxItem key={itemValue} value={itemValue}>
              {labels.get(itemValue) ?? itemValue}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}

export function ComboboxField({
  description,
  disabled = false,
  emptyMessage = "No matches.",
  form,
  hideLabel = false,
  id,
  isRequired = false,
  label,
  name,
  options,
  placeholder = "Search...",
  validators,
}: ComboboxFieldProps) {
  useResolvedForm(form, "ComboboxField");
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
      {(field, submitted) => (
        <ComboboxFieldControl
          disabled={disabled}
          emptyMessage={emptyMessage}
          field={field}
          id={id}
          isRequired={isRequired}
          options={options}
          placeholder={placeholder}
          submitted={submitted}
        />
      )}
    </CustomField>
  );
}
