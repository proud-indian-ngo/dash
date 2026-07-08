import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
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

type BaseTextareaProps = Omit<
  ComponentPropsWithoutRef<typeof Textarea>,
  "form" | "id" | "name" | "onBlur" | "onChange" | "value"
>;

interface TextareaFieldProps extends BaseTextareaProps {
  description?: ReactNode;
  form?: FormInstance;
  hideLabel?: boolean;
  isRequired?: boolean;
  label: string;
  name: string;
  validators?: FieldValidatorConfig<string>;
}

interface TextareaFieldControlProps extends BaseTextareaProps {
  field: FormFieldApi<string>;
  isRequired: boolean;
  submitted: boolean;
}

function TextareaFieldControl({
  field,
  isRequired,
  submitted,
  ...props
}: TextareaFieldControlProps) {
  const handleChange = useEventCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      field.handleChange(event.target.value);
    }
  );

  return (
    <Textarea
      {...props}
      {...fieldErrorProps(field, submitted)}
      aria-required={isRequired}
      id={field.name}
      name={field.name}
      onBlur={field.handleBlur}
      onChange={handleChange}
      value={(field.state.value ?? "") as string}
    />
  );
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
  const resolvedForm = useResolvedForm(form, "TextareaField");
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
        <TextareaFieldControl
          {...props}
          field={field}
          isRequired={isRequired}
          submitted={resolvedForm.state.submissionAttempts > 0}
        />
      )}
    </CustomField>
  );
}
