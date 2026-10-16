import { Download04Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { GovernanceValidationReport } from "@pi-dash/db/schema/governance";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import {
  Button,
  buttonVariants,
} from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  GOVERNANCE_DOCUMENT_FORMAT_LABELS,
  GOVERNANCE_DOCUMENT_KIND_LABELS,
  type GovernanceDocumentFormat,
  type GovernanceDocumentKind,
} from "@pi-dash/shared/governance";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { recheckGovernanceDocument } from "@/functions/governance";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";
import { formatTimestamp } from "@/lib/date-formats";

import { formatIso } from "./register-data";

export interface VaultDocument {
  archiveRenewOn: string | null;
  archivedAt: number | null;
  contentType: string;
  createdAt: number;
  datedOn: string;
  id: string;
  kind: GovernanceDocumentKind;
  note: string | null;
  originalFilename: string;
  sha256: string;
  sizeBytes: number;
  sourceFormat: GovernanceDocumentFormat;
  title: string;
  validatedAt: number | null;
  validationReport: GovernanceValidationReport | null;
}

const STATUS_LABEL: Record<GovernanceValidationReport["status"], string> = {
  invalid: "Signature problem",
  no_signatures: "No signatures",
  unavailable: "Not checked",
  valid: "Signatures valid",
};

export function ReportBadge({
  report,
}: {
  report: GovernanceValidationReport | null;
}) {
  if (!report || report.email) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  if (report.status === "valid") {
    return <Badge variant="secondary">{STATUS_LABEL.valid}</Badge>;
  }
  if (report.status === "invalid") {
    return <Badge variant="destructive">{STATUS_LABEL.invalid}</Badge>;
  }
  return <Badge variant="outline">{STATUS_LABEL[report.status]}</Badge>;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm break-words">{value || "—"}</span>
    </div>
  );
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentDetailSheet({
  canManage,
  document,
  onOpenChange,
  open,
  trusteeNames,
}: {
  canManage: boolean;
  document: VaultDocument | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  trusteeNames: Map<string, string>;
}) {
  const recheck = useServerFn(recheckGovernanceDocument);
  const [checking, setChecking] = useState(false);
  const handleRecheck = useEventCallback(async () => {
    if (!document) {
      return;
    }
    setChecking(true);
    await recheck({ data: { id: document.id } })
      .then((result) => {
        toast.success(`Checked: ${STATUS_LABEL[result.status].toLowerCase()}`);
      })
      .catch((error: unknown) => {
        log.error({
          action: "governanceDocument.recheck",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "DocumentDetailSheet",
        });
        toast.error("Couldn't check the signatures", {
          description:
            error instanceof Error ? error.message : "Something went wrong",
        });
      })
      .finally(() => setChecking(false));
  });

  if (!document) {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent />
      </Sheet>
    );
  }
  const report = document.validationReport;
  const href = getProtectedAttachmentHref(
    { id: document.id, kind: "governanceDocument" },
    "inline"
  );
  const isPdf = document.contentType === "application/pdf";

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <DetailSheetHeader
          actions={
            <span className="flex flex-wrap gap-2">
              <a
                className={buttonVariants({ variant: "outline" })}
                href={href}
                rel="noreferrer"
                target="_blank"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={Download04Icon}
                  strokeWidth={2}
                />
                Open
              </a>
              {canManage && isPdf ? (
                <Button
                  disabled={checking}
                  onClick={handleRecheck}
                  type="button"
                  variant="outline"
                >
                  <HugeiconsIcon
                    className="size-4"
                    icon={RefreshIcon}
                    strokeWidth={2}
                  />
                  {checking ? "Checking..." : "Check signatures"}
                </Button>
              ) : null}
            </span>
          }
          badge={<ReportBadge report={report} />}
          meta={[
            GOVERNANCE_DOCUMENT_KIND_LABELS[document.kind],
            formatIso(document.datedOn),
          ]}
          title={document.title}
        />
        <div className="flex flex-col gap-6 px-6 pb-6">
          <section className="grid gap-3 sm:grid-cols-2">
            <Row
              label="Format"
              value={GOVERNANCE_DOCUMENT_FORMAT_LABELS[document.sourceFormat]}
            />
            <Row
              label="File"
              value={`${document.originalFilename} · ${formatSize(document.sizeBytes)}`}
            />
            <Row
              label="Added"
              value={formatTimestamp(
                new Date(document.createdAt).toISOString()
              )}
            />
            <Row
              label="SHA-256"
              value={<code className="text-xs">{document.sha256}</code>}
            />
            {document.note ? <Row label="Note" value={document.note} /> : null}
            {document.archivedAt ? (
              <Row
                label="Long-term copy"
                value={`Made ${formatTimestamp(new Date(document.archivedAt).toISOString())}; next timestamp due ${formatIso(document.archiveRenewOn)}`}
              />
            ) : null}
          </section>

          {report?.email ? (
            <section className="grid gap-3">
              <h3 className="text-sm font-medium">Email</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Row label="From" value={report.email.from} />
                <Row label="To" value={report.email.to} />
                <Row label="Date" value={report.email.date} />
                <Row label="Subject" value={report.email.subject} />
                <Row label="Message ID" value={report.email.messageId} />
                <Row
                  label="DKIM signature"
                  value={
                    report.email.dkimSigned
                      ? "Present (the sending domain signed it)"
                      : "None"
                  }
                />
                <Row
                  label="Attachments"
                  value={report.email.attachments.join(", ")}
                />
              </div>
            </section>
          ) : null}

          {report && !report.email ? (
            <section className="grid gap-3">
              <h3 className="text-sm font-medium">Signatures</h3>
              {report.message ? (
                <p className="text-muted-foreground text-sm">
                  {report.message}
                </p>
              ) : null}
              {report.signatures.length === 0 && !report.message ? (
                <p className="text-muted-foreground text-sm">
                  This file carries no digital signatures.
                </p>
              ) : null}
              {report.signatures.map((signature) => (
                <div
                  className="grid gap-2 rounded-md border p-3 sm:grid-cols-2"
                  key={signature.fieldName}
                >
                  <Row label="Signer" value={signature.signerName} />
                  <Row
                    label="On the register as"
                    value={
                      signature.matchedTrusteeId
                        ? (trusteeNames.get(signature.matchedTrusteeId) ??
                          "A trustee")
                        : "No match"
                    }
                  />
                  <Row
                    label="Signed"
                    value={
                      signature.signingTime
                        ? formatTimestamp(signature.signingTime)
                        : null
                    }
                  />
                  <Row label="Issuer" value={signature.issuer} />
                  <Row
                    label="Intact and covers the document"
                    value={yesNo(
                      signature.intact && signature.coversWholeRevision
                    )}
                  />
                  <Row
                    label="Chains to a trusted root"
                    value={yesNo(signature.trusted)}
                  />
                  <Row
                    label="Timestamped"
                    value={yesNo(signature.timestamped)}
                  />
                  <Row
                    label="Certificate valid"
                    value={
                      signature.notBefore && signature.notAfter
                        ? `${formatTimestamp(signature.notBefore)} to ${formatTimestamp(signature.notAfter)}`
                        : null
                    }
                  />
                </div>
              ))}
              {document.validatedAt ? (
                <p className="text-muted-foreground text-xs">
                  Checked{" "}
                  {formatTimestamp(
                    new Date(document.validatedAt).toISOString()
                  )}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
