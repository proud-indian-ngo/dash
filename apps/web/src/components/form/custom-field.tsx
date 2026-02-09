import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@pi-dash/design-system/components/ui/field";
import { cn } from "@pi-dash/design-system/lib/utils";
import type { ReactNode } from "react";

import type { FieldValidatorConfig, FormFieldApi } from "./form-context";
import { getFieldErrorState, useResolvedForm } from "./form-context";

interface CustomFieldProps<TValue = unknown> {
  children: (field: FormFieldApi<TValue>) => ReactNode;
  className?: string;
  description?: ReactNode;
  form?: unknown;
  hideLabel?: boolean;
  isRequired?: boolean;
  label: ReactNode;
  name: string;
  orientation?: "horizontal" | "vertical";
  validators?: FieldValidatorConfig<TValue>;
}

export function CustomField<TValue = unknown>({
  children,
  className,
  description,
  form,
  hideLabel = false,
  isRequired = false,
  label,
  name,
  orientation,
  validators,
}: CustomFieldProps<TValue>) {
  const resolvedForm = useResolvedForm(form, "CustomField");

  return (
    <resolvedForm.Field name={name} validators={validators}>
      {(field) => {
        const typedField = field as FormFieldApi<TValue>;
        const { hasError, errorMessageId } = getFieldErrorState(typedField);

        return (
          <Field
            className={className}
            data-invalid={hasError || undefined}
            orientation={orientation}
          >
            <FieldLabel
              className={cn(hideLabel && "sr-only")}
              htmlFor={typedField.name}
            >
              {label}
              {isRequired ? <span className="text-destructive"> *</span> : null}
            </FieldLabel>
            {children(typedField)}
            {description ? (
              <FieldDescription>{description}</FieldDescription>
            ) : null}
            <FieldError
              errors={typedField.state.meta.errors}
              id={hasError ? errorMessageId : undefined}
            />
          </Field>
        );
      }}
    </resolvedForm.Field>
  );
}
