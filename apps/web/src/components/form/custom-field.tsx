import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@pi-dash/design-system/components/ui/field";
import { cn } from "@pi-dash/design-system/lib/utils";
import type { ReactNode } from "react";

import type {
  FieldValidatorConfig,
  FormFieldApi,
  FormInstance,
} from "./form-context";
import {
  getFieldErrorState,
  useFormSubmitted,
  useResolvedForm,
} from "./form-context";

interface CustomFieldProps<TValue = unknown> {
  /** Renders the control; `submitted` is whether the form was submitted. */
  children: (field: FormFieldApi<TValue>, submitted: boolean) => ReactNode;
  className?: string;
  controlId?: string;
  description?: ReactNode;
  form?: FormInstance;
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
  controlId,
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
  const submitted = useFormSubmitted(resolvedForm);

  return (
    <resolvedForm.Field name={name} validators={validators}>
      {(field: unknown) => {
        const typedField = field as FormFieldApi<TValue>;
        const { hasError, errorMessageId } = getFieldErrorState(
          typedField,
          submitted
        );

        return (
          <Field
            className={className}
            data-invalid={hasError || undefined}
            orientation={orientation}
          >
            <FieldLabel
              className={cn(hideLabel && "sr-only")}
              htmlFor={controlId ?? typedField.name}
            >
              {label}
              {isRequired ? (
                <span aria-hidden="true" className="text-destructive">
                  {" "}
                  *
                </span>
              ) : null}
            </FieldLabel>
            {children(typedField, submitted)}
            {description ? (
              <FieldDescription>{description}</FieldDescription>
            ) : null}
            {hasError ? (
              <FieldError
                errors={typedField.state.meta.errors}
                id={errorMessageId}
              />
            ) : null}
          </Field>
        );
      }}
    </resolvedForm.Field>
  );
}
