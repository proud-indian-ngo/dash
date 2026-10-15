import { Delete02Icon, Edit02Icon, ViewIcon } from "@hugeicons/core-free-icons";
import type { PermissionId } from "@pi-dash/db/permissions";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { flattenFilterRules } from "@pi-dash/design-system/components/reui/filters/filters-query";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type {
  ContributionChannel,
  ContributionSource,
  DonationType,
} from "@pi-dash/shared/constants";
import {
  CONTRIBUTION_CHANNEL_LABELS,
  CONTRIBUTION_SOURCE_LABELS,
  DONATION_TYPE_LABELS,
  isContributionDeletable,
  isContributionEditable,
} from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";
import { canReadReceipts } from "@pi-dash/shared/receipts";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo } from "react";

import { removeFilterPath } from "@/components/data-table/compile-filter-query";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { Tag } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";

import { formatReceivedOn } from "./contribution-detail-sheet";
import {
  contributionBankScope,
  createContributionFilterFields,
  foldReceiptedStatusFilter,
  getContributionFilterValue,
  hasReachedBankFilter,
  searchContribution,
  useMigrateLegacyContributionFilterParams,
} from "./contribution-filters";
import { contributionsSignature } from "./contribution-stats";
import { ContributionStatusBadge } from "./contribution-status";
import {
  type ContributionRow,
  donorName,
  programmeLabel,
} from "./income-types";
import { ContributionReceiptCell } from "./receipts/contribution-receipt-cell";
import {
  contributionReceiptSortKey,
  hasUnclassifiedRows,
} from "./receipts/receipt-column";
import { useReceiptReadiness } from "./receipts/use-receipt-readiness";
import { useContributionBankEvidence } from "./use-contribution-bank-evidence";

const SKELETON_DATE = <Skeleton className="h-5 w-24" />;
const SKELETON_NAME = <Skeleton className="h-5 w-40" />;
const SKELETON_AMOUNT = <Skeleton className="h-5 w-24" />;
const SKELETON_TAG = <Skeleton className="h-5 w-20" />;

function RowActions({
  canManage,
  onDelete,
  onEdit,
  onView,
  row,
}: {
  canManage: boolean;
  onDelete: (row: ContributionRow) => void;
  onEdit: (row: ContributionRow) => void;
  onView: (row: ContributionRow) => void;
  row: ContributionRow;
}) {
  const stopPropagation = useEventCallback(
    (e: { stopPropagation: () => void }) => e.stopPropagation()
  );
  const editable =
    canManage && isContributionEditable(row.status ?? "received");
  // A refund recorded against it keeps the contribution: edit, never delete.
  const deletable =
    canManage &&
    isContributionDeletable(
      row.status ?? "received",
      row.refunds,
      row.receipts
    );
  return (
    <ResponsiveActionMenu
      actions={[
        {
          icon: ViewIcon,
          id: "view",
          label: "View",
          onSelect: () => onView(row),
        },
        editable && {
          icon: Edit02Icon,
          id: "edit",
          label: "Edit",
          onSelect: () => onEdit(row),
        },
        deletable && {
          destructive: true,
          group: "destructive",
          icon: Delete02Icon,
          id: "delete",
          label: "Delete",
          onSelect: () => onDelete(row),
        },
      ]}
      title={`${donorName(row)} contribution actions`}
      trigger={<RowActionsButton onClick={stopPropagation} />}
    />
  );
}

export function ContributionsTable({
  canManage,
  data,
  isLoading,
  isSynced,
  missingPartyIds,
  onDelete,
  onEdit,
  onView,
}: {
  canManage: boolean;
  data: ContributionRow[];
  isLoading: boolean;
  /** Whether Zero reports the contributions query complete. */
  isSynced: boolean;
  missingPartyIds: ReadonlySet<string>;
  onDelete: (row: ContributionRow) => void;
  onEdit: (row: ContributionRow) => void;
  onView: (row: ContributionRow) => void;
}) {
  useMigrateLegacyContributionFilterParams();
  const { hasPermission } = useApp();
  const seesBankEvidence =
    hasPermission("finance.view") || hasPermission("finance.manage");
  const { query, setQuery } = useDataTableFilters();
  const [searchQuery] = useQueryState("search", parseAsString.withDefault(""));
  const bankFilterActive = hasReachedBankFilter(query);
  useEffect(() => {
    if (bankFilterActive && !seesBankEvidence) {
      setQuery(removeFilterPath(query, "reachedBank"));
    }
  }, [bankFilterActive, query, seesBankEvidence, setQuery]);
  // Receipted is shown, and filtered, as Received now.
  const foldedStatusQuery = useMemo(
    () => foldReceiptedStatusFilter(query),
    [query]
  );
  useEffect(() => {
    if (foldedStatusQuery) {
      setQuery(foldedStatusQuery);
    }
  }, [foldedStatusQuery, setQuery]);
  const bankScope = useMemo(
    () => contributionBankScope(data, query, missingPartyIds, searchQuery),
    [data, missingPartyIds, query, searchQuery]
  );
  const bank = useContributionBankEvidence(seesBankEvidence, bankScope);
  // The Receipt column: for receipt readers only, like the receipts relation.
  const seesReceipts = canReadReceipts((permission) =>
    hasPermission(permission as PermissionId)
  );
  const canDownloadReceipts = hasPermission("donors.receipt");
  const signature = useMemo(() => contributionsSignature(data), [data]);
  const receiptState = useReceiptReadiness({
    enabled: seesReceipts,
    hasUnclassified: (sets) => hasUnclassifiedRows(data, sets),
    refreshKey: signature,
    synced: isSynced,
  });
  const { readiness } = receiptState;
  // A Receipt filter waits for the server's split rather than match
  // nothing, unless loading it failed.
  const receiptFilterPending =
    seesReceipts &&
    readiness === null &&
    !receiptState.error &&
    flattenFilterRules(query).some((rule) => rule.path[0] === "receipt");
  const getRowId = useEventCallback((row: ContributionRow) => row.id);

  const columns: DataGridColumnDef<ContributionRow>[] = [
    {
      accessorFn: (row) => row.receivedOn,
      cell: ({ row }) => formatReceivedOn(row.original.receivedOn),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Received On"
          visibility={true}
        />
      ),
      id: "receivedOn",
      meta: {
        headerTitle: "Received On",
        kind: "date",
        skeleton: SKELETON_DATE,
      },
      size: 130,
    },
    {
      accessorFn: (row) => donorName(row),
      cell: ({ row }) => (
        <span className="truncate text-sm font-medium">
          {donorName(row.original)}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Donor" visibility={true} />
      ),
      id: "donor",
      meta: {
        compact: "primary",
        headerTitle: "Donor",
        kind: "text",
        skeleton: SKELETON_NAME,
      },
      size: 200,
    },
    {
      accessorFn: (row) => row.amountPaise,
      cell: ({ row }) => formatPaise(row.original.amountPaise),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Amount"
          visibility={true}
        />
      ),
      id: "amount",
      meta: {
        compact: "primary",
        headerTitle: "Amount",
        kind: "amount",
        skeleton: SKELETON_AMOUNT,
      },
      size: 130,
    },
    {
      accessorFn: (row) => row.channel,
      cell: ({ row }) => (
        <Tag>
          {
            CONTRIBUTION_CHANNEL_LABELS[
              row.original.channel as ContributionChannel
            ]
          }
        </Tag>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Channel"
          visibility={true}
        />
      ),
      id: "channel",
      meta: { headerTitle: "Channel", skeleton: SKELETON_TAG },
      size: 120,
    },
    {
      accessorFn: (row) => row.donationType,
      cell: ({ row }) =>
        DONATION_TYPE_LABELS[
          (row.original.donationType ?? "voluntary") as DonationType
        ],
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Donation Type"
          visibility={true}
        />
      ),
      id: "donationType",
      meta: { headerTitle: "Donation Type", skeleton: SKELETON_TAG },
      size: 130,
    },
    {
      accessorFn: (row) => programmeLabel(row) ?? "",
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate text-sm">
          {programmeLabel(row.original) ?? "—"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Programme"
          visibility={true}
        />
      ),
      id: "programme",
      meta: { headerTitle: "Programme", skeleton: SKELETON_NAME },
      size: 200,
    },
    {
      accessorFn: (row) => row.status,
      cell: ({ row }) => (
        <ContributionStatusBadge
          refund={row.original}
          status={row.original.status}
        />
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
        kind: "status",
        skeleton: SKELETON_TAG,
      },
      size: 150,
    },
    ...(seesReceipts
      ? [
          {
            accessorFn: (row: ContributionRow) =>
              contributionReceiptSortKey(row, readiness),
            cell: ({ row }: { row: { original: ContributionRow } }) => (
              <ContributionReceiptCell
                canDownload={canDownloadReceipts}
                readiness={receiptState}
                row={row.original}
              />
            ),
            header: ({ column }) => (
              <DataGridColumnHeader
                column={column}
                title="Receipt"
                visibility={true}
              />
            ),
            id: "receipt",
            meta: { headerTitle: "Receipt", skeleton: SKELETON_TAG },
            size: 160,
          } satisfies DataGridColumnDef<ContributionRow>,
        ]
      : []),
    {
      accessorFn: (row) => row.source,
      cell: ({ row }) =>
        CONTRIBUTION_SOURCE_LABELS[
          (row.original.source ?? "manual") as ContributionSource
        ],
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Source"
          visibility={true}
        />
      ),
      id: "source",
      meta: { headerTitle: "Source", skeleton: SKELETON_TAG },
      size: 110,
    },
    {
      cell: ({ row }) => (
        <RowActions
          canManage={canManage}
          onDelete={onDelete}
          onEdit={onEdit}
          onView={onView}
          row={row.original}
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
        stopRowClick: true,
      },
      minSize: 52,
      size: 52,
    },
  ];

  return (
    <DataTableWrapper<ContributionRow>
      columns={columns}
      compactOnMobile
      data={data}
      emptyMessage="No contributions match."
      filter={{
        applyLocally:
          !(bank.isLoading || bank.error) &&
          (seesBankEvidence || !bankFilterActive),
        fields: createContributionFilterFields(
          data,
          seesBankEvidence,
          seesReceipts
        ),
        getValue: getContributionFilterValue(
          missingPartyIds,
          bank.evidence,
          undefined,
          readiness
        ),
      }}
      getRowId={getRowId}
      isLoading={
        isLoading || bank.isLoading || bank.error || receiptFilterPending
      }
      onRowClick={onView}
      searchFn={searchContribution}
      searchPlaceholder="Search donor or reference..."
      storageKey="contributions_table_state_v1"
      toolbarFilters={
        bank.isLoading ? (
          <span className="text-muted-foreground text-sm" role="status">
            Loading bank status...
          </span>
        ) : bank.error ? (
          <Button
            onClick={bank.retry}
            size="sm"
            type="button"
            variant="outline"
          >
            Bank status unavailable. Retry
          </Button>
        ) : seesReceipts && receiptState.error ? (
          <Button
            onClick={receiptState.retry}
            size="sm"
            type="button"
            variant="outline"
          >
            Receipt status unavailable. Retry
          </Button>
        ) : null
      }
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
      totals={["amount"]}
    />
  );
}
