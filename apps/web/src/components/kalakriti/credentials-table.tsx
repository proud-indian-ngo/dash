import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { format } from "date-fns";
import { useMemo } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import type { KalakritiCredentialListItem } from "@/lib/server/kalakriti-credential";

export type KalakritiCredentialRow = KalakritiCredentialListItem;

function getCredentialKind(row: KalakritiCredentialRow): string {
  return row.kind === "student" ? "Student" : "Volunteer";
}

function getCredentialStatus(row: KalakritiCredentialRow): string {
  if (row.revokedAt) {
    return "Revoked";
  }
  return row.issuedAt === null ? "Not issued" : "Active";
}

interface CredentialsTableProps {
  data: KalakritiCredentialRow[];
  isLoading: boolean;
  onPrint: (rows: KalakritiCredentialRow[]) => void;
  onReissue: (row: KalakritiCredentialRow) => void;
}

function searchCredentials(
  row: KalakritiCredentialRow,
  query: string
): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [row.humanId, row.name, getCredentialKind(row), row.scopeLabel]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

function CredentialRowActions({
  onPrint,
  onReissue,
  row,
}: {
  onPrint: (rows: KalakritiCredentialRow[]) => void;
  onReissue: (row: KalakritiCredentialRow) => void;
  row: KalakritiCredentialRow;
}) {
  const handlePrint = useEventCallback(() => onPrint([row]));
  const handleReissue = useEventCallback(() => onReissue(row));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${row.name}`}
            className="size-7"
            data-testid="row-actions"
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
      />
      <DropdownMenuContent align="end" className="w-40">
        {row.revokedAt === null ? (
          <DropdownMenuItem onClick={handlePrint}>Print card</DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={handleReissue}>
          {row.issuedAt === null ? "Issue QR" : "Reissue QR"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CredentialsTable({
  data,
  isLoading,
  onPrint,
  onReissue,
}: CredentialsTableProps) {
  const getRowId = useEventCallback((row: KalakritiCredentialRow) => row.id);
  const handlePrintActive = useEventCallback(() =>
    onPrint(data.filter((row) => row.revokedAt === null).slice(0, 100))
  );

  const columns = useMemo<DataGridColumnDef<KalakritiCredentialRow>[]>(
    () => [
      {
        accessorFn: (row) => row.humanId,
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.humanId}</span>
        ),
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Yearly ID" visibility />
        ),
        id: "humanId",
        meta: {
          headerTitle: "Yearly ID",
          skeleton: <Skeleton className="h-5 w-28" />,
        },
        size: 160,
      },
      {
        accessorFn: (row) => row.name,
        cell: ({ row }) => <span>{row.original.name}</span>,
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Name" visibility />
        ),
        id: "name",
        meta: {
          headerTitle: "Name",
          skeleton: <Skeleton className="h-5 w-40" />,
        },
        size: 200,
      },
      {
        accessorFn: getCredentialKind,
        cell: ({ row }) => <span>{getCredentialKind(row.original)}</span>,
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Kind" visibility />
        ),
        id: "kind",
        meta: {
          headerTitle: "Kind",
          skeleton: <Skeleton className="h-5 w-24" />,
        },
        size: 120,
      },
      {
        accessorFn: (row) => row.scopeLabel,
        cell: ({ row }) => <span>{row.original.scopeLabel}</span>,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Center / Role"
            visibility
          />
        ),
        id: "scope",
        meta: {
          headerTitle: "Center / Role",
          skeleton: <Skeleton className="h-5 w-36" />,
        },
        size: 180,
      },
      {
        accessorFn: getCredentialStatus,
        cell: ({ row }) => <span>{getCredentialStatus(row.original)}</span>,
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Status" visibility />
        ),
        id: "status",
        meta: {
          headerTitle: "Status",
          skeleton: <Skeleton className="h-5 w-20" />,
        },
        size: 100,
      },
      {
        accessorFn: (row) => row.issuedAt,
        cell: ({ row }) => (
          <span>
            {row.original.issuedAt === null
              ? "Not issued"
              : format(row.original.issuedAt, "dd MMM yyyy, HH:mm")}
          </span>
        ),
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Issued" visibility />
        ),
        id: "issuedAt",
        meta: {
          headerTitle: "Issued",
          skeleton: <Skeleton className="h-5 w-36" />,
        },
        size: 180,
      },
      {
        cell: ({ row }) => (
          <CredentialRowActions
            onPrint={onPrint}
            onReissue={onReissue}
            row={row.original}
          />
        ),
        id: "actions",
        meta: {
          enableColumnOrdering: false,
          headerTitle: "",
          skeleton: <Skeleton className="size-7" />,
        },
        size: 48,
      },
    ],
    [onPrint, onReissue]
  );

  return (
    <DataTableWrapper
      columns={columns}
      data={data}
      getRowId={getRowId}
      isLoading={isLoading}
      searchFn={searchCredentials}
      searchPlaceholder="Search credentials..."
      storageKey="kalakriti_credentials_table_state_v1"
      toolbarActions={
        <Button
          disabled={data.length === 0}
          onClick={handlePrintActive}
          type="button"
          variant="outline"
        >
          Print active
        </Button>
      }
    />
  );
}
