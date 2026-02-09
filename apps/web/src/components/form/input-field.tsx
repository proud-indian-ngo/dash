import { Input } from "@pi-dash/design-system/components/ui/input";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { CustomField } from "./custom-field";
import { type FieldValidatorConfig, fieldErrorProps } from "./form-context";

type BaseInputProps = Omit<
  ComponentPropsWithoutRef<typeof Input>,
  "form" | "id" | "name" | "onBlur" | "onChange" | "type" | "value"
>;

interface InputFieldProps extends BaseInputProps {
  description?: ReactNode;
  form?: unknown;
  hideLabel?: boolean;
  isRequired?: boolean;
  label: string;
  name: string;
  type?: ComponentPropsWithoutRef<typeof Input>["type"];
  validators?: FieldValidatorConfig<string | number>;
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
      {(field) => {
        return (
          <Input
            {...props}
            {...fieldErrorProps(field)}
            id={field.name}
            name={field.name}
            onBlur={field.handleBlur}
            onChange={(event) => {
              const nextValue =
                type === "number"
                  ? Number(event.target.value)
                  : event.target.value;
              field.handleChange(nextValue);
            }}
            type={type}
            value={(field.state.value ?? "") as string | number}
          />
        );
      }}
    </CustomField>
  );
}
