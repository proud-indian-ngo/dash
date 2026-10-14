import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type StatementLineIgnoreReason,
  statementLineIgnoreReasonValues,
} from "@pi-dash/shared/constants";
import { formatPaise } from "@pi-dash/shared/money";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import z from "zod";

import { ComboboxField } from "@/components/form/combobox-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { getStatementLinkCandidates } from "@/functions/bank-statements";
import {
  IGNORE_REASON_LABELS,
  settlementProviderLabel,
} from "@/lib/bank-statement/labels";
import type { LinkCandidatesResponse } from "@/lib/bank-statement/types";
import { DATE } from "@/lib/date-formats";

export const formatIsoDate = (iso: string) =>
  format(new Date(`${iso}T00:00:00`), DATE);

const ignoreOptions = statementLineIgnoreReasonValues.map((value) => ({
  label: IGNORE_REASON_LABELS[value],
  value,
}));

const ignoreSchema = z
  .object({
    note: z.string().trim().max(200),
    reason: z.enum(statementLineIgnoreReasonValues),
  })
  .refine((value) => value.reason !== "other" || value.note.length > 0, {
    message: "Say why",
    path: ["note"],
  });

function IgnoreForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (reason: StatementLineIgnoreReason, note: string) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: {
      note: "",
      reason: "not_ours",
    } as z.input<typeof ignoreSchema>,
    onSubmit: async ({ value }) => {
      await onSubmit(value.reason, value.note);
    },
    validators: { onChange: ignoreSchema, onSubmit: ignoreSchema },
  });
  return (
    <FormLayout form={form}>
      <SelectField
        isRequired
        label="Reason"
        name="reason"
        options={ignoreOptions}
      />
      <form.Subscribe selector={(state) => state.values.reason}>
        {(reason) =>
          reason === "bank_interest" ? (
            <p className="text-muted-foreground text-sm">
              Interest is income, not a donation: record it under Income → Other
              income as well, so it is counted.
            </p>
          ) : null
        }
      </form.Subscribe>
      <form.Subscribe selector={(state) => state.values.reason}>
        {(reason) => (
          <InputField
            isRequired={reason === "other"}
            label="Note"
            name="note"
          />
        )}
      </form.Subscribe>
      <FormActions
        disableWhenInvalid={false}
        onCancel={onCancel}
        submitLabel="Ignore line"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

/** Sets a line aside with a reason; it can be put back with Unmatch. */
export function IgnoreLineDialog({
  onOpenChange,
  onSubmit,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: StatementLineIgnoreReason, note: string) => Promise<void>;
  open: boolean;
}) {
  const cancel = useEventCallback(() => onOpenChange(false));
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>Ignore this line?</DialogTitle>
          <DialogDescription>
            An ignored line needs no match. Unmatch it to bring it back.
          </DialogDescription>
        </DialogHeader>
        {open ? <IgnoreForm onCancel={cancel} onSubmit={onSubmit} /> : null}
      </DialogContent>
    </Dialog>
  );
}

const noteSchema = z.object({ note: z.string().trim().max(200) });

function NoteForm({
  initial,
  onCancel,
  onSubmit,
  submitLabel,
}: {
  initial: string;
  onCancel: () => void;
  onSubmit: (note: string) => Promise<void>;
  submitLabel: string;
}) {
  const form = useForm({
    defaultValues: { note: initial },
    onSubmit: async ({ value }) => {
      await onSubmit(value.note);
    },
    validators: { onChange: noteSchema, onSubmit: noteSchema },
  });
  return (
    <FormLayout form={form}>
      <InputField label="Note" name="note" />
      <FormActions
        disableWhenInvalid={false}
        onCancel={onCancel}
        submitLabel={submitLabel}
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

/** A short note on a line; also used to mark a transfer between own accounts. */
export function LineNoteDialog({
  description,
  initial,
  onOpenChange,
  onSubmit,
  open,
  submitLabel,
  title,
}: {
  description: string;
  initial: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (note: string) => Promise<void>;
  open: boolean;
  submitLabel: string;
  title: string;
}) {
  const cancel = useEventCallback(() => onOpenChange(false));
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-sm)">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open ? (
          <NoteForm
            initial={initial}
            onCancel={cancel}
            onSubmit={onSubmit}
            submitLabel={submitLabel}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const linkSchema = z.object({
  target: z
    .string()
    .optional()
    .refine((value) => Boolean(value), "Pick a settlement or contribution"),
});

function linkOptions(candidates: LinkCandidatesResponse) {
  return [
    ...candidates.settlements.map((s) => ({
      label: `${settlementProviderLabel(s.provider)} settlement · ${formatIsoDate(s.settledOn)} · ${formatPaise(s.amountPaise)}${s.utr ? ` · UTR ${s.utr}` : ""}`,
      value: `settlement:${s.id}`,
    })),
    ...candidates.contributions.map((c) => ({
      label: `${c.donorName} · ${formatIsoDate(c.receivedOn)} · ${formatPaise(c.amountPaise)}${c.reference ? ` · ${c.reference}` : ""}`,
      value: `contribution:${c.id}`,
    })),
  ];
}

function LinkForm({
  lineId,
  onCancel,
  onSubmit,
}: {
  lineId: string;
  onCancel: () => void;
  onSubmit: (
    kind: "contribution" | "settlement",
    targetId: string
  ) => Promise<void>;
}) {
  const load = useServerFn(getStatementLinkCandidates);
  const [candidates, setCandidates] = useState<LinkCandidatesResponse | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    load({ data: { lineId } })
      .then((result) => {
        if (!cancelled) {
          setCandidates(result);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Candidates couldn't be loaded."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [lineId, load]);
  const form = useForm({
    defaultValues: { target: undefined } as z.input<typeof linkSchema>,
    onSubmit: async ({ value }) => {
      const [kind, targetId] = (value.target ?? "").split(":");
      if ((kind === "settlement" || kind === "contribution") && targetId) {
        await onSubmit(kind, targetId);
      }
    },
    validators: { onSubmit: linkSchema },
  });
  return (
    <FormLayout form={form}>
      <ComboboxField
        description="Unmatched gateway settlements, and donations recorded as deposited into this account. The amount must equal the line's."
        emptyMessage={candidates ? "Nothing unmatched to link." : "Loading..."}
        isRequired
        label="Settlement or donation"
        name="target"
        options={candidates ? linkOptions(candidates) : []}
        placeholder="Search by donor, date, amount or UTR..."
      />
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <FormActions
        disableWhenInvalid={false}
        onCancel={onCancel}
        submitLabel="Link line"
        submittingLabel="Linking..."
      />
    </FormLayout>
  );
}

/** "Link to…": pick the settlement or recorded donation a credit is. */
export function LinkLineDialog({
  lineId,
  onOpenChange,
  onSubmit,
}: {
  lineId: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    kind: "contribution" | "settlement",
    targetId: string
  ) => Promise<void>;
}) {
  const cancel = useEventCallback(() => onOpenChange(false));
  return (
    <Dialog onOpenChange={onOpenChange} open={lineId !== null}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>Link to a settlement or donation</DialogTitle>
          <DialogDescription>
            The line is matched to what you pick. Unmatch it to undo.
          </DialogDescription>
        </DialogHeader>
        {lineId ? (
          <LinkForm
            key={lineId}
            lineId={lineId}
            onCancel={cancel}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
