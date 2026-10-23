import {
  Delete02Icon,
  Edit02Icon,
  RefreshIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { GovernanceValidationReport } from "@pi-dash/db/schema/governance";
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
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { FilePreviewButton } from "@/components/shared/file-preview";
import { PageHeaderMenu } from "@/components/shared/page-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { recheckGovernanceDocument } from "@/functions/governance";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";
import { formatTimestamp } from "@/lib/date-formats";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

import { DocumentEditDialog } from "./document-edit-dialog";
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

type SignatureStatus = GovernanceValidationReport["status"];

export const SIGNATURE_STATUS_LABELS: Record<SignatureStatus, string> = {
  invalid: "Signature problem",
  no_signatures: "No signatures",
  unavailable: "Not checked",
  valid: "Signatures valid",
};

const SIGNATURE_STATUS_TONES: Record<SignatureStatus, StatusTone> = {
  invalid: "danger",
  no_signatures: "neutral",
  unavailable: "neutral",
  valid: "success",
};

/** The signature check's outcome, or null for an email or an unchecked file. */
export function signatureStatus(
  report: GovernanceValidationReport | null
): SignatureStatus | null {
  return report && !report.email ? report.status : null;
}

export function ReportBadge({ status }: { status: SignatureStatus }) {
  return (
    <StatusBadge tone={SIGNATURE_STATUS_TONES[status]}>
      {SIGNATURE_STATUS_LABELS[status]}
    </StatusBadge>
  );
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
  const zero = useZero();
  const recheck = useServerFn(recheckGovernanceDocument);
  const [editing, setEditing] = useState(false);
  const deleteAction = useConfirmAction<string>({
    onConfirm: async (id) => {
      const result = await zero.mutate(
        mutators.governanceDocument.delete({ id })
      ).server;
      handleMutationResult(result, {
        entityId: id,
        errorMsg: `Couldn't delete: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
        mutation: "governanceDocument.delete",
        successMsg: "Document deleted",
      });
      return result;
    },
    onSuccess: () => onOpenChange(false),
  });
  const closeDelete = useEventCallback((next: boolean) => {
    if (!next) {
      deleteAction.cancel();
    }
  });
  const [checking, setChecking] = useState(false);
  const handleRecheck = useEventCallback(async () => {
    if (!document) {
      return;
    }
    setChecking(true);
    await recheck({ data: { id: document.id } })
      .then((result) => {
        toast.success(
          `Checked: ${SIGNATURE_STATUS_LABELS[result.status].toLowerCase()}`
        );
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
  const status = signatureStatus(report);
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
              <FilePreviewButton
                className={buttonVariants({ variant: "outline" })}
                src={href}
                fileName={document.title}
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={ViewIcon}
                  strokeWidth={2}
                />
                View
              </FilePreviewButton>
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
              {canManage ? (
                <PageHeaderMenu
                  actions={[
                    {
                      icon: Edit02Icon,
                      id: "edit",
                      label: "Edit details",
                      onSelect: () => setEditing(true),
                    },
                    {
                      destructive: true,
                      icon: Delete02Icon,
                      id: "delete",
                      label: "Delete",
                      onSelect: () => deleteAction.trigger(document.id),
                    },
                  ]}
                  title={document.title}
                />
              ) : null}
            </span>
          }
          badge={status ? <ReportBadge status={status} /> : undefined}
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
              value={
                <code className="text-xs break-all">{document.sha256}</code>
              }
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
        <DocumentEditDialog
          document={document}
          onOpenChange={setEditing}
          open={editing}
        />
        <ConfirmDialog
          confirmLabel="Delete document"
          description={`Delete "${document.title}" from the vault? Use this only for a file added by mistake. A document that is evidence for the register, a resolution, a meeting, a registration or a compliance item can't be deleted.`}
          loading={deleteAction.isLoading}
          loadingLabel="Deleting..."
          onConfirm={deleteAction.confirm}
          onOpenChange={closeDelete}
          open={deleteAction.isOpen}
          title="Delete this document?"
        />
      </SheetContent>
    </Sheet>
  );
}
