import {
  Delete02Icon,
  Download04Icon,
  Edit02Icon,
  Mail01Icon,
  MoreHorizontalIcon,
  Undo02Icon,
  Upload04Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  FilingRowView,
  FilingSummary,
} from "@pi-dash/db/queries/donation-filings";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { FILING_DRIFT_LABELS } from "@pi-dash/shared/donations-return";
import { formatPaise } from "@pi-dash/shared/money";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { FilePreviewDialog } from "@/components/shared/file-preview";
import { PageHeaderMenu } from "@/components/shared/page-header";
import { DetailsRow, RecordSection } from "@/components/shared/record-detail";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import { getDonationFilingRows } from "@/functions/donation-filings";
import { DATE, DATE_TIME } from "@/lib/date-formats";

import {
  canSendRow,
  certificateStatus,
  emailInFlight,
  emailableCount,
  FILING_STATUS,
  manualSendRows,
} from "./filing-labels";

const filingFileUrl = (filingId: string) => `/api/donation-filings/${filingId}`;
const EMAIL_POLL_MS = 4000;

const certificateUrl = (certificateId: string, inline = false) =>
  `/api/donation-certificates/${certificateId}${inline ? "?disposition=inline" : ""}`;

/** The filing's rows; reloaded when `version` changes. */
function useFilingRows(filingId: string, version: number) {
  const load = useServerFn(getDonationFilingRows);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; rows: FilingRowView[] }
  >({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    load({ data: { filingId } })
      .then((rows) => {
        if (!cancelled) {
          setState({ kind: "ready", rows });
        }
      })
      .catch(() => {
        log.error({
          action: "donationFiling.rows",
          component: "FilingSheet",
          error: "Loading the filing's rows failed",
        });
        if (!cancelled) {
          setState({ kind: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filingId, version, load]);
  return state;
}

export interface FilingSheetActions {
  onAssign: (filing: FilingSummary, row: FilingRowView) => void;
  onDiscard: (filing: FilingSummary) => void;
  onEmail: (request: {
    certificateIds?: string[];
    count: number;
    filingId: string;
    manualNames: string[];
  }) => void;
  onReview: (certificateId: string, decision: "confirm" | "reject") => void;
  onSubmit: (filing: FilingSummary) => void;
  onUndoSubmission: (filing: FilingSummary) => void;
  /** The emails on their way have all reached an outcome. */
  onEmailsSettled: () => void;
  onUpload: (filing: FilingSummary, rowNames: Map<string, string>) => void;
}

const REVIEW_REASONS: Record<
  NonNullable<FilingRowView["certificate"]>["matchedBy"],
  string
> = {
  details: "Matched by the labelled donor ID number, amount and name.",
  manual: "Assigned to this row by hand.",
};

const maskedId = (row: FilingRowView) =>
  row.idNumberLast4
    ? `${row.idCode} ending ${row.idNumberLast4}`
    : `${row.idCode} (hidden)`;

function RowItem({
  canManage,
  canViewSensitive,
  onPreview,
  onAssign,
  onResend,
  onReview,
  row,
}: {
  canManage: boolean;
  onAssign: (row: FilingRowView) => void;
  canViewSensitive: boolean;
  onPreview: (row: FilingRowView) => void;
  onResend: (row: FilingRowView) => void;
  onReview: FilingSheetActions["onReview"];
  row: FilingRowView;
}) {
  const status = certificateStatus(row);
  const certificate = row.certificate;
  const reviewing = certificate !== null && !certificate.confirmedAt;
  const actions = !certificate
    ? [
        canManage && {
          icon: Upload04Icon,
          id: "assign",
          label: "Add certificate for this row",
          onSelect: () => onAssign(row),
        },
      ]
    : [
        canViewSensitive && {
          icon: ViewIcon,
          id: "view",
          label: "View certificate",
          onSelect: () => onPreview(row),
        },
        canViewSensitive && {
          icon: Download04Icon,
          id: "download",
          label: "Download certificate",
          render: (
            <a
              aria-label="Download certificate"
              download
              href={certificateUrl(certificate.id)}
            />
          ),
        },
        canManage &&
          canSendRow(row) && {
            icon: Mail01Icon,
            id: "resend",
            label: certificate.emailedAt ? "Resend email" : "Send email",
            onSelect: () => onResend(row),
          },
      ];
  return (
    <li
      className="flex flex-col gap-2 px-4 py-2.5 text-sm"
      data-testid="filing-row"
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{row.name}</span>
          <span className="text-muted-foreground truncate font-mono text-xs tabular-nums">
            {[
              `${row.srNo}`,
              formatPaise(row.amountPaise),
              row.donationTypeCode,
              row.modeCode,
            ].join(" · ")}
          </span>
          {certificate ? (
            <span className="text-muted-foreground truncate text-xs">
              {`Form 114 ${certificate.acknowledgementNumber}`}
              {certificate.emailedAt
                ? ` · emailed ${format(certificate.emailedAt, DATE_TIME)}`
                : ""}
            </span>
          ) : null}
        </div>
        <StatusBadge data-testid="filing-row-status" tone={status.tone}>
          {status.label}
        </StatusBadge>
        {actions.some(Boolean) ? (
          <ResponsiveActionMenu
            actions={actions}
            title={`Certificate for ${row.name}`}
            trigger={
              <Button
                aria-label={`Actions for ${row.name}`}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={MoreHorizontalIcon}
                  strokeWidth={2}
                />
              </Button>
            }
          />
        ) : null}
      </div>
      {row.drift.length > 0 ? (
        <p
          className="text-warning-foreground text-xs"
          data-testid="filing-row-drift"
        >
          Changed since filing, needs a portal revision:{" "}
          {row.drift.map((reason) => FILING_DRIFT_LABELS[reason]).join(", ")}
        </p>
      ) : null}
      {reviewing ? (
        <div
          className="border-warning/30 bg-warning/10 dark:bg-warning-foreground/10 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
          data-testid="filing-row-review"
        >
          <span className="text-warning-foreground min-w-0 flex-1">
            {REVIEW_REASONS[certificate.matchedBy]} Check it before it can be
            emailed.
          </span>
          {canViewSensitive ? (
            <Button
              onClick={() => onPreview(row)}
              size="sm"
              type="button"
              variant="outline"
            >
              Review certificate
            </Button>
          ) : canManage ? (
            <Button
              onClick={() => onReview(certificate.id, "reject")}
              size="sm"
              type="button"
              variant="ghost"
            >
              Not this row
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Beside a certificate under review: the row it was matched to, to compare
 * with the PDF, and the decision.
 */
function ReviewPanel({
  canManage,
  onDecide,
  row,
}: {
  canManage: boolean;
  onDecide: (decision: "confirm" | "reject") => void;
  row: FilingRowView;
}) {
  const certificate = row.certificate;
  if (!certificate) {
    return null;
  }
  const facts: [string, string][] = [
    ["Donor", row.name],
    ["ID", maskedId(row)],
    ["Amount", formatPaise(row.amountPaise)],
    ["Donation type", row.donationTypeCode],
    ["Mode of receipt", row.modeCode],
    ["Form 114 number", certificate.acknowledgementNumber],
  ];
  return (
    <div className="flex flex-col gap-4" data-testid="certificate-review">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Row {row.srNo} as filed</h3>
        <p className="text-muted-foreground text-xs">
          {REVIEW_REASONS[certificate.matchedBy]} Confirm only if the
          certificate shows this donor, ID and amount.
        </p>
      </div>
      <dl className="flex flex-col gap-2.5">
        {facts.map(([label, value]) => (
          <DetailsRow key={label} label={label}>
            {value}
          </DetailsRow>
        ))}
      </dl>
      {canManage ? (
        <div className="flex flex-col gap-2">
          <Button onClick={() => onDecide("confirm")} type="button">
            Confirm match
          </Button>
          <Button
            onClick={() => onDecide("reject")}
            type="button"
            variant="outline"
          >
            Not this row
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One filing: its references, its frozen rows with each certificate's
 * status, and the steps that are waiting (record the submission, upload
 * certificates, email them).
 */
export function FilingSheet({
  actions,
  canManage,
  canViewSensitive,
  filing,
  onOpenChange,
  version,
}: {
  actions: FilingSheetActions;
  canManage: boolean;
  canViewSensitive: boolean;
  filing: FilingSummary | null;
  onOpenChange: (open: boolean) => void;
  version: number;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={filing !== null}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {filing ? (
          <FilingSheetBody
            actions={actions}
            canManage={canManage}
            canViewSensitive={canViewSensitive}
            filing={filing}
            key={filing.id}
            version={version}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function FilingSheetBody({
  actions,
  canManage,
  canViewSensitive,
  filing,
  version,
}: {
  actions: FilingSheetActions;
  canManage: boolean;
  canViewSensitive: boolean;
  filing: FilingSummary;
  version: number;
}) {
  // While a send is on its way, the rows are read again every few seconds,
  // so each email's outcome shows without a reload (filings don't sync).
  const [poll, setPoll] = useState(0);
  const state = useFilingRows(filing.id, version * 100_000 + poll);
  const sending =
    state.kind === "ready" &&
    state.rows.some(
      (row) =>
        row.certificate !== null && emailInFlight(row.certificate) === "sending"
    );
  const wasSending = useRef(false);
  const settle = useEventCallback(() => actions.onEmailsSettled());
  useEffect(() => {
    if (wasSending.current && !sending) {
      settle();
    }
    wasSending.current = sending;
    if (!sending) {
      return;
    }
    const timer = setInterval(() => setPoll((n) => n + 1), EMAIL_POLL_MS);
    return () => clearInterval(timer);
  }, [sending, settle]);
  const [preview, setPreview] = useState<FilingRowView | null>(null);
  const rows = state.kind === "ready" ? state.rows : [];
  const manual = manualSendRows(rows);
  const emailable = emailableCount(rows);
  const status = FILING_STATUS[filing.status];
  const submitted = filing.status === "submitted";
  const rowNames = new Map(
    rows.map((row) => [row.id, `${row.srNo} · ${row.name}`])
  );
  const handleResend = useEventCallback((row: FilingRowView) => {
    if (row.certificate) {
      actions.onEmail({
        certificateIds: [row.certificate.id],
        count: 1,
        filingId: filing.id,
        manualNames: [],
      });
    }
  });
  const handleEmailAll = useEventCallback(() =>
    actions.onEmail({
      count: emailable,
      filingId: filing.id,
      manualNames: manual.map((row) => row.name),
    })
  );

  const primary = (() => {
    if (!canManage || filing.status === "discarded") {
      return null;
    }
    if (filing.status === "prepared") {
      return (
        <Button onClick={() => actions.onSubmit(filing)} type="button">
          Record submission
        </Button>
      );
    }
    return (
      <>
        <Button
          onClick={() => actions.onUpload(filing, rowNames)}
          type="button"
          variant="outline"
        >
          <HugeiconsIcon
            className="size-4"
            icon={Upload04Icon}
            strokeWidth={2}
          />
          Upload certificates
        </Button>
        <Button
          disabled={emailable === 0}
          onClick={handleEmailAll}
          type="button"
          variant="outline"
        >
          <HugeiconsIcon className="size-4" icon={Mail01Icon} strokeWidth={2} />
          Email certificates
        </Button>
      </>
    );
  })();
  const menu = [
    canViewSensitive && {
      icon: Download04Icon,
      id: "download-file",
      label: "Download upload file",
      render: (
        <a
          aria-label="Download upload file"
          download
          href={filingFileUrl(filing.id)}
        />
      ),
    },
    canManage &&
      submitted && {
        icon: Edit02Icon,
        id: "edit-submission",
        label: "Edit submission",
        onSelect: () => actions.onSubmit(filing),
      },
    canManage &&
      submitted &&
      filing.certificateCount === 0 && {
        icon: Undo02Icon,
        id: "undo-submission",
        label: "Take back submission",
        onSelect: () => actions.onUndoSubmission(filing),
      },
    canManage &&
      filing.status === "prepared" && {
        destructive: true,
        icon: Delete02Icon,
        id: "discard",
        label: "Discard filing",
        onSelect: () => actions.onDiscard(filing),
      },
  ];

  return (
    <>
      <DetailSheetHeader
        actions={
          primary || menu.some(Boolean) ? (
            <>
              {primary}
              {menu.some(Boolean) ? (
                <PageHeaderMenu actions={menu} title="Filing actions" />
              ) : null}
            </>
          ) : null
        }
        badge={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
        meta={[
          `FY ${filing.fiscalYear}`,
          `${filing.rowCount} ${filing.rowCount === 1 ? "row" : "rows"}`,
          formatPaise(filing.totalPaise),
        ]}
        title={`Filing ${filing.sequence}`}
      />
      <div className="flex flex-col gap-6 px-6 pb-6">
        <dl className="flex flex-col gap-2.5">
          <DetailsRow label="Recorded">
            {format(filing.createdAt, DATE_TIME)}
            {filing.createdByName ? ` by ${filing.createdByName}` : ""}
          </DetailsRow>
          <DetailsRow label="Upload file">{filing.fileName}</DetailsRow>
          {submitted ? (
            <>
              <DetailsRow label="Filed on">
                {filing.filedOn ? format(parseISO(filing.filedOn), DATE) : "—"}
              </DetailsRow>
              <DetailsRow label="Acknowledgement">
                <span className="font-mono">
                  {filing.acknowledgementNumber}
                </span>
              </DetailsRow>
              <DetailsRow label="Transaction ID">
                <span className="font-mono">{filing.transactionId}</span>
              </DetailsRow>
              <DetailsRow label="Certificates">
                {`${filing.certificateCount} of ${filing.rowCount} · ${filing.emailedCount} emailed`}
              </DetailsRow>
            </>
          ) : null}
        </dl>

        {filing.status === "prepared" ? (
          <p className="text-muted-foreground text-sm">
            Upload the file on the portal (Form 113, Original), then record the
            acknowledgement number and transaction ID it gives back.
          </p>
        ) : null}

        {manual.length > 0 ? (
          <div
            className="border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10 rounded-md border p-3 text-sm"
            data-testid="filing-manual-send"
            role="note"
          >
            Send by hand (no usable email address):{" "}
            {manual.map((row) => row.name).join(", ")}.
          </div>
        ) : null}

        <RecordSection title="Rows">
          {state.kind === "loading" ? (
            <div className="flex flex-col gap-2 rounded-lg border p-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : null}
          {state.kind === "error" ? (
            <p className="text-destructive text-sm">
              Couldn't load the filing's rows.
            </p>
          ) : null}
          {state.kind === "ready" ? (
            <ul className="divide-y rounded-lg border">
              {rows.map((row) => (
                <RowItem
                  canManage={canManage && submitted}
                  canViewSensitive={canViewSensitive}
                  key={row.id}
                  onPreview={setPreview}
                  onAssign={(target) => actions.onAssign(filing, target)}
                  onResend={handleResend}
                  onReview={actions.onReview}
                  row={row}
                />
              ))}
            </ul>
          ) : null}
        </RecordSection>
      </div>
      {preview?.certificate ? (
        <FilePreviewDialog
          aside={
            preview.certificate.confirmedAt ? undefined : (
              <ReviewPanel
                canManage={canManage && submitted}
                onDecide={(decision) => {
                  const id = preview.certificate?.id;
                  setPreview(null);
                  if (id) {
                    actions.onReview(id, decision);
                  }
                }}
                row={preview}
              />
            )
          }
          fileName={`Form 114 ${preview.certificate.acknowledgementNumber}`}
          mimeType="application/pdf"
          onOpenChange={(open) => {
            if (!open) {
              setPreview(null);
            }
          }}
          open
          src={certificateUrl(preview.certificate.id, true)}
        />
      ) : null}
    </>
  );
}
