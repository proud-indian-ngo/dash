import { FieldDescription } from "@pi-dash/design-system/components/ui/field";
import { Switch } from "@pi-dash/design-system/components/ui/switch";
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

interface CheckboxFieldProps {
  className?: string;
  description?: ReactNode;
  form?: FormInstance;
  isRequired?: boolean;
  label: string;
  name: string;
  readonly?: boolean;
  validators?: FieldValidatorConfig<boolean>;
}

function CheckboxFieldControl({
  field,
  isRequired,
  readonly,
  submitted,
}: {
  field: FormFieldApi<boolean>;
  isRequired: boolean;
  readonly: boolean;
  submitted: boolean;
}) {
  const handleCheckedChange = useEventCallback((checked: boolean) => {
    field.handleChange(Boolean(checked));
  });

  return (
    <Switch
      {...fieldErrorProps(field, submitted)}
      aria-required={isRequired}
      checked={Boolean(field.state.value)}
      disabled={readonly}
      id={field.name}
      onBlur={field.handleBlur}
      onCheckedChange={handleCheckedChange}
    />
  );
}

export function CheckboxField({
  className = "rounded-none border p-2",
  description,
  form,
  isRequired = false,
  label,
  name,
  readonly = false,
  validators,
}: CheckboxFieldProps) {
  const resolvedForm = useResolvedForm(form, "CheckboxField");
  return (
    <div className="flex flex-col gap-1">
      <CustomField<boolean>
        className={className}
        form={form}
        isRequired={isRequired}
        label={label}
        name={name}
        orientation="horizontal"
        validators={validators}
      >
        {(field) => (
          <CheckboxFieldControl
            field={field}
            isRequired={isRequired}
            readonly={readonly}
            submitted={resolvedForm.state.submissionAttempts > 0}
          />
        )}
      </CustomField>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </div>
  );
}
