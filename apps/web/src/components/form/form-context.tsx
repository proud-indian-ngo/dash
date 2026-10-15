import type {
  FieldAsyncValidateOrFn,
  FieldValidateOrFn,
  FieldValidators,
} from "@tanstack/react-form";
import type { ReactNode } from "react";
import { createContext, use } from "react";

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
      /** The value has changed since the form started. */
      isDirty?: boolean;
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
  // biome-ignore lint/suspicious/noExplicitAny: same rationale — concrete form types have narrower signatures
  getFieldValue: (...args: any[]) => any;
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
  return <FormContext value={form}>{children}</FormContext>;
}

export function shouldShowFieldErrors(
  meta: { isBlurred: boolean },
  submitted: boolean
) {
  return submitted || meta.isBlurred;
}

/** Controls that close a form: dialog, sheet and drawer close buttons, Cancel. */
const DISMISS_TARGET =
  '[data-slot="dialog-close"], [data-slot="sheet-close"], [data-slot="drawer-close"], [data-form-dismiss]';

/** Focus is leaving for a control that closes the form, or for nothing. */
export function isDismissBlur(next: EventTarget | null): boolean {
  const element = next as Partial<Pick<Element, "closest">> | null;
  if (typeof element?.closest !== "function") {
    return true;
  }
  return element.closest(DISMISS_TARGET) !== null;
}

/**
 * Blurs a field, except when an untouched field loses focus because the form
 * is being closed (Cancel, the close button, a click outside). Validating then
 * flashes an error and shifts the layout under the pointer mid-click. Moving
 * to Submit or another field still validates, so a disabled Submit always
 * comes with the error that explains it.
 */
export function blurField(
  field: {
    handleBlur: () => void;
    state: { meta: { isDirty?: boolean } };
  },
  event?: { relatedTarget: EventTarget | null }
) {
  if (
    event &&
    !field.state.meta.isDirty &&
    isDismissBlur(event.relatedTarget)
  ) {
    return;
  }
  field.handleBlur();
}

export function getFieldErrorState(field: FormFieldApi, submitted = false) {
  const showErrors = shouldShowFieldErrors(field.state.meta, submitted);
  const hasError = showErrors && field.state.meta.errors.length > 0;
  const errorMessageId = `${field.name}-error`;
  return { errorMessageId, hasError };
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
  const contextForm = use(FormContext);
  const resolvedForm = form ?? contextForm;

  if (!resolvedForm) {
    throw new Error(
      `${componentName} requires a form prop or must be rendered inside FormLayout.`
    );
  }

  return resolvedForm;
}
