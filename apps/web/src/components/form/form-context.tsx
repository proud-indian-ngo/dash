import type {
  FieldAsyncValidateOrFn,
  FieldValidateOrFn,
  FieldValidators,
} from "@tanstack/react-form";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";

export type FormFieldError = { message?: string } | undefined;

export type FieldValidatorConfig<TValue = unknown> = FieldValidators<
  unknown,
  string,
  TValue,
  FieldValidateOrFn<unknown, string, TValue> | undefined,
  FieldValidateOrFn<unknown, string, TValue> | undefined,
  FieldAsyncValidateOrFn<unknown, string, TValue> | undefined,
  FieldValidateOrFn<unknown, string, TValue> | undefined,
  FieldAsyncValidateOrFn<unknown, string, TValue> | undefined,
  FieldValidateOrFn<unknown, string, TValue> | undefined,
  FieldAsyncValidateOrFn<unknown, string, TValue> | undefined,
  FieldValidateOrFn<unknown, string, TValue> | undefined,
  FieldAsyncValidateOrFn<unknown, string, TValue> | undefined
>;

export interface FormFieldApi<TValue = unknown> {
  handleBlur: (...args: unknown[]) => void;
  handleChange: (...args: unknown[]) => void;
  name: string;
  state: {
    meta: {
      errors: FormFieldError[];
    };
    value: TValue;
  };
}

export interface FormWithHandleSubmit {
  handleSubmit: () => void;
}

export interface FormWithField {
  Field: <TValue>(props: {
    children: (field: unknown) => ReactNode;
    name: string;
    validators?: FieldValidatorConfig<TValue>;
  }) => ReactNode | Promise<ReactNode>;
}

export interface FormWithSubscribe {
  Subscribe: <
    TSelected = { canSubmit: boolean; isSubmitting: boolean },
  >(props: {
    children: (state: TSelected) => ReactNode;
    selector: (state: {
      canSubmit: boolean;
      isSubmitting: boolean;
    }) => TSelected;
  }) => ReactNode | Promise<ReactNode>;
}

export type FormInstance = FormWithField &
  FormWithHandleSubmit &
  FormWithSubscribe;

const FormContext = createContext<FormInstance | undefined>(undefined);

interface FormContextProviderProps {
  children: ReactNode;
  form: unknown;
}

export function FormContextProvider({
  children,
  form,
}: FormContextProviderProps) {
  return (
    <FormContext.Provider value={form as FormInstance}>
      {children}
    </FormContext.Provider>
  );
}

export function getFieldErrorState(field: FormFieldApi) {
  const hasError = field.state.meta.errors.length > 0;
  const errorMessageId = `${field.name}-error`;
  return { hasError, errorMessageId };
}

export function fieldErrorProps(field: FormFieldApi) {
  const { hasError, errorMessageId } = getFieldErrorState(field);
  return {
    "aria-describedby": hasError ? errorMessageId : undefined,
    "aria-invalid": hasError,
  } as const;
}

export function useResolvedForm(
  form: unknown,
  componentName: string
): FormInstance {
  const contextForm = useContext(FormContext);
  const resolvedForm = (form as FormInstance | undefined) ?? contextForm;

  if (!resolvedForm) {
    throw new Error(
      `${componentName} requires a form prop or must be rendered inside FormLayout.`
    );
  }

  return resolvedForm;
}
