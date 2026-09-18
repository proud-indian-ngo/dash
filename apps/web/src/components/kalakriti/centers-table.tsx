import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type CenterScanStageRecord,
  getKalakritiCenterTransportLabel,
} from "@pi-dash/zero/kalakriti-center-scan-rules";
import type { ReactNode } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { numberField } from "@/components/data-table/filter-fields";
import {
  createCenterFilterFields,
  getCenterFilterValue,
} from "@/components/kalakriti/kalakriti-filters";
import { ParticipationComplianceBadge } from "@/components/kalakriti/participation-compliance-badge";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import type { ParticipationCompliance } from "@/lib/kalakriti-participation-compliance";

import { useTransportStatusSnapshot } from "./use-transport-status-snapshot";

export interface CenterListItem {
  location?: string | null;
  googleMapsUrl?: string | null;
  competitionEntryRegistrationEnabled: boolean;
  id: string;
  name: string;
  retiredAt: number | null;
  studentRegistrationEnabled: boolean;
}

export interface CenterTableRow extends CenterListItem {
  scanStages?: readonly CenterScanStageRecord[];
  compliance?: ParticipationCompliance | "unavailable";
  guardianCount: number | null;
  liaisonCount: number | null;
}

const SKELETON_NAME = <Skeleton className="h-5 w-36" />;
const SKELETON_STATUS = <Skeleton className="h-5 w-16" />;
const SKELETON_REGISTRATION = <Skeleton className="h-5 w-20" />;
const SKELETON_COUNT = <Skeleton className="h-5 w-8" />;
const SKELETON_ACTIONS = <Skeleton className="mx-auto size-8" />;

function RegistrationStatus({
  enabled,
  registrationPhaseOpen,
}: {
  enabled: boolean;
  registrationPhaseOpen: boolean;
}) {
  const available = enabled && registrationPhaseOpen;
  return (
    <Badge variant={available ? "secondary" : "outline"}>
      {available ? "Open" : enabled ? "Edition locked" : "Closed"}
    </Badge>
  );
}

function RowActions({
  canEditCenters,
  canConfigureCenters,
  canManageRegistrationControls,
  center,
  onDelete,
  onEdit,
  onRegistrationControls,
  onRetire,
  onView,
}: {
  canConfigureCenters: boolean;
  canManageRegistrationControls: boolean;
  canEditCenters: boolean;
  center: CenterTableRow;
  onDelete: (center: CenterListItem) => void;
  onEdit: (center: CenterListItem) => void;
  onRegistrationControls: (center: CenterListItem) => void;
  onRetire: (center: CenterListItem) => void;
  onView: (center: CenterTableRow) => void;
}) {
  const isRetired = center.retiredAt !== null;
  const stopRowClick = useEventCallback(
    (event: { stopPropagation: () => void }) => event.stopPropagation()
  );
  const handleView = useEventCallback(() => onView(center));
  const handleEdit = useEventCallback(() => onEdit(center));
  const handleRegistrationControls = useEventCallback(() =>
    onRegistrationControls(center)
  );
  const handleRetire = useEventCallback(() => onRetire(center));
  const handleDelete = useEventCallback(() => onDelete(center));

  return (
    <ResponsiveActionMenu
      title={`${center.name} actions`}
      trigger={
        <Button
          aria-label={`Actions for ${center.name}`}
          className="size-8"
          data-testid="row-actions"
          onClick={stopRowClick}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            className="size-4"
            icon={MoreVerticalIcon}
            strokeWidth={2}
          />
        </Button>
      }
      actions={[
        { id: "view", label: "View details", onSelect: handleView },
        canEditCenters && { id: "edit", label: "Edit", onSelect: handleEdit },
        !isRetired &&
          canManageRegistrationControls && {
            id: "registration",
            label: "Registration controls",
            onSelect: handleRegistrationControls,
            group: "configuration",
          },
        !isRetired &&
          canConfigureCenters && {
            id: "retire",
            label: "Retire",
            onSelect: handleRetire,
            group: "configuration",
          },
        canConfigureCenters && {
          id: "delete",
          label: "Delete",
          onSelect: handleDelete,
          destructive: true,
          group: "configuration",
        },
      ]}
    />
  );
}

function searchCenter(row: CenterTableRow, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  const status = row.retiredAt === null ? "active" : "retired";
  return `${row.name} ${status}`.toLowerCase().includes(normalizedQuery);
}

function centerTransportLabel(row: CenterTableRow) {
  return getKalakritiCenterTransportLabel(row.scanStages ?? []);
}

export function CentersTable({
  canEditCenters,
  canConfigureCenters,
  canManageRegistrationControls,
  data,
  statusSnapshotComplete,
  statusSnapshotKey,
  emptyMessage,
  isLoading,
  onDelete,
  onEdit,
  onRegistrationControls,
  onRetire,
  onView,
  registrationPhaseOpen,
  toolbarActions,
}: {
  canConfigureCenters: boolean;
  canManageRegistrationControls: boolean;
  canEditCenters: boolean;
  data: CenterTableRow[];
  statusSnapshotComplete: boolean;
  statusSnapshotKey: string;
  emptyMessage: string;
  isLoading: boolean;
  onDelete: (center: CenterListItem) => void;
  onEdit: (center: CenterListItem) => void;
  onRegistrationControls: (center: CenterListItem) => void;
  onRetire: (center: CenterListItem) => void;
  onView: (center: CenterTableRow) => void;
  registrationPhaseOpen: boolean;
  toolbarActions?: ReactNode;
}) {
  const { labels, pending } = useTransportStatusSnapshot({
    data,
    scopeKey: statusSnapshotKey,
    complete: statusSnapshotComplete,
    getStatus: centerTransportLabel,
  });
  const columns: DataGridColumnDef<CenterTableRow>[] = [
    {
      accessorKey: "name",
      cell: ({ row }) => (
        <span className="text-sm font-medium" data-testid="row-title">
          {row.original.name}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      meta: {
        compact: "primary",
        headerTitle: "Name",
        skeleton: SKELETON_NAME,
      },
      size: 220,
    },
    {
      accessorFn: (row) => (row.retiredAt === null ? "Active" : "Retired"),
      cell: ({ row }) => (
        <Badge
          variant={row.original.retiredAt === null ? "secondary" : "outline"}
        >
          {row.original.retiredAt === null ? "Active" : "Retired"}
        </Badge>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Status"
          visibility={true}
        />
      ),
      id: "status",
      meta: {
        headerTitle: "Status",
        skeleton: SKELETON_STATUS,
      },
      size: 110,
    },
    {
      id: "transportStatus",
      accessorFn: (row) => labels?.get(row.id),
      enableSorting: !pending,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Transport status"
          visibility={true}
        />
      ),
      cell: ({ row }) =>
        labels?.has(row.original.id) ? (
          <Badge variant="secondary">{labels.get(row.original.id)}</Badge>
        ) : (
          <Skeleton
            aria-label="Loading transport status"
            className="h-5 w-28"
          />
        ),
      meta: {
        compact: "primary",
        headerTitle: "Transport status",
        skeleton: <Skeleton className="h-5 w-28" />,
      },
      size: 170,
    },
    {
      accessorKey: "studentRegistrationEnabled",
      cell: ({ row }) => (
        <RegistrationStatus
          enabled={row.original.studentRegistrationEnabled}
          registrationPhaseOpen={registrationPhaseOpen}
        />
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Student registration"
          visibility={true}
        />
      ),
      meta: {
        headerTitle: "Student registration",
        skeleton: SKELETON_REGISTRATION,
      },
      size: 180,
    },
    {
      accessorKey: "competitionEntryRegistrationEnabled",
      cell: ({ row }) => (
        <RegistrationStatus
          enabled={row.original.competitionEntryRegistrationEnabled}
          registrationPhaseOpen={registrationPhaseOpen}
        />
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Participation registration"
          visibility={true}
        />
      ),
      meta: {
        headerTitle: "Participation registration",
        skeleton: SKELETON_REGISTRATION,
      },
      size: 210,
    },
    {
      id: "participationCompliance",
      accessorFn: (row) =>
        row.compliance === undefined
          ? "Loading"
          : row.compliance === "unavailable"
            ? "Not available"
            : row.compliance.students === 0
              ? "No students"
              : row.compliance.issues.length > 0
                ? "Needs attention"
                : "Compliant",
      cell: ({ row }) => (
        <ParticipationComplianceBadge compliance={row.original.compliance} />
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Participation compliance"
          visibility={true}
        />
      ),
      meta: {
        headerTitle: "Participation compliance",
        skeleton: SKELETON_REGISTRATION,
        stopRowClick: true,
      },
      size: 200,
    },
    {
      accessorKey: "guardianCount",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {row.original.guardianCount ?? "Not available"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Guardians"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Guardians", skeleton: SKELETON_COUNT },
      size: 110,
    },
    {
      accessorKey: "liaisonCount",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {row.original.liaisonCount ?? "Not available"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Liaisons"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Liaisons", skeleton: SKELETON_COUNT },
      size: 100,
    },
    {
      cell: ({ row }) => (
        <RowActions
          canEditCenters={canEditCenters}
          canConfigureCenters={canConfigureCenters}
          canManageRegistrationControls={canManageRegistrationControls}
          center={row.original}
          onDelete={onDelete}
          onEdit={onEdit}
          onRegistrationControls={onRegistrationControls}
          onRetire={onRetire}
          onView={onView}
        />
      ),
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      meta: {
        cellClassName: "text-center",
        enableColumnOrdering: false,
        headerTitle: "",
        skeleton: SKELETON_ACTIONS,
        stopRowClick: true,
      },
      size: 52,
    },
  ];
  const getRowId = useEventCallback((row: CenterTableRow) => row.id);
  const handleRowClick = useEventCallback((row: CenterTableRow) => onView(row));

  return (
    <DataTableWrapper<CenterTableRow>
      columns={columns}
      compactOnMobile
      data={data}
      emptyMessage={emptyMessage}
      filter={{
        fields: [
          ...createCenterFilterFields(),
          numberField("participationIssues", "Participation gaps"),
        ],
        getValue: (row, path) =>
          path[0] === "participationIssues"
            ? typeof row.compliance === "object"
              ? row.compliance.issues.length
              : undefined
            : !registrationPhaseOpen &&
                (path[0] === "studentRegistrationEnabled" ||
                  path[0] === "competitionEntryRegistrationEnabled")
              ? "closed"
              : getCenterFilterValue(row, path),
      }}
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={handleRowClick}
      searchFn={searchCenter}
      searchPlaceholder="Search Centers..."
      storageKey="kalakriti_centers_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
      toolbarActions={toolbarActions}
    />
  );
}
