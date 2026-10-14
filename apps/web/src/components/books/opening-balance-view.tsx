import { formatPaise } from "@pi-dash/shared/money";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { TextareaField } from "@/components/form/textarea-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { reverseOpeningBalancesFn } from "@/functions/books";

export interface OpeningViewLine {
  id: string;
  label: string;
  paise: number;
}

export interface OpeningViewSection {
  lines: OpeningViewLine[];
  title: string;
}

/** A posted opening-balance document, read-only. */
export function OpeningBalanceView({
  sections,
}: {
  sections: readonly OpeningViewSection[];
}) {
  return (
    <div className="grid max-w-2xl gap-6" data-testid="opening-view">
      {sections.map((section) => (
        <section aria-label={section.title} key={section.title}>
          <h2 className="mb-2 text-sm font-semibold">{section.title}</h2>
          <ul className="divide-y rounded-lg border">
            {section.lines.length === 0 ? (
              <li className="text-muted-foreground px-3 py-2.5 text-sm">
                None
              </li>
            ) : (
              section.lines.map((line) => (
                <li
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                  key={line.id}
                >
                  <span className="min-w-0 truncate">{line.label}</span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {formatPaise(line.paise)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

const reverseSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Say why the opening balances are reversed")
    .max(500),
});

function ReverseForm({
  id,
  onOpenChange,
}: {
  id: string;
  onOpenChange: (open: boolean) => void;
}) {
  const reverse = useServerFn(reverseOpeningBalancesFn);
  const form = useForm({
    defaultValues: { reason: "" },
    onSubmit: async ({ value }) => {
      try {
        await reverse({ data: { id, reason: value.reason } });
        toast.success("Opening balances reversed");
        onOpenChange(false);
      } catch (error) {
        toast.error("Couldn't reverse the opening balances", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    validators: { onChange: reverseSchema, onSubmit: reverseSchema },
  });
  return (
    <FormLayout form={form}>
      <TextareaField isRequired label="Reason" name="reason" />
      <FormActions
        onCancel={() => onOpenChange(false)}
        submitLabel="Reverse opening balances"
        submittingLabel="Reversing..."
        submitVariant="destructive"
      />
    </FormLayout>
  );
}

/** Reverses the standing opening balances so corrected ones can be posted. */
export function ReverseOpeningDialog({
  id,
  onOpenChange,
  open,
}: {
  id: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [formKey, setFormKey] = useState(0);
  return (
    <Dialog
      onOpenChange={(next) => {
        if (next) {
          setFormKey((k) => k + 1);
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>Reverse opening balances</DialogTitle>
          <DialogDescription>
            Every opening line is reversed in the books; nothing is deleted.
            Then enter the corrected figures the CA confirmed.
          </DialogDescription>
        </DialogHeader>
        <ReverseForm id={id} key={formKey} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}
