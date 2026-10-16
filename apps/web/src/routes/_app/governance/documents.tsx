import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pi-dash/design-system/components/ui/table";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import {
  GOVERNANCE_DOCUMENT_FORMAT_LABELS,
  GOVERNANCE_DOCUMENT_KIND_LABELS,
  GOVERNANCE_PAGE_PERMISSIONS,
} from "@pi-dash/shared/governance";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import {
  DocumentDetailSheet,
  ReportBadge,
  type VaultDocument,
} from "@/components/governance/document-detail-sheet";
import { DocumentUploadDialog } from "@/components/governance/document-upload-dialog";
import { epochToIso, formatIso } from "@/components/governance/register-data";
import { PageHeader } from "@/components/shared/page-header";
import { useApp } from "@/context/app-context";
import { getSigningServiceStatus } from "@/functions/governance";
import { assertAnyPermission } from "@/lib/route-guards";
import { preloadRouteQuery } from "@/lib/route-preload";

export const Route = createFileRoute("/_app/governance/documents")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, ...GOVERNANCE_PAGE_PERMISSIONS),
  component: GovernanceDocumentsPage,
  head: () => ({
    meta: [{ title: `Governance documents | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.governanceDocument.all(),
      abortController.signal
    );
  },
});

function GovernanceDocumentsPage() {
  const { hasPermission } = useApp();
  const canManage = hasPermission("governance.manage");
  const [rows, result] = useQuery(queries.governanceDocument.all());
  const [trustees] = useQuery(queries.trustee.all());
  const isLoading = rows.length === 0 && result.type !== "complete";
  const documents: VaultDocument[] = rows.map((d) => ({
    archiveRenewOn: epochToIso(d.archiveRenewOn ?? null),
    archivedAt: d.archivedAt ?? null,
    contentType: d.contentType,
    createdAt: d.createdAt,
    datedOn: epochToIso(d.datedOn),
    id: d.id,
    kind: d.kind,
    note: d.note ?? null,
    originalFilename: d.originalFilename,
    sha256: d.sha256,
    sizeBytes: d.sizeBytes,
    sourceFormat: d.sourceFormat,
    title: d.title,
    validatedAt: d.validatedAt ?? null,
    validationReport: (d.validationReport ??
      null) as VaultDocument["validationReport"],
  }));
  const trusteeNames = new Map(trustees.map((t) => [t.id, t.legalName]));
  const loadSigningStatus = useServerFn(getSigningServiceStatus);
  const [signingConfigured, setSigningConfigured] = useState(true);
  useEffect(() => {
    let cancelled = false;
    loadSigningStatus()
      .then((status) => {
        if (!cancelled) {
          setSigningConfigured(status.configured);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loadSigningStatus]);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = viewingId
    ? (documents.find((d) => d.id === viewingId) ?? null)
    : null;
  const openUpload = useEventCallback(() => setUploadOpen(true));
  const handleUploaded = useEventCallback((id: string) => setViewingId(id));
  const handleDetailOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setViewingId(null);
    }
  });

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          canManage ? (
            <Button onClick={openUpload} type="button">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add document
            </Button>
          ) : null
        }
        description="The trust's deed, registrations, resolutions, resignations and other evidence. Files never change once added; signed PDFs have their signatures checked."
        title="Governance documents"
      />
      {signingConfigured ? null : (
        <p className="border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10 mt-4 rounded-md border p-3 text-sm">
          The signing service isn't set up here, so signed PDFs are stored
          without a signature check. Check them from the document once it is.
        </p>
      )}
      <div className="mt-6">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : null}
        {!isLoading && documents.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No documents yet. Start with the registered trust deed.
          </p>
        ) : null}
        {documents.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Dated</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Signatures</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow
                    className="cursor-pointer"
                    key={document.id}
                    onClick={() => setViewingId(document.id)}
                  >
                    <TableCell className="font-medium">
                      {document.title}
                    </TableCell>
                    <TableCell>
                      {GOVERNANCE_DOCUMENT_KIND_LABELS[document.kind]}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatIso(document.datedOn)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {GOVERNANCE_DOCUMENT_FORMAT_LABELS[document.sourceFormat]}
                    </TableCell>
                    <TableCell>
                      <ReportBadge report={document.validationReport} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>
      <DocumentUploadDialog
        onOpenChange={setUploadOpen}
        onUploaded={handleUploaded}
        open={uploadOpen}
      />
      <DocumentDetailSheet
        canManage={canManage}
        document={viewing}
        onOpenChange={handleDetailOpenChange}
        open={viewing !== null}
        trusteeNames={trusteeNames}
      />
    </div>
  );
}
