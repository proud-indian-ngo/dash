import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { useSelector } from "@tanstack/react-form";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import type { FormInstance, FormStateSlice } from "./form-context";
import { FormContextProvider } from "./form-context";

interface FormLayoutProps extends Omit<
  ComponentPropsWithoutRef<"form">,
  "onSubmit"
> {
  children: ReactNode;
  form: FormInstance;
  showSubmitError?: boolean;
  submitError?: string | null;
}

const selectSubmitError = (state: FormStateSlice): unknown =>
  state.errorMap?.onSubmit;

const messageOf = (value: unknown): string | undefined =>
  typeof value === "object" &&
  value !== null &&
  "message" in value &&
  typeof value.message === "string" &&
  value.message
    ? value.message
    : undefined;

/**
 * The submit error to show above the form. A form-level schema error is a map
 * of field path to issues: field issues already show inline, so only issues
 * on the form itself (the empty path) are shown here.
 */
export const getSubmitErrorMessage = (
  submitError: unknown
): string | undefined => {
  if (!submitError) {
    return;
  }

  if (typeof submitError === "string") {
    return submitError;
  }

  if (typeof submitError === "object") {
    if (
      "form" in submitError &&
      typeof submitError.form === "string" &&
      submitError.form
    ) {
      return submitError.form;
    }

    const message = messageOf(submitError);
    if (message) {
      return message;
    }

    const issueMap = Object.values(submitError);
    if (issueMap.length > 0 && issueMap.every(Array.isArray)) {
      const rootIssues: unknown = (submitError as Record<string, unknown>)[""];
      return Array.isArray(rootIssues)
        ? rootIssues.map(messageOf).find(Boolean)
        : undefined;
    }
  }

  return "Something went wrong while submitting the form.";
};

export function FormLayout({
  children,
  className = "space-y-4",
  form,
  showSubmitError = false,
  submitError,
  ...props
}: FormLayoutProps) {
  const formSubmitError = useSelector(form.store, selectSubmitError);
  const submitErrorMessage =
    submitError ??
    (showSubmitError ? getSubmitErrorMessage(formSubmitError) : null);
  const stableOnSubmit0 = useEventCallback(
    (event: { preventDefault: () => void; stopPropagation: () => void }) => {
      event.preventDefault();
      event.stopPropagation();
      form.handleSubmit();
    }
  );

  return (
    <FormContextProvider form={form}>
      <form
        {...props}
        className={cn("min-w-0", className)}
        onSubmit={stableOnSubmit0}
      >
        {submitErrorMessage ? (
          <div
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-none border p-3 text-sm"
            role="alert"
          >
            {submitErrorMessage}
          </div>
        ) : null}
        {children}
      </form>
    </FormContextProvider>
  );
}
