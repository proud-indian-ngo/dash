import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@pi-dash/design-system/components/ui/toggle-group";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { parsePreArnList } from "@pi-dash/shared/donations-return";
import { formatPaise } from "@pi-dash/shared/money";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { parseISO } from "date-fns";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shared/responsive-alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import {
  discardDonationFiling,
  emailDonationCertificates,
  recordDonationFiling,
  submitDonationFiling,
} from "@/functions/donation-filings";
import { localDateToIso } from "@/lib/local-date";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

function saveCsv(csv: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Freezes the ready gifts into the year's next filing and downloads its
 * upload file, the only way to get one, so every uploaded row is tracked.
 */
export function RecordFilingDialog({
  financialYear,
  onOpenChange,
  onRecorded,
  open,
  readyPaise,
  rowCount,
}: {
  financialYear: string;
  onOpenChange: (open: boolean) => void;
  onRecorded: (filingId: string) => void;
  open: boolean;
  readyPaise: number;
  rowCount: number;
}) {
  const record = useServerFn(recordDonationFiling);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"none" | "portal">("none");
  const [pasted, setPasted] = useState("");
  const parsed = parsePreArnList(pasted);
  const preArnsReady =
    mode === "none" ||
    (parsed.invalid.length === 0 && parsed.values.length >= rowCount);
  const handleRecord = useEventCallback(async () => {
    setBusy(true);
    await record({
      data: {
        financialYear,
        preArns: mode === "portal" ? parsed.values : null,
      },
    })
      .then((result) => {
        saveCsv(result.file.csv, result.file.filename);
        toast.success(`Filing ${result.sequence} recorded`, {
          description:
            "Upload the downloaded file on the portal, then record its acknowledgement here.",
        });
        onOpenChange(false);
        onRecorded(result.filingId);
      })
      .catch((error: unknown) => {
        log.error({
          action: "donationFiling.record",
          component: "RecordFilingDialog",
          error: "Recording the filing failed",
        });
        toast.error("Couldn't record the filing", {
          description: errorMessage(error),
        });
      })
      .finally(() => setBusy(false));
  });
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Record a filing for FY {financialYear}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {rowCount} {rowCount === 1 ? "row" : "rows"} totalling{" "}
            {formatPaise(readyPaise)} are frozen as they are now and downloaded
            as the upload file. Later changes to these gifts or donors won't
            change the filing. Check the file against the portal's Form 113
            template before uploading it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label>Pre-Acknowledgement Numbers</Label>
          <ToggleGroup
            aria-label="Pre-Acknowledgement Numbers"
            className="w-full"
            onValueChange={(next) => {
              const picked = next[0];
              if (picked === "none" || picked === "portal") {
                setMode(picked);
              }
            }}
            size="sm"
            value={[mode]}
            variant="outline"
          >
            <ToggleGroupItem className="flex-1" value="none">
              None
            </ToggleGroupItem>
            <ToggleGroupItem className="flex-1" value="portal">
              From the portal
            </ToggleGroupItem>
          </ToggleGroup>
          {mode === "none" ? (
            <p className="text-muted-foreground text-sm">
              The column is left empty. Certificates are then matched by the
              donor's ID number, amount and name, and you confirm each one.
            </p>
          ) : (
            <>
              <Textarea
                aria-label="Portal Pre-ARNs"
                className="max-h-40 min-h-24 font-mono"
                onChange={(event) => setPasted(event.target.value)}
                placeholder="Paste the Pre-ARNs the portal generated, one per line"
                value={pasted}
              />
              <p
                className={
                  preArnsReady
                    ? "text-muted-foreground text-sm"
                    : "text-destructive text-sm"
                }
              >
                {parsed.invalid.length > 0
                  ? `Not a Pre-ARN (letters and digits, at most 21): ${parsed.invalid.slice(0, 3).join(", ")}`
                  : `${parsed.values.length} pasted for ${rowCount} ${rowCount === 1 ? "row" : "rows"}, given out in Sr. No. order. Any already used in a filing are skipped.`}
              </p>
            </>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || !preArnsReady}
            onClick={handleRecord}
          >
            {busy ? "Recording..." : "Record filing"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const reference = z
  .string()
  .trim()
  .min(1, "Required")
  .max(40)
  .regex(/^[A-Za-z0-9]+$/, "Letters and digits only");

const submissionSchema = z.object({
  acknowledgementNumber: reference,
  filedOn: z.date({ error: "Pick the day the portal accepted it" }),
  transactionId: reference,
});

export interface SubmissionDefaults {
  acknowledgementNumber: string | null;
  filedOn: string | null;
  transactionId: string | null;
}

function SubmissionForm({
  defaults,
  filingId,
  onOpenChange,
  onSaved,
}: {
  defaults: SubmissionDefaults;
  filingId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const submit = useServerFn(submitDonationFiling);
  const form = useForm({
    defaultValues: {
      acknowledgementNumber: defaults.acknowledgementNumber ?? "",
      filedOn: defaults.filedOn
        ? parseISO(defaults.filedOn)
        : (undefined as Date | undefined),
      transactionId: defaults.transactionId ?? "",
    },
    onSubmit: async ({ value }) => {
      const filedOn = localDateToIso(value.filedOn);
      if (!filedOn) {
        return;
      }
      await submit({
        data: {
          acknowledgementNumber: value.acknowledgementNumber,
          filedOn,
          filingId,
          transactionId: value.transactionId,
        },
      })
        .then(() => {
          toast.success("Submission recorded");
          onOpenChange(false);
          onSaved();
        })
        .catch((error: unknown) => {
          toast.error("Couldn't save the submission", {
            description: errorMessage(error),
          });
        });
    },
    validators: { onChange: submissionSchema, onSubmit: submissionSchema },
  });
  return (
    <FormLayout form={form}>
      <DateField
        isRequired
        label="Filed on"
        maxDate={new Date()}
        name="filedOn"
      />
      <InputField
        description="From the portal's success screen or acknowledgement."
        isRequired
        label="Acknowledgement number"
        name="acknowledgementNumber"
      />
      <InputField isRequired label="Transaction ID" name="transactionId" />
      <FormActions
        onCancel={() => onOpenChange(false)}
        submitLabel="Save submission"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

/** What the portal gave back for the upload; correctable later. */
export function SubmitFilingDialog({
  defaults,
  filing,
  onOpenChange,
  onSaved,
}: {
  defaults: SubmissionDefaults;
  filing: { id: string; sequence: number } | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={filing !== null}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>
            Record submission of filing {filing?.sequence}
          </DialogTitle>
          <DialogDescription>
            After uploading the file on the portal, enter what it gave back.
            Certificates can be added once this is saved.
          </DialogDescription>
        </DialogHeader>
        {filing ? (
          <SubmissionForm
            defaults={defaults}
            filingId={filing.id}
            key={filing.id}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Discards a filing never uploaded: its gifts go back to ready. */
export function DiscardFilingDialog({
  filing,
  onDiscarded,
  onOpenChange,
}: {
  filing: { id: string; sequence: number } | null;
  onDiscarded: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const discard = useServerFn(discardDonationFiling);
  const [busy, setBusy] = useState(false);
  const handleDiscard = useEventCallback(async () => {
    if (!filing) {
      return;
    }
    setBusy(true);
    await discard({ data: { filingId: filing.id } })
      .then(() => {
        toast.success(`Filing ${filing.sequence} discarded`);
        onOpenChange(false);
        onDiscarded();
      })
      .catch((error: unknown) => {
        toast.error("Couldn't discard the filing", {
          description: errorMessage(error),
        });
      })
      .finally(() => setBusy(false));
  });
  return (
    <AlertDialog onOpenChange={onOpenChange} open={filing !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Discard filing {filing?.sequence}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Only for a file that was never uploaded to the portal. Its gifts go
            back to ready for the next filing; its number and Pre-ARNs are not
            reused.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={handleDiscard}
            variant="destructive"
          >
            {busy ? "Discarding..." : "Discard filing"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Queues the certificates for email, or resends the chosen ones. Donors
 * without a usable address are listed for sending by hand.
 */
export function EmailCertificatesDialog({
  manualNames,
  onOpenChange,
  onQueued,
  request,
}: {
  manualNames: readonly string[];
  onOpenChange: (open: boolean) => void;
  onQueued: () => void;
  request: {
    certificateIds?: string[];
    count: number;
    filingId: string;
  } | null;
}) {
  const email = useServerFn(emailDonationCertificates);
  const [busy, setBusy] = useState(false);
  const resend = request?.certificateIds !== undefined;
  const handleSend = useEventCallback(async () => {
    if (!request) {
      return;
    }
    setBusy(true);
    await email({
      data: {
        certificateIds: request.certificateIds,
        filingId: request.filingId,
      },
    })
      .then((result) => {
        const skipped = result.noEmail.length + result.suppressed.length;
        toast.success(
          `${result.queued} ${result.queued === 1 ? "certificate" : "certificates"} queued for email`,
          skipped > 0
            ? {
                description: `${skipped} without a usable email address; send those by hand.`,
              }
            : undefined
        );
        onOpenChange(false);
        onQueued();
      })
      .catch((error: unknown) => {
        toast.error("Couldn't queue the emails", {
          description: errorMessage(error),
        });
      })
      .finally(() => setBusy(false));
  });
  const count = request?.count ?? 0;
  return (
    <AlertDialog onOpenChange={onOpenChange} open={request !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {resend
              ? "Resend this certificate?"
              : `Email ${count} ${count === 1 ? "certificate" : "certificates"}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {resend
              ? "The donor gets the certificate again, at their current email address."
              : "Each donor gets their certificate PDF at their current email address, once. Check the matched rows first."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!resend && manualNames.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            Not emailed, send by hand: {manualNames.join(", ")}.
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || count === 0}
            onClick={handleSend}
          >
            {busy
              ? "Queueing..."
              : resend
                ? "Resend certificate"
                : "Email certificates"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
