import { GOVERNANCE_DOCUMENT_KIND_LABELS } from "@pi-dash/shared/governance";

import type { SelectOption } from "@/components/form/select-field";
import { FilePreviewButton } from "@/components/shared/file-preview";
import { StatusBadge } from "@/components/shared/status-badge";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";

import { formatIso } from "./register-data";

export interface DocumentOption {
  datedOn: string;
  id: string;
  kind: keyof typeof GOVERNANCE_DOCUMENT_KIND_LABELS;
  title: string;
}

/** "None" stands for no document in the selects, which can't hold an empty value. */
export const NO_DOCUMENT = "none";

export function documentOptions(
  documents: readonly DocumentOption[]
): SelectOption[] {
  return [
    { label: "No document yet", value: NO_DOCUMENT },
    ...documents.map((d) => ({
      label: `${d.title} · ${GOVERNANCE_DOCUMENT_KIND_LABELS[d.kind]} · ${formatIso(d.datedOn)}`,
      value: d.id,
    })),
  ];
}

export function fromDocumentOption(value: string | undefined): string | null {
  return value && value !== NO_DOCUMENT ? value : null;
}

export function governanceDocumentHref(id: string): string {
  return getProtectedAttachmentHref(
    { id, kind: "governanceDocument" },
    "inline"
  );
}

/** The document behind a date, or a flag that there is none. */
export function EvidenceLink({
  documentId,
  documents,
}: {
  documentId: string | null;
  documents: readonly DocumentOption[];
}) {
  if (!documentId) {
    return <StatusBadge tone="warning">Unevidenced</StatusBadge>;
  }
  const document = documents.find((d) => d.id === documentId);
  return (
    <FilePreviewButton
      className="text-primary inline-flex items-center text-sm underline-offset-4 hover:underline pointer-coarse:min-h-10"
      src={governanceDocumentHref(documentId)}
      fileName={document?.title ?? "Document"}
    >
      {document?.title ?? "Document"}
    </FilePreviewButton>
  );
}
