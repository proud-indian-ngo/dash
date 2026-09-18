import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { KalakritiEntryNextSlot } from "@pi-dash/shared/kalakriti-performance-order";
import { format } from "date-fns";
import { type ReactNode, useMemo, useState } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";

import {
  getEntryStudentAttendance,
  entryAttendanceKey,
  getEntryStudentArrival,
} from "./entry-arrival";
import type {
  KalakritiEntryRow,
  KalakritiEntryStudent,
} from "./entry-form-dialog";
import { EntryMusicCell } from "./entry-music-cell";
import { EntryMusicDialog } from "./entry-music-dialog";
import { EntryMusicPlaybackDialog } from "./entry-music-playback-dialog";
import { formatKalakritiNextSlotLabel } from "./entry-performance-order";
import { EntrySessionSummary } from "./entry-session-summary";
import { EntryParticipantsCell, EntryStatusCell } from "./entry-status-cell";
import {
  createEntryTableFilterFields,
  getEntryTableFilterValue,
} from "./entry-table-filters";
import { useTransportStatusSnapshot } from "./use-transport-status-snapshot";

function getAttendanceSnapshotLabel(row: {
  student: KalakritiEntryStudent;
  editionId: string;
  sessionId?: string;
}): string {
  return getEntryStudentAttendance(row.student, row.editionId, row.sessionId);
}

function searchEntries(
  row: KalakritiEntryRow,
  query: string,
  includeCompetition = true,
  nextLabel?: string
): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [
    ...row.members.flatMap((member) => [
      member.student.humanId,
      member.student.name,
    ]),
    row.center?.name ?? "",
    nextLabel ?? "",
    ...(includeCompetition
      ? [
          row.session.competition.name,
          row.session.competition.category.name,
          row.session.ageCategory.name,
          row.session.venue.name,
        ]
      : []),
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

function EntryRowActions({
  canEdit,
  entry,
  onEdit,
  onRemove,
}: {
  canEdit: boolean;
  entry: KalakritiEntryRow;
  onEdit: (entry: KalakritiEntryRow) => void;
  onRemove: (entry: KalakritiEntryRow) => void;
}) {
  const handleEdit = useEventCallback(() => onEdit(entry));
  const handleRemove = useEventCallback(() => onRemove(entry));
  const actionLabel =
    entry.participationMode === "group"
      ? `${entry.session.competition.name} group`
      : (entry.members[0]?.student.name ?? "Entry");
  return (
    <ResponsiveActionMenu
      title={`${actionLabel} actions`}
      trigger={
        <Button
          aria-label={`Actions for ${actionLabel}`}
          className="mx-auto size-7"
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
      contentClassName="w-40"
      actions={[
        canEdit &&
          entry.participationMode === "group" && {
            id: "edit",
            label: "Edit Group",
            onSelect: handleEdit,
          },
        {
          id: "remove",
          label: "Remove Entry",
          onSelect: handleRemove,
          destructive: true,
        },
      ]}
    />
  );
}

interface EntryTableProps {
  activeSessionIds: readonly string[];
  centerId?: string;
  snapshotReady?: boolean;
  getRowPermissions?: (
    entry: KalakritiEntryRow
  ) => EntryTableProps["permissions"];
  data: KalakritiEntryRow[];
  editionId: string;
  emptyMessage?: string;
  isLoading: boolean;
  onEdit: (entry: KalakritiEntryRow) => void;
  onRegister: () => void;
  onRemove: (entry: KalakritiEntryRow) => void;
  permissions: {
    edit: boolean;
    register: boolean;
    remove: boolean;
    uploadMusic: boolean;
  };
  showMusic?: boolean;
  nextByEntryId?: ReadonlyMap<string, KalakritiEntryNextSlot>;
  toolbarActions?: ReactNode;
  variant?: "center" | "session";
}

function getEntryRowId(entry: KalakritiEntryRow): string {
  return entry.id;
}

export function EntryTable({
  activeSessionIds,
  centerId = "",
  snapshotReady = false,
  getRowPermissions,
  data,
  editionId,
  emptyMessage = "No Competition Entries have been registered for this Center.",
  isLoading,
  onEdit,
  onRegister,
  onRemove,
  permissions,
  showMusic: showMusicProp,
  nextByEntryId,
  toolbarActions,
  variant = "center",
}: EntryTableProps) {
  const { setQuery } = useDataTableFilters();
  const { register, remove } = permissions;
  const permissionsFor = (entry: KalakritiEntryRow) =>
    getRowPermissions?.(entry) ?? permissions;
  // Cell renderers can remount during Zero updates; keep the staged modal above the grid.
  const [musicEntry, setMusicEntry] = useState<KalakritiEntryRow | null>(null);
  const [playbackEntry, setPlaybackEntry] = useState<{
    id: string;
    fileName: string;
  } | null>(null);
  const showMusic =
    showMusicProp ||
    data.some(
      (entry) =>
        entry.session.competition.musicUploadEnabled ||
        entry.musicFiles.length > 0
    );
  const arrivalStudents = useMemo(
    () => [
      ...new Map(
        data.flatMap((entry) =>
          entry.members.map(
            (member) => [member.studentId, member.student] as const
          )
        )
      ).values(),
    ],
    [data]
  );
  const arrival = useTransportStatusSnapshot({
    data: arrivalStudents,
    scopeKey: editionId,
    complete: snapshotReady,
    getStatus: getEntryStudentArrival,
  });
  const attendanceStudents = useMemo(
    () => [
      ...new Map(
        data.flatMap((entry) =>
          entry.members.map((member) => {
            const id = entryAttendanceKey(entry, member.studentId);
            return [
              id,
              {
                id,
                student: member.student,
                editionId,
                sessionId: entry.session.competitionSessionId,
              },
            ] as const;
          })
        )
      ).values(),
    ],
    [data, editionId]
  );
  const attendance = useTransportStatusSnapshot({
    data: attendanceStudents,
    scopeKey: editionId,
    complete: snapshotReady,
    getStatus: getAttendanceSnapshotLabel,
  });
  const filterFields = useMemo(
    () =>
      createEntryTableFilterFields(
        data,
        variant !== "session",
        Boolean(showMusic),
        Boolean(nextByEntryId)
      ),
    [data, variant, showMusic, nextByEntryId]
  );
  const allColumns: DataGridColumnDef<KalakritiEntryRow>[] = [
    {
      id: "center",
      accessorFn: (row) => row.center?.name ?? "Unknown Center",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Center"
          visibility={true}
        />
      ),
      meta: {
        compact: "primary",
        headerTitle: "Center",
        skeleton: <Skeleton className="h-5 w-32" />,
      },
      size: 180,
    },
    ...(["present", "attended"] as const).map(
      (mode): DataGridColumnDef<KalakritiEntryRow> => ({
        id: mode,
        accessorFn: (row) =>
          getEntryTableFilterValue(
            row,
            [mode],
            arrival.labels,
            attendance.labels
          ),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title={mode === "present" ? "Present" : "Attended"}
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <EntryStatusCell
            entry={row.original}
            mode={mode}
            labels={mode === "present" ? arrival.labels : attendance.labels}
          />
        ),
        meta: {
          compact: "hidden",
          headerTitle: mode === "present" ? "Present" : "Attended",
          skeleton: <Skeleton className="h-5 w-32" />,
        },
        size: 210,
      })
    ),
    {
      id: "participationMode",
      accessorKey: "participationMode",
      cell: ({ row }) =>
        row.original.participationMode === "group" ? "Group" : "Individual",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Participation"
          visibility={true}
        />
      ),
      meta: {
        headerTitle: "Participation",
        skeleton: <Skeleton className="h-5 w-24" />,
      },
      size: 130,
    },
    {
      accessorFn: (row) =>
        row.members.map((member) => member.student.humanId).join(" "),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-sm">
          {row.original.members.length > 0
            ? row.original.members.map((member) => (
                <span key={member.student.id}>{member.student.humanId}</span>
              ))
            : "Unknown"}
        </div>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Student IDs"
          visibility={true}
        />
      ),
      id: "studentId",
      meta: {
        headerTitle: "Student IDs",
        skeleton: <Skeleton className="h-5 w-24" />,
      },
      size: 135,
    },
    {
      accessorFn: (row) =>
        row.members.map((member) => member.student.name).join(" "),
      cell: ({ row }) => (
        <EntryParticipantsCell
          attended={attendance.labels}
          entry={row.original}
          present={arrival.labels}
        />
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Participants"
          visibility={true}
        />
      ),
      id: "student",
      meta: {
        compact: "primary",
        headerTitle: "Participants",
        skeleton: <Skeleton className="h-5 w-40" />,
      },
      size: 210,
    },
    ...(nextByEntryId
      ? [
          {
            accessorFn: (row: KalakritiEntryRow) =>
              nextByEntryId.get(row.id)?.startAt ?? Number.POSITIVE_INFINITY,
            cell: ({ row }: { row: { original: KalakritiEntryRow } }) => {
              const slot = nextByEntryId.get(row.original.id);
              if (!slot) return "—";
              const timeLabel = slot.startAt
                ? format(new Date(slot.startAt), "h:mm a")
                : "";
              return (
                <span
                  className={
                    slot.kind === "immediate"
                      ? "text-sm font-medium"
                      : "text-sm"
                  }
                >
                  {formatKalakritiNextSlotLabel(
                    slot,
                    timeLabel,
                    row.original.participationMode === "group"
                  )}
                </span>
              );
            },
            header: ({ column }) => (
              <DataGridColumnHeader
                column={column}
                title="Next"
                visibility={true}
              />
            ),
            id: "next",
            meta: {
              headerTitle: "Next",
              skeleton: <Skeleton className="h-5 w-40" />,
            },
            size: 240,
          } satisfies DataGridColumnDef<KalakritiEntryRow>,
        ]
      : []),
    ...(variant === "session"
      ? []
      : [
          {
            accessorFn: (row) => row.session.competition.name,
            cell: ({ row }: { row: { original: KalakritiEntryRow } }) => (
              <span className="text-sm">
                {row.original.session.competition.name}
              </span>
            ),
            header: ({ column }) => (
              <DataGridColumnHeader
                column={column}
                title="Competition"
                visibility={true}
              />
            ),
            id: "competition",
            meta: {
              headerTitle: "Competition",
              skeleton: <Skeleton className="h-5 w-32" />,
            },
            size: 190,
          } satisfies DataGridColumnDef<KalakritiEntryRow>,
        ]),
    {
      accessorFn: (row) => row.session.ageCategory.name,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.session.ageCategory.name}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Age Category"
          visibility={true}
        />
      ),
      id: "ageCategory",
      meta: {
        headerTitle: "Age Category",
        skeleton: <Skeleton className="h-5 w-24" />,
      },
      size: 145,
    },
    {
      accessorFn: (row) => row.session.startAt,
      cell: ({ row }) => (
        <span className="text-sm">
          {format(new Date(row.original.session.startAt), "dd MMM, h:mm a")}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Session"
          visibility={true}
        />
      ),
      id: "session",
      meta: {
        headerTitle: "Session",
        skeleton: <Skeleton className="h-5 w-28" />,
      },
      size: 175,
    },
    {
      accessorFn: (row) => row.session.venue.name,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.session.venue.name}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Venue" visibility={true} />
      ),
      id: "venue",
      meta: {
        headerTitle: "Venue",
        skeleton: <Skeleton className="h-5 w-24" />,
      },
      size: 160,
    },
    ...(showMusic
      ? [
          {
            accessorFn: (row: KalakritiEntryRow) => row.musicFiles.length,
            cell: ({ row }: { row: { original: KalakritiEntryRow } }) => (
              <EntryMusicCell
                canWrite={
                  permissionsFor(row.original).uploadMusic &&
                  (row.original.session.competition.musicUploadEnabled ===
                    true ||
                    row.original.musicFiles.length > 0)
                }
                musicFiles={row.original.musicFiles}
                onEdit={() => setMusicEntry(row.original)}
                onPlay={setPlaybackEntry}
              />
            ),
            header: ({ column }) => (
              <DataGridColumnHeader
                column={column}
                title="Music"
                visibility={true}
              />
            ),
            id: "music",
            meta: {
              headerTitle: "Music",
              skeleton: <Skeleton className="h-5 w-28" />,
              stopRowClick: true,
            },
            size: 220,
          } satisfies DataGridColumnDef<KalakritiEntryRow>,
        ]
      : []),
    ...(remove
      ? [
          {
            cell: ({ row }: { row: { original: KalakritiEntryRow } }) =>
              permissionsFor(row.original).remove ? (
                <EntryRowActions
                  canEdit={
                    permissionsFor(row.original).edit &&
                    activeSessionIds.includes(row.original.sessionId)
                  }
                  entry={row.original}
                  onEdit={onEdit}
                  onRemove={onRemove}
                />
              ) : null,
            enableHiding: false,
            enableResizing: false,
            enableSorting: false,
            header: () => null,
            id: "actions",
            meta: {
              cellClassName: "text-center",
              enableColumnOrdering: false,
              headerTitle: "",
              skeleton: <Skeleton className="mx-auto size-7" />,
              stopRowClick: true,
            },
            size: 52,
          } satisfies DataGridColumnDef<KalakritiEntryRow>,
        ]
      : []),
  ];

  const columns =
    variant === "session"
      ? allColumns.filter(
          (column) =>
            !["ageCategory", "venue", "session", "participationMode"].includes(
              column.id ?? ""
            )
        )
      : allColumns;

  return (
    <>
      {playbackEntry ? (
        <EntryMusicPlaybackDialog
          key={playbackEntry.id}
          entryId={playbackEntry.id}
          musicFileName={playbackEntry.fileName}
          onOpenChange={(open) => {
            if (!open) setPlaybackEntry(null);
          }}
        />
      ) : null}
      {musicEntry && permissionsFor(musicEntry).uploadMusic ? (
        <EntryMusicDialog
          key={musicEntry.id}
          centerId={musicEntry.centerId ?? centerId}
          divisionId={musicEntry.sessionId}
          editionId={editionId}
          entryId={musicEntry.id}
          musicFiles={musicEntry.musicFiles}
          allowAdditions={
            musicEntry.session.competition.musicUploadEnabled === true
          }
          onOpenChange={(open) => {
            if (!open) setMusicEntry(null);
          }}
        />
      ) : null}
      {variant === "session" ? (
        <EntrySessionSummary
          entries={data.length}
          studentIds={arrivalStudents.map((student) => student.id)}
          attendanceIds={attendanceStudents.map((student) => student.id)}
          present={arrival.labels}
          attended={attendance.labels}
          ready={snapshotReady}
          missingMusic={
            showMusicProp
              ? data.filter((entry) => entry.musicFiles.length === 0).length
              : undefined
          }
          sequential={Boolean(nextByEntryId)}
          onReviewMusic={() =>
            void setQuery(
              createFilterQuery([
                createFilterRule({
                  id: "missing-music",
                  path: ["music"],
                  operator: "eq",
                  value: 0,
                }),
              ])
            )
          }
        />
      ) : null}
      <DataTableWrapper
        filter={{
          fields: filterFields,
          getValue: (row, path) =>
            getEntryTableFilterValue(
              row,
              path,
              arrival.labels,
              attendance.labels,
              nextByEntryId
            ),
        }}
        columns={columns}
        data={data}
        emptyMessage={emptyMessage}
        compactOnMobile
        getRowId={getEntryRowId}
        isLoading={isLoading}
        searchFn={(row, query) => {
          const slot = nextByEntryId?.get(row.id);
          return searchEntries(
            row,
            query,
            variant !== "session",
            slot
              ? formatKalakritiNextSlotLabel(
                  slot,
                  slot.startAt ? format(new Date(slot.startAt), "h:mm a") : "",
                  row.participationMode === "group"
                )
              : undefined
          );
        }}
        searchPlaceholder="Search Entries..."
        storageKey={
          variant === "session"
            ? "kalakriti_competition_entries_table_state_v2"
            : "kalakriti_entries_table_state_v1"
        }
        tableLayout={{
          columnsDraggable: true,
          columnsPinnable: true,
          columnsResizable: true,
          columnsVisibility: true,
        }}
        toolbarActions={
          <>
            {toolbarActions}
            {register ? (
              <Button onClick={onRegister}>Register Entry</Button>
            ) : null}
          </>
        }
      />
    </>
  );
}
