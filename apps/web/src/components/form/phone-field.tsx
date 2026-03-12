import { PhoneInput } from "@pi-dash/design-system/components/ui/phone-input";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { CustomField } from "./custom-field";
import {
  type FieldValidatorConfig,
  type FormInstance,
  fieldErrorProps,
} from "./form-context";

type BasePhoneProps = Omit<
  ComponentPropsWithoutRef<typeof PhoneInput>,
  "id" | "name" | "onBlur" | "onChange" | "value"
>;

interface PhoneFieldProps extends BasePhoneProps {
  description?: ReactNode;
  form?: FormInstance;
  hideLabel?: boolean;
  isRequired?: boolean;
  label: string;
  name: string;
  validators?: FieldValidatorConfig<string>;
}

export function PhoneField({
  description,
  form,
  hideLabel = false,
  isRequired = false,
  label,
  name,
  validators,
  ...props
}: PhoneFieldProps) {
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
          <PhoneInput
            {...props}
            {...fieldErrorProps(field)}
            aria-required={isRequired}
            id={field.name}
            onBlur={field.handleBlur}
            onChange={(value) => field.handleChange(value)}
            value={(field.state.value ?? "") as string}
          />
        );
      }}
    </CustomField>
  );
}
