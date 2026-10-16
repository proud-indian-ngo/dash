import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  CloseCheck,
  CloseCheckId,
  YearCloseChecklist,
} from "@pi-dash/db/ledger/year-close";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { cn } from "@pi-dash/design-system/lib/utils";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { TextareaField } from "@/components/form/textarea-field";
import { Loader } from "@/components/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import {
  closeFiscalYearFn,
  getYearCloseChecklist,
  reopenFiscalYearFn,
} from "@/functions/books";

import { formatDay } from "./labels";

const CHECK_LABELS: Record<CloseCheckId, { fail: string; pass: string }> = {
  audited_figures: {
    fail: "Audited figures not matched, or the books changed since",
    pass: "Audited figures matched or skipped",
  },
  bank_statements: {
    fail: "Bank statements don't reach the year end",
    pass: "Bank statements imported to the year end",
  },
  clearing_balances: {
    fail: "Clearing balances at year end",
    pass: "Clearing balances at year end",
  },
  opening_balances: {
    fail: "Opening balances not posted",
    pass: "Opening balances posted",
  },
  previous_year_closed: {
    fail: "The previous year isn't closed",
    pass: "The previous year is closed",
  },
  unposted_sources: {
    fail: "Records waiting to post",
    pass: "Nothing waiting to post",
  },
  year_ended: {
    fail: "The year hasn't ended yet",
    pass: "The year has ended",
  },
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

function checkIcon(check: CloseCheck) {
  // The clearing balances are shown for the treasurer to judge, not graded.
  if (check.id === "clearing_balances") {
    return { className: "text-muted-foreground", icon: InformationCircleIcon };
  }
  return check.ok
    ? { className: "text-success-foreground", icon: CheckmarkCircle02Icon }
    : { className: "text-warning-foreground", icon: Alert02Icon };
}

function CheckRow({ check }: { check: CloseCheck }) {
  const label = CHECK_LABELS[check.id];
  const icon = checkIcon(check);
  return (
    <li
      className="flex gap-3 px-3 py-2.5 text-sm"
      data-ok={check.ok}
      data-testid={`close-check-${check.id}`}
    >
      <HugeiconsIcon
        className={cn("mt-0.5 size-4 shrink-0", icon.className)}
        icon={icon.icon}
        strokeWidth={2}
      />
      <span className="min-w-0">
        <span className="block">
          {check.ok ? label.pass : label.fail}
          {check.required && !check.ok ? (
            <span className="text-muted-foreground"> · required</span>
          ) : null}
        </span>
        {check.details.map((detail) => (
          <span className="text-muted-foreground block" key={detail}>
            {detail}
          </span>
        ))}
      </span>
    </li>
  );
}

/** The year-close checklist, then the close itself. */
export function CloseYearDialog({
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
  const load = useServerFn(getYearCloseChecklist);
  const close = useServerFn(closeFiscalYearFn);
  const [checklist, setChecklist] = useState<YearCloseChecklist | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!open) {
      setChecklist(null);
      return;
    }
    let cancelled = false;
    load({ data: { fiscalYearId } })
      .then((result) => {
        if (!cancelled) {
          setChecklist(result);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "books.closeChecklist",
          caughtError: errorMessage(error),
          component: "CloseYearDialog",
        });
        toast.error("Couldn't load the checklist", {
          description: errorMessage(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, fiscalYearId, load]);

  const confirm = async () => {
    setClosing(true);
    try {
      await close({ data: { fiscalYearId } });
      toast.success(`${label} closed`);
      onOpenChange(false);
    } catch (error) {
      toast.error("Couldn't close the year", {
        description: errorMessage(error),
      });
    } finally {
      setClosing(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>Close {label}</DialogTitle>
          <DialogDescription>
            Once closed, nothing more posts into the year
            {checklist ? ` (to ${formatDay(checklist.endsOn)})` : ""} until it
            is reopened with a reason.
          </DialogDescription>
        </DialogHeader>
        {checklist ? (
          <ul
            className="divide-y rounded-lg border"
            data-testid="close-checklist"
          >
            {checklist.checks.map((check) => (
              <CheckRow check={check} key={check.id} />
            ))}
          </ul>
        ) : (
          <div className="flex justify-center py-6">
            <Loader />
          </div>
        )}
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={!checklist?.canClose || closing}
            onClick={confirm}
            type="button"
          >
            Close {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const reopenSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Say why the year is being reopened")
    .max(500),
});

function ReopenForm({
  fiscalYearId,
  label,
  onOpenChange,
}: {
  fiscalYearId: string;
  label: string;
  onOpenChange: (open: boolean) => void;
}) {
  const reopen = useServerFn(reopenFiscalYearFn);
  const form = useForm({
    defaultValues: { reason: "" },
    onSubmit: async ({ value }) => {
      try {
        await reopen({ data: { fiscalYearId, reason: value.reason } });
        toast.success(`${label} reopened`);
        onOpenChange(false);
      } catch (error) {
        toast.error("Couldn't reopen the year", {
          description: errorMessage(error),
        });
      }
    },
    validators: { onChange: reopenSchema, onSubmit: reopenSchema },
  });
  return (
    <FormLayout form={form}>
      <TextareaField isRequired label="Reason" name="reason" />
      <FormActions
        onCancel={() => onOpenChange(false)}
        submitLabel={`Reopen ${label}`}
        submittingLabel="Reopening..."
      />
    </FormLayout>
  );
}

/** Reopens a closed year; the reason is kept with the year's history. */
export function ReopenYearDialog({
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
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(next);
  };
  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>Reopen {label}</DialogTitle>
          <DialogDescription>
            Postings into the year are allowed again until it is closed. The
            reason is kept in the year's history.
          </DialogDescription>
        </DialogHeader>
        <ReopenForm
          fiscalYearId={fiscalYearId}
          key={formKey}
          label={label}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}
