import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import {
  KALAKRITI_TRANSPORT_STATUS_LABELS,
  type KalakritiCenterScanStage,
} from "@pi-dash/shared/kalakriti";
import { useMemo } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { dateField, selectField } from "@/components/data-table/filter-fields";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";

import type { CenterTransportAssignment } from "./center-transport-section";
import { useTransportStatusSnapshot } from "./use-transport-status-snapshot";

export interface TransportCenter {
  id: string;
  name: string;
  location: string | null;
  googleMapsUrl: string | null;
  transportAssignments: readonly CenterTransportAssignment[];
  scanStages?: readonly {
    stage: KalakritiCenterScanStage;
    finalizedAt: number | null;
  }[];
}
export interface TransportRow {
  id: string;
  center: TransportCenter;
  assignment: CenterTransportAssignment | null;
  statusLabel?: string;
}

export function buildTransportRows(
  centers: readonly TransportCenter[]
): TransportRow[] {
  return centers.flatMap<TransportRow>((center) =>
    center.transportAssignments.length
      ? center.transportAssignments.map((assignment) => ({
          id: assignment.id,
          center,
          assignment,
        }))
      : [{ id: center.id, center, assignment: null }]
  );
}
const fields = [
  ["center", "Center"],
  ["location", "Location"],
  ["googleMapsUrl", "Google Maps"],
  ["vehicleLabel", "Vehicle number"],
  ["driverName", "Driver name"],
  ["driverPhone", "Driver phone"],
  ["status", "Status"],
] as const;
const filterFields: FilterField[] = [
  ...fields.map(([key, label]) => ({ id: key, label, type: "text" as const })),
  selectField("vehicleAssignment", "Vehicle assignment", [
    { label: "Missing vehicle", value: "missing" },
    { label: "Assigned", value: "assigned" },
  ]),
  dateField("pickupTime", "Pickup time"),
];
function getValue(
  row: TransportRow,
  key: string
): string | number | null | undefined {
  switch (key) {
    case "vehicleAssignment":
      return row.assignment ? "assigned" : "missing";
    case "center":
      return row.center.name;
    case "location":
      return row.center.location;
    case "googleMapsUrl":
      return row.center.googleMapsUrl;
    case "status":
      return row.statusLabel;
    case "pickupTime":
      return row.assignment?.pickupTime;
    case "vehicleLabel":
      return row.assignment?.vehicleLabel;
    case "driverName":
      return row.assignment?.driverName;
    case "driverPhone":
      return row.assignment?.driverPhone;
    default:
      return undefined;
  }
}
function getStatus(row: TransportRow) {
  if (!row.assignment) return "Unassigned";
  return row.assignment.status
    ? KALAKRITI_TRANSPORT_STATUS_LABELS[row.assignment.status]
    : "Unknown";
}
function searchTransport(row: TransportRow, query: string) {
  return fields
    .map(([key]) => getValue(row, key) ?? "")
    .join(" ")
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

export function TransportTable({
  centers,
  complete,
  scopeKey,
  canManage,
  onAdd,
  onEdit,
  onDelete,
}: {
  centers: readonly TransportCenter[];
  complete: boolean;
  scopeKey: string;
  canManage: boolean;
  onAdd: (row: TransportRow) => void;
  onEdit: (row: TransportRow) => void;
  onDelete: (row: TransportRow) => void;
}) {
  const rows = useMemo(() => buildTransportRows(centers), [centers]);
  const snapshot = useTransportStatusSnapshot({
    data: rows,
    scopeKey,
    complete,
    getStatus,
  });
  const data = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        statusLabel: snapshot.labels?.get(row.id),
      })),
    [rows, snapshot.labels]
  );
  const columns = useMemo<DataGridColumnDef<TransportRow>[]>(() => {
    const textColumns = fields.map(
      ([key, title]): DataGridColumnDef<TransportRow> => ({
        id: key,
        accessorFn: (row) => getValue(row, key),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title={title}
            visibility={true}
          />
        ),
        cell: ({ row }) => {
          const value = getValue(row.original, key);
          if (key === "status" && value === undefined)
            return <Skeleton className="h-5 w-24" />;
          if (
            key === "googleMapsUrl" &&
            typeof value === "string" &&
            value.startsWith("https://")
          )
            return (
              <a
                className="text-primary underline"
                href={value}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Maps
              </a>
            );
          return value || "—";
        },
        meta: {
          ...(key === "center" || key === "status"
            ? { compact: "primary" as const }
            : {}),
          headerTitle: title,
          skeleton: <Skeleton className="h-5 w-28" />,
        },
        size: 180,
      })
    );
    textColumns.splice(3, 0, {
      id: "pickupTime",
      accessorFn: (row) => row.assignment?.pickupTime,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Pickup time"
          visibility={true}
        />
      ),
      cell: ({ row }) =>
        row.original.assignment?.pickupTime == null
          ? "—"
          : new Date(row.original.assignment.pickupTime).toLocaleTimeString(
              "en-US",
              {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              }
            ),
      meta: {
        headerTitle: "Pickup time",
        skeleton: <Skeleton className="h-5 w-28" />,
      },
      size: 210,
    });
    if (canManage)
      textColumns.push({
        id: "actions",
        size: 52,
        enableHiding: false,
        enableResizing: false,
        enableSorting: false,
        meta: {
          cellClassName: "text-center",
          enableColumnOrdering: false,
          headerTitle: "",
          skeleton: <Skeleton className="size-7" />,
        },
        cell: ({ row }) => (
          <ResponsiveActionMenu
            title={`${row.original.assignment?.vehicleLabel ?? row.original.center.name} actions`}
            trigger={
              <Button
                aria-label={`Actions for ${row.original.assignment?.vehicleLabel ?? row.original.center.name}`}
                className="size-7"
                data-testid="row-actions"
                size="icon"
                variant="ghost"
              >
                <HugeiconsIcon
                  icon={MoreVerticalIcon}
                  className="size-4"
                  strokeWidth={2}
                />
              </Button>
            }
            actions={[
              {
                id: "add",
                label: "Add vehicle",
                onSelect: () => onAdd(row.original),
              },
              !!row.original.assignment && {
                id: "edit",
                label: "Edit vehicle",
                onSelect: () => onEdit(row.original),
              },
              !!row.original.assignment && {
                id: "delete",
                label: "Delete vehicle",
                onSelect: () => onDelete(row.original),
                destructive: true,
              },
            ]}
          />
        ),
      });
    return textColumns;
  }, [canManage, onAdd, onEdit, onDelete]);
  return (
    <DataTableWrapper
      columns={columns}
      getRowId={(row) => row.id}
      data={data}
      emptyMessage="No Centers available."
      compactOnMobile
      isLoading={data.length === 0 && !complete}
      searchFn={searchTransport}
      storageKey="kalakriti_transport_table_state_v1"
      tableLayout={{
        columnsResizable: true,
        columnsDraggable: true,
        columnsVisibility: true,
        columnsPinnable: true,
      }}
      filter={{
        fields: filterFields,
        getValue: (row, path) => getValue(row, path[0] ?? ""),
      }}
    />
  );
}
