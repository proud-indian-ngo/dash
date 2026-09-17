import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";

import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { canManageKalakritiAttendees } from "@/lib/kalakriti-attendee-policy";
import { getKalakritiScanActivities } from "@/lib/kalakriti-event-day-policy";

import { AttendeeDetailSheet } from "./attendee-detail-sheet";
import { AttendeeFormDialog } from "./attendee-form-dialog";
import {
  attendeeStatus,
  type AttendeeRow,
  AttendeesTable,
} from "./attendees-table";
import { JudgeCompetitionsDialog } from "./judge-competitions-dialog";
import { KalakritiPageHeader } from "./kalakriti-page-header";
import { PeoplePageSummary } from "./people-page-summary";
import { ScanDialog } from "./scan-dialog";

export function AttendeeRosterPage({
  access,
  kind,
}: {
  access: KalakritiEditionAccess;
  kind: "guest" | "judge";
}) {
  const { setQuery } = useDataTableFilters();
  const zero = useZero();
  const editionId = access.edition.id;
  const canManage = canManageKalakritiAttendees(access, kind);
  const removalLabel = kind === "judge" ? "Delete" : "Archive";
  const [rows, result] = useQuery(
    queries.kalakritiAttendee.visible({ editionId, kind })
  );
  const [competitions, competitionResult] = useQuery(
    queries.kalakritiCompetition.competitions({ editionId }),
    { enabled: kind === "judge" }
  );
  const scope = JSON.stringify([
    editionId,
    kind,
    access.edition.lifecycle,
    access.isGlobalAdmin,
    access.membership?.id,
    access.membership?.kind,
    access.membership?.assignments
      .map(
        (assignment) =>
          `${assignment.responsibility}:${assignment.competitionCategoryId ?? ""}:${assignment.competitionId ?? ""}:${assignment.centerId ?? ""}`
      )
      .sort(),
  ]);
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    rows: AttendeeRow[];
  }>();
  useEffect(() => {
    if (result.type === "complete") setSnapshot({ scope, rows: [...rows] });
  }, [rows, result.type, scope]);
  const data =
    result.type === "complete"
      ? [...rows]
      : snapshot?.scope === scope
        ? snapshot.rows
        : [];
  const statusReady = result.type === "complete" || snapshot?.scope === scope;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const canScanCheckIn =
    getKalakritiScanActivities(access).includes("check_in");
  const checkedIn = data.filter((row) =>
    attendeeStatus(row, "attendee_check_in")
  ).length;
  const unassignedJudges = data.filter(
    (row) => row.judgeAssignments.length === 0
  ).length;
  const canSeeUnassignedJudges =
    access.isGlobalAdmin ||
    access.membership?.responsibilities.some((responsibility) =>
      [
        "edition_admin",
        "overall_events_lead",
        "volunteer_coordinator",
      ].includes(responsibility)
    );
  const activeCompetitions = competitions.filter(
    (competition) =>
      competition.cancelledAt === null && competition.retiredAt === null
  );
  const assignedCompetitionIds = new Set(
    data.flatMap((row) =>
      row.judgeAssignments.map((assignment) => assignment.competitionId)
    )
  );
  const competitionsWithoutJudge = activeCompetitions.filter(
    (competition) => !assignedCompetitionIds.has(competition.id)
  ).length;
  const filterBy = (path: string, operator: string, value: string | number) => {
    void setQuery(
      createFilterQuery([
        createFilterRule({
          id: `attendees-${path}`,
          path: [path],
          operator,
          value,
        }),
      ])
    );
  };
  const selected = data.find((row) => row.id === selectedId) ?? null;
  const editing = data.find((row) => row.id === editId);
  const assigning = data.find((row) => row.id === assignId);
  const removal = useConfirmAction<AttendeeRow>({
    onConfirm: (row) => {
      const args = {
        id: row.id,
        editionId,
        now: Date.now(),
        auditEntryId: uuidv7(),
      };
      return zero.mutate(
        row.kind === "judge"
          ? mutators.kalakritiAttendee.delete(args)
          : mutators.kalakritiAttendee.archive(args)
      ).server;
    },
    mutationMeta: {
      mutation:
        kind === "judge"
          ? "kalakritiAttendee.delete"
          : "kalakritiAttendee.archive",
      entityId: (row) => row.id,
      successMsg: kind === "judge" ? "Judge deleted" : "Guest archived",
      errorMsg:
        kind === "judge"
          ? "Judge could not be deleted"
          : "Guest could not be archived",
    },
  });
  const onView = useEventCallback((row: AttendeeRow) => setSelectedId(row.id));
  const onEdit = useEventCallback((row: AttendeeRow) => {
    setSelectedId(null);
    setEditId(row.id);
  });
  const onAssign = useEventCallback((row: AttendeeRow) => {
    setSelectedId(null);
    setAssignId(row.id);
  });
  const onRemove = useEventCallback((row: AttendeeRow) => {
    setSelectedId(null);
    removal.trigger(row);
  });
  const label = kind === "guest" ? "Guest" : "Judge";
  if (result.type === "error" && !statusReady) {
    return (
      <div className="grid gap-3" role="alert">
        <p>{label}s could not be loaded.</p>
        <Button onClick={result.retry} type="button" variant="outline">
          Retry
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${access.edition.year}`}
        title={`${label}s`}
      />
      {result.type === "error" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">
          <span>Showing saved {label} data. Refresh failed.</span>
          <Button
            onClick={result.retry}
            size="sm"
            type="button"
            variant="outline"
          >
            Retry
          </Button>
        </div>
      ) : null}
      {kind === "judge" && competitionResult.type === "error" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">
          <span>Competition coverage could not be loaded.</span>
          <Button
            onClick={competitionResult.retry}
            size="sm"
            type="button"
            variant="outline"
          >
            Retry
          </Button>
        </div>
      ) : null}
      {statusReady &&
      (kind === "guest" || competitionResult.type === "complete") ? (
        <PeoplePageSummary
          title={kind === "guest" ? "Guest check-in" : "Judge coverage"}
          scope={
            kind === "guest"
              ? "Active Guests in your authorized roster"
              : "Active Judges and Competitions in your authorized scope"
          }
          measures={
            kind === "guest"
              ? [
                  { label: "Active Guests", value: data.length },
                  { label: "Checked in", value: checkedIn },
                  {
                    label: "Awaiting check-in",
                    value: data.length - checkedIn,
                    onClick: () => filterBy("attendee_check_in", "is", "no"),
                  },
                ]
              : [
                  { label: "Active Judges", value: data.length },
                  ...(canSeeUnassignedJudges
                    ? [
                        {
                          label: "Unassigned Judges",
                          value: unassignedJudges,
                          onClick: () =>
                            filterBy("judgeAssignmentCount", "eq", 0),
                        },
                      ]
                    : []),
                  {
                    label: "Competitions without Judges",
                    value: competitionsWithoutJudge,
                  },
                  { label: "Checked in", value: checkedIn },
                ]
          }
          completion={
            access.edition.lifecycle === "live"
              ? {
                  label: `${label} check-in`,
                  value: checkedIn,
                  total: data.length,
                }
              : undefined
          }
        />
      ) : null}
      <AttendeesTable
        data={data}
        kind={kind}
        canManage={canManage}
        isLoading={
          !data.length && result.type !== "complete" && result.type !== "error"
        }
        statusReady={statusReady}
        onView={onView}
        onEdit={onEdit}
        onAssign={onAssign}
        onRemove={onRemove}
        toolbarActions={
          <div className="flex flex-wrap gap-2">
            {canScanCheckIn ? (
              <Button
                className="min-h-11 sm:min-h-10"
                disabled={access.edition.lifecycle !== "live"}
                onClick={() => setScanOpen(true)}
                type="button"
                variant="outline"
              >
                {access.edition.lifecycle === "live"
                  ? "Scan check-in"
                  : "Scan check-in (Live only)"}
              </Button>
            ) : null}
            {canManage ? (
              <Button
                className="min-h-11 sm:min-h-10"
                onClick={() => setCreateOpen(true)}
              >
                Add {label}
              </Button>
            ) : null}
          </div>
        }
      />
      {scanOpen && canScanCheckIn && access.edition.lifecycle === "live" ? (
        <ScanDialog
          activities={["check_in"]}
          editionId={editionId}
          initialActivity="check_in"
          onOpenChange={(open) => setScanOpen(open)}
          year={access.edition.year}
        />
      ) : null}
      <AttendeeDetailSheet
        attendee={selected}
        canManage={canManage}
        statusReady={statusReady}
        onClose={() => setSelectedId(null)}
        onEdit={onEdit}
        onRemove={onRemove}
        onAssign={onAssign}
      />
      {canManage && (createOpen || editing) ? (
        <AttendeeFormDialog
          key={editing?.id ?? "new"}
          attendee={editing}
          editionId={editionId}
          kind={kind}
          onClose={() => {
            setCreateOpen(false);
            setEditId(null);
          }}
        />
      ) : null}
      {canManage && kind === "judge" && assigning ? (
        <JudgeCompetitionsDialog
          key={assigning.id}
          attendee={assigning}
          editionId={editionId}
          onClose={() => setAssignId(null)}
        />
      ) : null}
      <ConfirmDialog
        title={`${removalLabel} ${label}?`}
        description={
          kind === "judge"
            ? `Permanently delete ${removal.payload?.name ?? "this Judge"} and their Competition assignments? This cannot be undone. Judges with check-in or meal history cannot be deleted.`
            : `Remove ${removal.payload?.name ?? "this Guest"} from the active roster? Recorded event-day history is retained.`
        }
        confirmLabel={removalLabel}
        loading={removal.isLoading}
        loadingLabel={kind === "judge" ? "Deleting..." : "Archiving..."}
        open={canManage && removal.isOpen}
        onConfirm={removal.confirm}
        onOpenChange={(open) => {
          if (!open) removal.cancel();
        }}
      />
    </div>
  );
}
