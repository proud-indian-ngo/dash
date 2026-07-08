import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { FormInstance } from "./form-context";
import { FormContextProvider } from "./form-context";

interface FormLayoutProps
  extends Omit<ComponentPropsWithoutRef<"form">, "onSubmit"> {
  children: ReactNode;
  form: FormInstance;
  showSubmitError?: boolean;
}

const getSubmitErrorMessage = (form: FormInstance): string | undefined => {
  const submitError = form.state.errorMap?.onSubmit;

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

    if (
      "message" in submitError &&
      typeof submitError.message === "string" &&
      submitError.message
    ) {
      return submitError.message;
    }
  }

  return "Something went wrong while submitting the form.";
};

export function FormLayout({
  children,
  className = "space-y-4",
  form,
  showSubmitError = false,
  ...props
}: FormLayoutProps) {
  const submitErrorMessage = showSubmitError
    ? getSubmitErrorMessage(form)
    : null;
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
            className="rounded-none border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm"
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
