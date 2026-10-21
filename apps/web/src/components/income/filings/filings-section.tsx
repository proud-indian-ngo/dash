import type { FilingSummary } from "@pi-dash/db/queries/donation-filings";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { formatPaise } from "@pi-dash/shared/money";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/shared/status-badge";
import {
  reviewDonationCertificate,
  undoDonationFilingSubmission,
} from "@/functions/donation-filings";
import { DATE } from "@/lib/date-formats";

import {
  DiscardFilingDialog,
  EmailCertificatesDialog,
  SubmitFilingDialog,
} from "./filing-dialogs";
import { FILING_STATUS } from "./filing-labels";
import { FilingSheet, type FilingSheetActions } from "./filing-sheet";
import {
  AssignCertificateDialog,
  UploadCertificatesDialog,
} from "./upload-certificates-dialog";

function filingFacts(filing: FilingSummary): string {
  const facts = [
    `${filing.rowCount} ${filing.rowCount === 1 ? "row" : "rows"}`,
    formatPaise(filing.totalPaise),
  ];
  if (filing.status === "submitted") {
    if (filing.filedOn) {
      facts.push(`filed ${format(parseISO(filing.filedOn), DATE)}`);
    }
    facts.push(
      `${filing.certificateCount} of ${filing.rowCount} certificates`,
      `${filing.emailedCount} emailed`
    );
  } else {
    facts.push(`recorded ${format(filing.createdAt, DATE)}`);
  }
  if (filing.driftCount > 0) {
    facts.push(
      `${filing.driftCount} ${filing.driftCount === 1 ? "row needs" : "rows need"} a portal revision`
    );
  }
  return facts.join(" · ");
}

/**
 * The year's filings on the donations return page, each opening a sheet
 * with its rows and certificates. Owns the filing dialogs; `onChanged`
 * reloads the page's assessment after any change.
 */
export function FilingsSection({
  canManage,
  canViewSensitive,
  filings,
  onChanged,
  openFilingId,
  setOpenFilingId,
}: {
  canManage: boolean;
  canViewSensitive: boolean;
  filings: readonly FilingSummary[];
  onChanged: () => void;
  openFilingId: string | null;
  setOpenFilingId: (id: string | null) => void;
}) {
  const [version, setVersion] = useState(0);
  const [submitting, setSubmitting] = useState<FilingSummary | null>(null);
  const [discarding, setDiscarding] = useState<FilingSummary | null>(null);
  const [uploading, setUploading] = useState<{
    filing: FilingSummary;
    rowNames: Map<string, string>;
  } | null>(null);
  const [emailing, setEmailing] = useState<
    Parameters<FilingSheetActions["onEmail"]>[0] | null
  >(null);
  const refresh = () => {
    setVersion((n) => n + 1);
    onChanged();
  };
  const openFiling =
    filings.find((filing) => filing.id === openFilingId) ?? null;
  const review = useServerFn(reviewDonationCertificate);
  const undo = useServerFn(undoDonationFilingSubmission);
  const handleReview = useEventCallback(
    async (certificateId: string, decision: "confirm" | "reject") => {
      await review({ data: { certificateId, decision } })
        .then(() => {
          toast.success(
            decision === "confirm"
              ? "Certificate confirmed"
              : "Certificate removed from the row"
          );
          refresh();
        })
        .catch((error: unknown) => {
          toast.error("Couldn't update the certificate", {
            description:
              error instanceof Error ? error.message : "Something went wrong",
          });
        });
    }
  );
  const handleUndo = useEventCallback(async (filing: FilingSummary) => {
    await undo({ data: { filingId: filing.id } })
      .then(() => {
        toast.success(`Filing ${filing.sequence} is waiting for upload again`);
        refresh();
      })
      .catch((error: unknown) => {
        toast.error("Couldn't take the submission back", {
          description:
            error instanceof Error ? error.message : "Something went wrong",
        });
      });
  });
  const [assigning, setAssigning] = useState<{
    filingId: string;
    rowId: string;
    rowName: string;
  } | null>(null);
  const actions: FilingSheetActions = {
    onAssign: (filing, row) =>
      setAssigning({
        filingId: filing.id,
        rowId: row.id,
        rowName: `${row.srNo} · ${row.name}`,
      }),
    onDiscard: setDiscarding,
    onEmail: setEmailing,
    onEmailsSettled: onChanged,
    onReview: handleReview,
    onSubmit: setSubmitting,
    onUndoSubmission: handleUndo,
    onUpload: (filing, rowNames) => setUploading({ filing, rowNames }),
  };

  return (
    <section aria-label="Filings" className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium">Filings</h2>
        <p className="text-muted-foreground text-sm">
          Each filing is one Form 113 upload. Its rows are frozen when it is
          recorded; certificates (Form 114) are added once the portal issues
          them and are due to donors by 31 May.
        </p>
      </div>
      {filings.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border px-4 py-3 text-sm">
          No filing recorded for this year yet.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border" data-testid="filings">
          {filings.map((filing) => {
            const status = FILING_STATUS[filing.status];
            return (
              <li key={filing.id}>
                <button
                  className="hover:bg-muted/40 flex w-full flex-col gap-1 px-4 py-2.5 text-left text-sm outline-none focus-visible:ring-3 sm:flex-row sm:items-center sm:justify-between"
                  data-testid="filing-item"
                  onClick={() => setOpenFilingId(filing.id)}
                  type="button"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">
                      Filing {filing.sequence}
                    </span>
                    <span className="text-muted-foreground truncate text-xs tabular-nums">
                      {filingFacts(filing)}
                    </span>
                  </span>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <FilingSheet
        actions={actions}
        canManage={canManage}
        canViewSensitive={canViewSensitive}
        filing={openFiling}
        onOpenChange={(open) => {
          if (!open) {
            setOpenFilingId(null);
          }
        }}
        version={version}
      />
      <SubmitFilingDialog
        defaults={{
          acknowledgementNumber: submitting?.acknowledgementNumber ?? null,
          filedOn: submitting?.filedOn ?? null,
          transactionId: submitting?.transactionId ?? null,
        }}
        filing={submitting}
        onOpenChange={(open) => {
          if (!open) {
            setSubmitting(null);
          }
        }}
        onSaved={refresh}
      />
      <DiscardFilingDialog
        filing={discarding}
        onDiscarded={refresh}
        onOpenChange={(open) => {
          if (!open) {
            setDiscarding(null);
          }
        }}
      />
      <UploadCertificatesDialog
        filing={uploading?.filing ?? null}
        onOpenChange={(open) => {
          if (!open) {
            setUploading(null);
          }
        }}
        onUploaded={refresh}
        rowNames={uploading?.rowNames ?? new Map()}
      />
      <AssignCertificateDialog
        onAssigned={refresh}
        onOpenChange={(open) => {
          if (!open) {
            setAssigning(null);
          }
        }}
        target={assigning}
      />
      <EmailCertificatesDialog
        manualNames={emailing?.manualNames ?? []}
        onOpenChange={(open) => {
          if (!open) {
            setEmailing(null);
          }
        }}
        onQueued={refresh}
        request={emailing}
      />
    </section>
  );
}
