import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type {
  DataGridColumnDef,
  DataGridRow,
} from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type {
  KalakritiAwardEntry,
  KalakritiAwardRecipient as KalakritiAwardMember,
} from "@pi-dash/shared/kalakriti-awards";
import { useMemo } from "react";

import { DataTableExpandButton } from "@/components/data-table/data-table-compact";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import {
  AWARD_LABELS,
  createAwardFilterFields,
  getAwardFilterValue,
  getAwardStatus,
  searchAwardEntry,
  STATUS_LABELS,
  TYPE_LABELS,
} from "@/components/kalakriti/awards-table-utils";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
const GENDER_LABELS = { female: "Female", male: "Male" } as const;

const SKELETON_TEXT = <Skeleton className="h-5 w-28" />;
const SKELETON_NAME = <Skeleton className="h-5 w-40" />;
const SKELETON_ACTIONS = <Skeleton className="size-8" />;

function StatusBadge({ entry }: { entry: KalakritiAwardEntry }) {
  const status = getAwardStatus(entry);
  const awarded = entry.members.filter((member) => member.awarded).length;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant={
          status === "awarded"
            ? "default"
            : status === "partial"
              ? "secondary"
              : "outline"
        }
      >
        {STATUS_LABELS[status]}
      </Badge>
      {entry.type === "group" ? (
        <span className="text-muted-foreground text-xs tabular-nums">
          {awarded} of {entry.members.length}
        </span>
      ) : null}
    </div>
  );
}

function actionTrigger(label: string) {
  return (
    <Button
      aria-label={`Actions for ${label}`}
      className="size-8"
      data-testid="row-actions"
      onClick={(event) => event.stopPropagation()}
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
  );
}

function MemberActions({
  canWrite,
  entry,
  member,
  pending,
  onSetAwarded,
  onViewStudent,
}: {
  canWrite: boolean;
  entry: KalakritiAwardEntry;
  member: KalakritiAwardMember;
  pending: boolean;
  onSetAwarded: (
    entry: KalakritiAwardEntry,
    member: KalakritiAwardMember,
    awarded: boolean
  ) => void;
  onViewStudent: (
    entry: KalakritiAwardEntry,
    member: KalakritiAwardMember
  ) => void;
}) {
  const view = useEventCallback(() => onViewStudent(entry, member));
  const setAwarded = useEventCallback(() =>
    onSetAwarded(entry, member, !member.awarded)
  );
  return (
    <ResponsiveActionMenu
      title={`${member.name} actions`}
      trigger={actionTrigger(member.name)}
      actions={[
        { id: "view", label: "View student ID", onSelect: view },
        canWrite && {
          disabled: pending,
          id: member.awarded ? "undo" : "award",
          label: member.awarded ? "Undo award" : "Award prize",
          onSelect: setAwarded,
        },
      ]}
    />
  );
}

function GroupActions({
  canWrite,
  entry,
  pending,
  onSetGroupAwarded,
}: {
  canWrite: boolean;
  entry: KalakritiAwardEntry;
  pending: boolean;
  onSetGroupAwarded: (entry: KalakritiAwardEntry, awarded: boolean) => void;
}) {
  const status = getAwardStatus(entry);
  return (
    <ResponsiveActionMenu
      title={`${entry.competitionName} ${AWARD_LABELS[entry.award]} actions`}
      trigger={actionTrigger(
        `${entry.competitionName} ${AWARD_LABELS[entry.award]}`
      )}
      actions={[
        canWrite &&
          status !== "awarded" && {
            disabled: pending,
            id: "award-group",
            label: "Award whole group",
            onSelect: () => onSetGroupAwarded(entry, true),
          },
        canWrite &&
          status !== "pending" && {
            disabled: pending,
            id: "undo-group",
            label: "Undo whole group",
            onSelect: () => onSetGroupAwarded(entry, false),
          },
      ]}
    />
  );
}

function AwardMembersTable({
  canWrite,
  entry,
  isPending,
  onSetAwarded,
  onViewStudent,
}: {
  canWrite: boolean;
  entry: KalakritiAwardEntry;
  isPending: (entry: KalakritiAwardEntry, studentId?: string) => boolean;
  onSetAwarded: (
    entry: KalakritiAwardEntry,
    member: KalakritiAwardMember,
    awarded: boolean
  ) => void;
  onViewStudent: (
    entry: KalakritiAwardEntry,
    member: KalakritiAwardMember
  ) => void;
}) {
  return (
    <div className="overflow-x-auto p-3">
      <table className="w-full min-w-150 text-sm">
        <caption className="sr-only">
          {entry.competitionName} {AWARD_LABELS[entry.award]} recipients
        </caption>
        <thead>
          <tr className="border-b text-left">
            <th className="px-3 py-2 font-medium">Student</th>
            <th className="px-3 py-2 font-medium">Yearly ID</th>
            <th className="px-3 py-2 font-medium">Gender</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="w-12 px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entry.members.map((member) => (
            <tr className="border-b last:border-0" key={member.studentId}>
              <td className="px-3 py-2 font-medium">{member.name}</td>
              <td className="px-3 py-2 font-mono">{member.humanId}</td>
              <td className="px-3 py-2">{GENDER_LABELS[member.gender]}</td>
              <td className="px-3 py-2">
                <Badge variant={member.awarded ? "default" : "outline"}>
                  {member.awarded ? "Awarded" : "Pending"}
                </Badge>
              </td>
              <td className="px-3 py-2">
                <MemberActions
                  canWrite={canWrite}
                  entry={entry}
                  member={member}
                  pending={isPending(entry, member.studentId)}
                  onSetAwarded={onSetAwarded}
                  onViewStudent={onViewStudent}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AwardsTable({
  canWrite,
  data,
  isLoading,
  isPending,
  onSetAwarded,
  onSetGroupAwarded,
  onViewStudent,
}: {
  canWrite: boolean;
  data: KalakritiAwardEntry[];
  isLoading: boolean;
  isPending: (entry: KalakritiAwardEntry, studentId?: string) => boolean;
  onSetAwarded: (
    entry: KalakritiAwardEntry,
    member: KalakritiAwardMember,
    awarded: boolean
  ) => void;
  onSetGroupAwarded: (entry: KalakritiAwardEntry, awarded: boolean) => void;
  onViewStudent: (
    entry: KalakritiAwardEntry,
    member: KalakritiAwardMember
  ) => void;
}) {
  const columns = useMemo<DataGridColumnDef<KalakritiAwardEntry>[]>(
    () => [
      {
        cell: ({ row }) =>
          row.original.type === "group" ? (
            <div className="flex size-full items-center justify-center">
              <DataTableExpandButton
                expanded={row.getIsExpanded()}
                onToggle={row.getToggleExpandedHandler()}
              />
            </div>
          ) : null,
        enableHiding: false,
        enableResizing: false,
        enableSorting: false,
        header: "",
        id: "expand",
        maxSize: 40,
        minSize: 40,
        size: 40,
        meta: {
          cellClassName: "px-0",
          compact: "always",
          enableColumnOrdering: false,
          expandedContent: (entry: KalakritiAwardEntry) =>
            entry.type === "group" ? (
              <AwardMembersTable
                canWrite={canWrite}
                entry={entry}
                isPending={isPending}
                onSetAwarded={onSetAwarded}
                onViewStudent={onViewStudent}
              />
            ) : null,
          headerClassName: "px-0",
          headerTitle: "",
          skeleton: SKELETON_ACTIONS,
          stopRowClick: true,
        },
      },
      {
        accessorFn: (entry) =>
          entry.type === "group"
            ? `${entry.members.length} students`
            : (entry.members[0]?.name ?? "Student unavailable"),
        cell: ({ row }) => {
          const { original } = row;
          const member = original.members[0];
          return (
            <div className="grid gap-0.5">
              <span className="font-medium" data-testid="row-title">
                {original.type === "group"
                  ? `${original.members.length} students`
                  : (member?.name ?? "Student unavailable")}
              </span>
              {original.type === "individual" && member ? (
                <span className="text-muted-foreground font-mono text-xs">
                  {member.humanId}
                </span>
              ) : null}
            </div>
          );
        },
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Recipient"
            visibility={true}
          />
        ),
        id: "recipient",
        meta: {
          compact: "primary",
          headerTitle: "Recipient",
          skeleton: SKELETON_NAME,
        },
        size: 220,
      },
      {
        accessorKey: "competitionName",
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Competition"
            visibility={true}
          />
        ),
        id: "competitionName",
        meta: {
          compact: "primary",
          headerTitle: "Competition",
          skeleton: SKELETON_NAME,
        },
        size: 220,
      },
      {
        accessorFn: (entry) => AWARD_LABELS[entry.award],
        cell: ({ row }) => (
          <Badge variant="outline">{AWARD_LABELS[row.original.award]}</Badge>
        ),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Award"
            visibility={true}
          />
        ),
        id: "award",
        meta: {
          compact: "primary",
          headerTitle: "Award",
          skeleton: SKELETON_TEXT,
        },
        size: 120,
      },
      {
        accessorKey: "centerName",
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Center"
            visibility={true}
          />
        ),
        id: "centerName",
        meta: { headerTitle: "Center", skeleton: SKELETON_NAME },
        size: 200,
      },
      {
        accessorKey: "ageCategoryName",
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Age Category"
            visibility={true}
          />
        ),
        id: "ageCategoryName",
        meta: { headerTitle: "Age Category", skeleton: SKELETON_TEXT },
        size: 150,
      },
      {
        accessorFn: (entry) => TYPE_LABELS[entry.type],
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Type"
            visibility={true}
          />
        ),
        id: "type",
        meta: { headerTitle: "Type", skeleton: SKELETON_TEXT },
        size: 120,
      },
      {
        accessorFn: (entry) => {
          const genders = [
            ...new Set(entry.members.map((member) => member.gender)),
          ];
          return genders.length === 1 && genders[0]
            ? GENDER_LABELS[genders[0]]
            : "Mixed";
        },
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Gender"
            visibility={true}
          />
        ),
        id: "gender",
        meta: { headerTitle: "Gender", skeleton: SKELETON_TEXT },
        size: 120,
      },
      {
        accessorFn: (entry) => STATUS_LABELS[getAwardStatus(entry)],
        cell: ({ row }) => <StatusBadge entry={row.original} />,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Status"
            visibility={true}
          />
        ),
        id: "status",
        meta: {
          compact: "primary",
          headerTitle: "Status",
          skeleton: SKELETON_TEXT,
        },
        size: 190,
      },
      {
        cell: ({ row }) => {
          const entry = row.original;
          const member = entry.members[0];
          return entry.type === "group" ? (
            <GroupActions
              canWrite={canWrite}
              entry={entry}
              pending={isPending(entry)}
              onSetGroupAwarded={onSetGroupAwarded}
            />
          ) : member ? (
            <MemberActions
              canWrite={canWrite}
              entry={entry}
              member={member}
              pending={isPending(entry, member.studentId)}
              onSetAwarded={onSetAwarded}
              onViewStudent={onViewStudent}
            />
          ) : null;
        },
        enableHiding: false,
        enableResizing: false,
        enableSorting: false,
        header: "",
        id: "actions",
        meta: {
          cellClassName: "text-center",
          compact: "always",
          enableColumnOrdering: false,
          headerTitle: "",
          skeleton: SKELETON_ACTIONS,
          stopRowClick: true,
        },
        size: 52,
      },
    ],
    [canWrite, isPending, onSetAwarded, onSetGroupAwarded, onViewStudent]
  );
  const getRowId = useEventCallback(
    (entry: KalakritiAwardEntry) =>
      `${entry.divisionId}:${entry.award}:${entry.entryId}`
  );
  const getRowCanExpand = useEventCallback(
    (row: DataGridRow<KalakritiAwardEntry>) => row.original.type === "group"
  );
  const filterFields = useMemo(() => createAwardFilterFields(data), [data]);

  return (
    <DataTableWrapper
      columns={columns}
      compactOnMobile
      data={data}
      emptyMessage="No published award recipients yet."
      filter={{ fields: filterFields, getValue: getAwardFilterValue }}
      getRowCanExpand={getRowCanExpand}
      getRowId={getRowId}
      isLoading={isLoading}
      searchFn={searchAwardEntry}
      searchPlaceholder="Search award recipients..."
      storageKey="kalakriti_awards_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
    />
  );
}
