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
      isBlurred: boolean;
      isTouched: boolean;
    };
    value: TValue;
  };
}

export interface FormWithHandleSubmit {
  handleSubmit: () => void;
}

export interface FormWithField {
  // biome-ignore lint/suspicious/noExplicitAny: uses `any` so concrete ReactFormExtendedApi<T> types remain assignable to FormInstance — TanStack Form's deep generics (validators, field API, form listeners) create contravariance chains that prevent structural compatibility with narrower types
  Field: (...args: any[]) => any;
}

export interface FormWithState {
  state: {
    errorMap?: { onSubmit?: unknown };
    submissionAttempts: number;
  };
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
  FormWithSubscribe &
  FormWithState;

const FormContext = createContext<FormInstance | undefined>(undefined);

interface FormContextProviderProps {
  children: ReactNode;
  form: FormInstance;
}

export function FormContextProvider({
  children,
  form,
}: FormContextProviderProps) {
  return <FormContext.Provider value={form}>{children}</FormContext.Provider>;
}

export function getFieldErrorState(field: FormFieldApi, submitted = false) {
  const showErrors = field.state.meta.isBlurred || submitted;
  const hasError = showErrors && field.state.meta.errors.length > 0;
  const errorMessageId = `${field.name}-error`;
  return { hasError, errorMessageId };
}

export function fieldErrorProps(field: FormFieldApi, submitted = false) {
  const { hasError, errorMessageId } = getFieldErrorState(field, submitted);
  return {
    "aria-describedby": hasError ? errorMessageId : undefined,
    "aria-invalid": hasError,
  } as const;
}

export function useResolvedForm(
  form: FormInstance | undefined,
  componentName: string
): FormInstance {
  const contextForm = useContext(FormContext);
  const resolvedForm = form ?? contextForm;

  if (!resolvedForm) {
    throw new Error(
      `${componentName} requires a form prop or must be rendered inside FormLayout.`
    );
  }

  return resolvedForm;
}
