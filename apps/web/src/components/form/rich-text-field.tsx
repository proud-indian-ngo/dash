import { lazy, type ReactNode, Suspense } from "react";

import { EditorSkeleton } from "@/components/editor/editor-skeletons";

import { CustomField } from "./custom-field";
import {
  blurField,
  fieldErrorProps,
  type FieldValidatorConfig,
  type FormInstance,
  useResolvedForm,
} from "./form-context";

const RichTextEditor = lazy(() =>
  import("@pi-dash/editor/rich-text-editor").then((m) => ({
    default: m.RichTextEditor,
  }))
);

/**
 * A rich text field (`@pi-dash/shared/rich-text`): the event updates editor
 * kept to what a signed document can show. The value is Plate JSON.
 */
export function RichTextField({
  description,
  form,
  isRequired = false,
  label,
  name,
  placeholder,
  validators,
}: {
  description?: ReactNode;
  form?: FormInstance;
  isRequired?: boolean;
  label: string;
  name: string;
  placeholder?: string;
  validators?: FieldValidatorConfig<string>;
}) {
  useResolvedForm(form, "RichTextField");
  return (
    <CustomField<string>
      description={description}
      form={form}
      isRequired={isRequired}
      label={label}
      name={name}
      validators={validators}
    >
      {(field, submitted) => (
        <Suspense fallback={<EditorSkeleton />}>
          <RichTextEditor
            {...fieldErrorProps(field, submitted)}
            aria-label={label}
            id={field.name}
            onBlur={() => blurField(field)}
            onChange={(value) => field.handleChange(value)}
            placeholder={placeholder}
            value={field.state.value}
          />
        </Suspense>
      )}
    </CustomField>
  );
}
