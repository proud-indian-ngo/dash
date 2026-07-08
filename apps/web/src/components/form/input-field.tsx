import { Input } from "@pi-dash/design-system/components/ui/input";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { ChangeEvent, ComponentPropsWithoutRef, ReactNode } from "react";
import { CustomField } from "./custom-field";
import {
  type FieldValidatorConfig,
  type FormFieldApi,
  type FormInstance,
  fieldErrorProps,
  useResolvedForm,
} from "./form-context";

type BaseInputProps = Omit<
  ComponentPropsWithoutRef<typeof Input>,
  "form" | "id" | "name" | "onBlur" | "onChange" | "type" | "value"
>;

interface InputFieldProps extends BaseInputProps {
  description?: ReactNode;
  form?: FormInstance;
  hideLabel?: boolean;
  isRequired?: boolean;
  label: string;
  name: string;
  type?: ComponentPropsWithoutRef<typeof Input>["type"];
  validators?: FieldValidatorConfig<string | number>;
}

interface InputFieldControlProps extends BaseInputProps {
  field: FormFieldApi<string | number>;
  isRequired: boolean;
  submitted: boolean;
  type: ComponentPropsWithoutRef<typeof Input>["type"];
}

function InputFieldControl({
  field,
  isRequired,
  submitted,
  type,
  ...props
}: InputFieldControlProps) {
  const handleChange = useEventCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue =
        type === "number" ? Number(event.target.value) : event.target.value;
      field.handleChange(nextValue);
    }
  );

  return (
    <Input
      {...props}
      {...fieldErrorProps(field, submitted)}
      aria-required={isRequired}
      id={field.name}
      name={field.name}
      onBlur={field.handleBlur}
      onChange={handleChange}
      type={type}
      value={(field.state.value ?? "") as string | number}
    />
  );
}

export function InputField({
  description,
  form,
  hideLabel = false,
  isRequired = false,
  label,
  name,
  type = "text",
  validators,
  ...props
}: InputFieldProps) {
  const resolvedForm = useResolvedForm(form, "InputField");
  return (
    <CustomField
      description={description}
      form={form}
      hideLabel={hideLabel}
      isRequired={isRequired}
      label={label}
      name={name}
      validators={validators}
    >
      {(field) => (
        <InputFieldControl
          {...props}
          field={field}
          isRequired={isRequired}
          submitted={resolvedForm.state.submissionAttempts > 0}
          type={type}
        />
      )}
    </CustomField>
  );
}
