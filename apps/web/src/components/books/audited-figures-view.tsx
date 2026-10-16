import {
  AUDITED_REASON_MAX,
  AUDITED_REASON_MIN,
} from "@pi-dash/shared/audited-figures";
import { formatPaise } from "@pi-dash/shared/money";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
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
import { StatusBadge } from "@/components/shared/status-badge";
import {
  reverseAuditedFiguresFn,
  skipAuditedFiguresFn,
} from "@/functions/books";

export interface AuditedViewLine {
  /** The difference posted (audited less the books before). */
  adjustmentPaise: number;
  auditedPaise: number;
  booksPaise: number;
  /** What the head the difference posted against is called. */
  counterHeadName: string | null;
  key: string;
  label: string;
  /** pi-dash's closing for the line today; differs when something posted since. */
  nowPaise: number;
}

export interface AuditedViewSection {
  lines: AuditedViewLine[];
  title: string;
}

export interface AuditedViewTransfer {
  amountPaise: number;
  from: string;
  id: string;
  reason: string;
  to: string;
}

const signed = (paise: number) =>
  `${paise > 0 ? "+" : ""}${formatPaise(paise)}`;

const COLUMNS =
  "grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem_8rem]";

/** A matched year's audited figures, read-only, with the books as they stand now. */
export function AuditedFiguresView({
  sections,
  transfers,
}: {
  sections: readonly AuditedViewSection[];
  transfers: readonly AuditedViewTransfer[];
}) {
  const drifted = sections.some((s) =>
    s.lines.some((l) => l.nowPaise !== l.auditedPaise)
  );
  return (
    <div className="grid max-w-4xl gap-6" data-testid="audited-view">
      {drifted ? (
        <p
          className="text-warning-foreground rounded-lg border px-3 py-2.5 text-sm"
          data-testid="audited-drift"
        >
          Something has posted into the year since its audited figures were
          matched, so some closings no longer equal them. Find what posted, or
          reverse these figures and match them again.
        </p>
      ) : null}
      {sections.map((section) => (
        <section aria-label={section.title} key={section.title}>
          <h2 className="mb-2 text-sm font-semibold">{section.title}</h2>
          <div className="rounded-lg border">
            <div
              aria-hidden="true"
              className={`${COLUMNS} text-muted-foreground hidden border-b px-3 py-2 text-xs sm:grid`}
            >
              <span>Line</span>
              <span className="text-right">Books before</span>
              <span className="text-right">Audited</span>
              <span className="text-right">Adjustment</span>
              <span className="text-right">In the books now</span>
            </div>
            {section.lines.length === 0 ? (
              <p className="text-muted-foreground px-3 py-2.5 text-sm">None</p>
            ) : (
              <ul className="divide-y">
                {section.lines.map((line) => (
                  <li
                    className={`${COLUMNS} px-3 py-2.5 text-sm`}
                    data-key={line.key}
                    data-testid="audited-view-line"
                    key={line.key}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{line.label}</span>
                      {line.adjustmentPaise !== 0 && line.counterHeadName ? (
                        <span className="text-muted-foreground block text-xs">
                          Posted against {line.counterHeadName}
                        </span>
                      ) : null}
                    </span>
                    <span className="font-mono tabular-nums sm:text-right">
                      {formatPaise(line.booksPaise)}
                    </span>
                    <span className="font-mono tabular-nums sm:text-right">
                      {formatPaise(line.auditedPaise)}
                    </span>
                    <span className="font-mono tabular-nums sm:text-right">
                      {line.adjustmentPaise === 0
                        ? "—"
                        : signed(line.adjustmentPaise)}
                    </span>
                    <span className="sm:text-right">
                      <span className="font-mono tabular-nums">
                        {formatPaise(line.nowPaise)}
                      </span>
                      {line.nowPaise === line.auditedPaise ? null : (
                        <StatusBadge className="ml-1" tone="warning">
                          Changed since
                        </StatusBadge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ))}
      {transfers.length > 0 ? (
        <section aria-label="Transfers between funds">
          <h2 className="mb-2 text-sm font-semibold">
            Transfers between funds
          </h2>
          <ul className="divide-y rounded-lg border">
            {transfers.map((t) => (
              <li className="grid gap-1 px-3 py-2.5 text-sm" key={t.id}>
                <span className="flex justify-between gap-3">
                  <span>
                    {t.from} → {t.to}
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatPaise(t.amountPaise)}
                  </span>
                </span>
                <span className="text-muted-foreground">{t.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

const reasonSchema = (message: string) =>
  z.object({
    reason: z
      .string()
      .trim()
      .min(AUDITED_REASON_MIN, message)
      .max(AUDITED_REASON_MAX),
  });

const reverseSchema = reasonSchema("Say why the audited figures are reversed");
const skipSchema = reasonSchema("Say why this year's figures are skipped");

function ReasonForm({
  onOpenChange,
  onSubmit,
  schema,
  submitLabel,
  submittingLabel,
  destructive,
}: {
  destructive?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => Promise<boolean>;
  schema: typeof reverseSchema;
  submitLabel: string;
  submittingLabel: string;
}) {
  const form = useForm({
    defaultValues: { reason: "" },
    onSubmit: async ({ value }) => {
      if (await onSubmit(value.reason)) {
        onOpenChange(false);
      }
    },
    validators: { onChange: schema, onSubmit: schema },
  });
  return (
    <FormLayout form={form}>
      <TextareaField isRequired label="Reason" name="reason" />
      <FormActions
        onCancel={() => onOpenChange(false)}
        submitLabel={submitLabel}
        submittingLabel={submittingLabel}
        submitVariant={destructive ? "destructive" : undefined}
      />
    </FormLayout>
  );
}

function useFormKey(onOpenChange: (open: boolean) => void) {
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(next);
  };
  return { formKey, handleOpenChange };
}

/** Reverses the standing audited figures (their posting too) so corrected ones can be entered. */
export function ReverseAuditedDialog({
  id,
  onOpenChange,
  open,
}: {
  id: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const reverse = useServerFn(reverseAuditedFiguresFn);
  const { formKey, handleOpenChange } = useFormKey(onOpenChange);
  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>Reverse audited figures</DialogTitle>
          <DialogDescription>
            Every year-end adjustment is reversed in the books; nothing is
            deleted. Then enter the corrected figures from the signed
            statements.
          </DialogDescription>
        </DialogHeader>
        <ReasonForm
          destructive
          key={formKey}
          onOpenChange={onOpenChange}
          onSubmit={async (reason) => {
            try {
              await reverse({ data: { id, reason } });
              toast.success("Audited figures reversed");
              return true;
            } catch (error) {
              toast.error("Couldn't reverse the audited figures", {
                description: error instanceof Error ? error.message : undefined,
              });
              return false;
            }
          }}
          schema={reverseSchema}
          submitLabel="Reverse audited figures"
          submittingLabel="Reversing..."
        />
      </DialogContent>
    </Dialog>
  );
}

/** Marks a year's audited figures as skipped, with the reason, for the year-close checklist. */
export function SkipAuditedDialog({
  fiscalYearId,
  label,
  onOpenChange,
  open,
}: {
  fiscalYearId: string;
  label: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const skip = useServerFn(skipAuditedFiguresFn);
  const { formKey, handleOpenChange } = useFormKey(onOpenChange);
  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>Skip FY {label}'s audited figures</DialogTitle>
          <DialogDescription>
            Nothing posts. The year-close checklist shows the reason instead of
            a missing step; reverse the skip to match the figures later.
          </DialogDescription>
        </DialogHeader>
        <ReasonForm
          key={formKey}
          onOpenChange={onOpenChange}
          onSubmit={async (reason) => {
            try {
              await skip({ data: { fiscalYearId, id: uuidv7(), reason } });
              toast.success("Audited figures skipped");
              return true;
            } catch (error) {
              toast.error("Couldn't skip the audited figures", {
                description: error instanceof Error ? error.message : undefined,
              });
              return false;
            }
          }}
          schema={skipSchema}
          submitLabel="Skip audited figures"
          submittingLabel="Saving..."
        />
      </DialogContent>
    </Dialog>
  );
}
