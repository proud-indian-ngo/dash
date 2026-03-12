import { BrailleSpinner } from "@pi-dash/design-system/components/braille-spinner";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { cn } from "@pi-dash/design-system/lib/utils";
import type { ComponentPropsWithoutRef } from "react";
import type { FormInstance } from "./form-context";
import { useResolvedForm } from "./form-context";

interface FormActionsProps {
  cancelLabel?: string;
  cancelVariant?: ComponentPropsWithoutRef<typeof Button>["variant"];
  className?: string;
  disableWhenInvalid?: boolean;
  form?: FormInstance;
  onCancel?: () => void;
  submitClassName?: string;
  submitLabel: string;
  submittingLabel?: string;
  submitVariant?: ComponentPropsWithoutRef<typeof Button>["variant"];
}

export function FormActions({
  cancelLabel = "Cancel",
  cancelVariant = "outline",
  className,
  disableWhenInvalid = true,
  form,
  onCancel,
  submitClassName,
  submitLabel,
  submitVariant,
  submittingLabel = "Submitting...",
}: FormActionsProps) {
  const resolvedForm = useResolvedForm(form, "FormActions");

  return (
    <resolvedForm.Subscribe
      selector={(state) => ({
        canSubmit: state.canSubmit,
        isSubmitting: state.isSubmitting,
      })}
    >
      {(state) => {
        const disableSubmit = disableWhenInvalid
          ? !state.canSubmit || state.isSubmitting
          : state.isSubmitting;

        return (
          <div className={cn("flex flex-wrap gap-2", className)}>
            <Button
              className={submitClassName}
              disabled={disableSubmit}
              type="submit"
              variant={submitVariant}
            >
              {state.isSubmitting ? (
                <>
                  <BrailleSpinner variant="inline" />
                  {submittingLabel}
                </>
              ) : (
                submitLabel
              )}
            </Button>
            {onCancel ? (
              <Button onClick={onCancel} type="button" variant={cancelVariant}>
                {cancelLabel}
              </Button>
            ) : null}
          </div>
        );
      }}
    </resolvedForm.Subscribe>
  );
}
