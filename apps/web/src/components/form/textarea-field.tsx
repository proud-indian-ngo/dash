import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { CustomField } from "./custom-field";
import { type FieldValidatorConfig, fieldErrorProps } from "./form-context";

type BaseTextareaProps = Omit<
  ComponentPropsWithoutRef<typeof Textarea>,
  "form" | "id" | "name" | "onBlur" | "onChange" | "value"
>;

interface TextareaFieldProps extends BaseTextareaProps {
  description?: ReactNode;
  form?: unknown;
  hideLabel?: boolean;
  isRequired?: boolean;
  label: string;
  name: string;
  validators?: FieldValidatorConfig<string>;
}

export function TextareaField({
  description,
  form,
  hideLabel = false,
  isRequired = false,
  label,
  name,
  validators,
  ...props
}: TextareaFieldProps) {
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
          <Textarea
            {...props}
            {...fieldErrorProps(field)}
            id={field.name}
            name={field.name}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            value={(field.state.value ?? "") as string}
          />
        );
      }}
    </CustomField>
  );
}
