import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { env } from "@pi-dash/env/web";
import {
  GOVERNANCE_DOCUMENT_FORMAT_LABELS,
  GOVERNANCE_DOCUMENT_KIND_LABELS,
  GOVERNANCE_PAGE_PERMISSIONS,
  governanceDocumentKindValues,
} from "@pi-dash/shared/governance";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { useCompactTable } from "@/components/data-table/data-table-compact";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { dateField, selectField } from "@/components/data-table/filter-fields";
import {
  DocumentDetailSheet,
  ReportBadge,
  SIGNATURE_STATUS_LABELS,
  signatureStatus,
  type VaultDocument,
} from "@/components/governance/document-detail-sheet";
import { DocumentUploadDialog } from "@/components/governance/document-upload-dialog";
import { epochToIso, formatIso } from "@/components/governance/register-data";
import { PageHeader } from "@/components/shared/page-header";
import { Tag } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { getSigningServiceStatus } from "@/functions/governance";
import { assertAnyPermission } from "@/lib/route-guards";
import { preloadRouteQuery } from "@/lib/route-preload";
import { isAwaitingResult } from "@/lib/zero-result";

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

const SKELETON_TITLE = <Skeleton className="h-5 w-48" />;
const SKELETON_TEXT = <Skeleton className="h-5 w-28" />;
const SKELETON_BADGE = <Skeleton className="h-5.5 w-24" />;

const filterFields: FilterField[] = [
  selectField(
    "kind",
    "Kind",
    governanceDocumentKindValues.map((value) => ({
      label: GOVERNANCE_DOCUMENT_KIND_LABELS[value],
      value,
    }))
  ),
  selectField(
    "signatures",
    "Signatures",
    Object.entries(SIGNATURE_STATUS_LABELS).map(([value, label]) => ({
      label,
      value,
    }))
  ),
  dateField("datedOn", "Dated"),
];

function getFilterValue(row: VaultDocument, path: string[]): unknown {
  switch (path[0]) {
    case "datedOn":
      return row.datedOn;
    case "kind":
      return row.kind;
    case "signatures":
      return signatureStatus(row.validationReport);
    default:
      return;
  }
}

function searchDocument(row: VaultDocument, query: string): boolean {
  return [row.title, row.originalFilename, row.note ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

function getRowId(row: VaultDocument) {
  return row.id;
}

// A phone card has room for two lines of a long title; a table row has one.
function TitleCell({ title }: { title: string }) {
  const compact = useCompactTable();
  return (
    <span
      className={cn(
        "font-medium",
        compact ? "line-clamp-2 whitespace-normal" : "truncate"
      )}
    >
      {title}
    </span>
  );
}

// Phone cards show the badge only for a signed PDF, not a bare dash.
function SignaturesCell({ document }: { document: VaultDocument }) {
  const compact = useCompactTable();
  const status = signatureStatus(document.validationReport);
  if (status) {
    return <ReportBadge status={status} />;
  }
  return compact ? null : <span className="text-muted-foreground">—</span>;
}

const columns: DataGridColumnDef<VaultDocument>[] = [
  {
    accessorFn: (row) => row.title,
    cell: ({ row }) => <TitleCell title={row.original.title} />,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Title" visibility={true} />
    ),
    id: "title",
    meta: {
      compact: "primary",
      headerTitle: "Title",
      kind: "text",
      skeleton: SKELETON_TITLE,
    },
    size: 280,
  },
  {
    accessorFn: (row) => GOVERNANCE_DOCUMENT_KIND_LABELS[row.kind],
    cell: ({ row }) => (
      <Tag>{GOVERNANCE_DOCUMENT_KIND_LABELS[row.original.kind]}</Tag>
    ),
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Kind" visibility={true} />
    ),
    id: "kind",
    meta: {
      compact: "primary",
      headerTitle: "Kind",
      kind: "tag",
      skeleton: SKELETON_BADGE,
    },
    size: 200,
  },
  {
    accessorFn: (row) => row.datedOn,
    cell: ({ row }) => formatIso(row.original.datedOn),
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Dated" visibility={true} />
    ),
    id: "datedOn",
    meta: {
      compact: "primary",
      headerTitle: "Dated",
      kind: "date",
      skeleton: SKELETON_TEXT,
    },
    size: 130,
  },
  {
    accessorFn: (row) => GOVERNANCE_DOCUMENT_FORMAT_LABELS[row.sourceFormat],
    cell: ({ row }) => (
      <span className="text-muted-foreground truncate">
        {GOVERNANCE_DOCUMENT_FORMAT_LABELS[row.original.sourceFormat]}
      </span>
    ),
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Format" visibility={true} />
    ),
    id: "format",
    meta: { headerTitle: "Format", skeleton: SKELETON_TEXT },
    size: 180,
  },
  {
    accessorFn: (row) => signatureStatus(row.validationReport) ?? "",
    cell: ({ row }) => <SignaturesCell document={row.original} />,
    header: ({ column }) => (
      <DataGridColumnHeader
        column={column}
        title="Signatures"
        visibility={true}
      />
    ),
    id: "signatures",
    meta: {
      compact: "primary",
      headerTitle: "Signatures",
      kind: "status",
      skeleton: SKELETON_BADGE,
    },
    size: 170,
  },
];

function GovernanceDocumentsPage() {
  const { hasPermission } = useApp();
  const canManage = hasPermission("governance.manage");
  const [rows, result] = useQuery(queries.governanceDocument.all());
  const [trustees] = useQuery(queries.trustee.all());
  const isLoading = rows.length === 0 && isAwaitingResult(result);
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
  const openDocument = useEventCallback((document: VaultDocument) =>
    setViewingId(document.id)
  );
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
        <DataTableWrapper
          columns={columns}
          compactOnMobile
          data={documents}
          emptyMessage={
            documents.length === 0
              ? "No documents yet. Start with the registered trust deed."
              : "No documents match."
          }
          filter={{ fields: filterFields, getValue: getFilterValue }}
          getRowId={getRowId}
          isLoading={isLoading}
          onRowClick={openDocument}
          searchFn={searchDocument}
          searchPlaceholder="Search documents..."
          storageKey="governance_documents_table_state_v1"
          tableLayout={{
            columnsDraggable: true,
            columnsPinnable: true,
            columnsResizable: true,
            columnsVisibility: true,
          }}
        />
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
