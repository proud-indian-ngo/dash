import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@pi-dash/design-system/components/ui/sheet";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { Loader } from "@/components/loader";

import {
  type CompetitionTableRow,
  type ConfigurationDeletePayload,
  type ConfigurationStatePayload,
  formatConfigurationLabel,
} from "./competition-config-types";
import type { CompetitionSessionFormValue } from "./competition-config-types";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm capitalize">{value}</span>
    </div>
  );
}

function AssignedJudges({
  editionId,
  competitionId,
}: {
  editionId: string;
  competitionId: string;
}) {
  const [judges, result] = useQuery(
    queries.kalakritiAttendee.visible({ editionId, kind: "judge" })
  );
  const assigned = judges.filter((judge) =>
    judge.judgeAssignments.some(
      (assignment) => assignment.competitionId === competitionId
    )
  );
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Assigned judges</h3>
      {!judges.length && result.type !== "complete" ? (
        <Loader />
      ) : assigned.length ? (
        <ul className="text-sm">
          {assigned.map((judge) => (
            <li key={judge.id}>
              {judge.name} · {judge.humanId}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">No judges assigned.</p>
      )}
    </section>
  );
}

export function CompetitionDetailSheet({
  editionId,
  year,
  center,
  availableDivisionIds,
  timeZone,
  sessions,
  entries,
  countsReady,
  canViewJudges,
  canEdit,
  canManageCancellations,
  canManageStructure,
  competition,
  onDelete,
  onEdit,
  onOpenChange,
  onSetState,
  open,
}: {
  editionId: string;
  year: number;
  center?: string;
  availableDivisionIds: readonly string[];
  timeZone: string;
  sessions: readonly (CompetitionSessionFormValue & { venueName: string })[];
  entries: readonly { divisionId: string }[];
  countsReady: boolean;
  canViewJudges: boolean;
  canEdit: boolean;
  canManageCancellations: boolean;
  canManageStructure: boolean;
  competition: CompetitionTableRow | null;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (competition: CompetitionTableRow) => void;
  onOpenChange: (open: boolean) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  open: boolean;
}) {
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat("en-IN", {
        timeZone,
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }),
    [timeZone]
  );
  const handleEdit = useEventCallback(() => {
    if (competition) {
      onEdit(competition);
    }
  });
  const handleCancel = useEventCallback(() => {
    if (competition) {
      onSetState({
        action: competition.cancelledAt === null ? "Cancel" : "Restore",
        enabled: competition.cancelledAt === null,
        id: competition.id,
        kind: "competition_cancelled",
        name: competition.name,
      });
    }
  });
  const handleRetire = useEventCallback(() => {
    if (competition) {
      onSetState({
        action: competition.retiredAt === null ? "Retire" : "Restore",
        enabled: competition.retiredAt === null,
        id: competition.id,
        kind: "competition_retired",
        name: competition.name,
      });
    }
  });
  const handleDelete = useEventCallback(() => {
    if (competition) {
      onDelete({
        id: competition.id,
        kind: "competition",
        name: competition.name,
      });
    }
  });

  if (!competition) {
    return null;
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{competition.name}</SheetTitle>
          <SheetDescription>
            Competition eligibility, participation, and lifecycle details.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-6 pb-6">
          {canViewJudges ? (
            <AssignedJudges
              editionId={editionId}
              competitionId={competition.id}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            {competition.cancelledAt === null &&
            competition.retiredAt === null ? (
              <Badge variant="secondary">Active</Badge>
            ) : null}
            {competition.cancelledAt === null ? null : (
              <Badge variant="destructive">Cancelled</Badge>
            )}
            {competition.retiredAt === null ? null : (
              <Badge variant="outline">Retired</Badge>
            )}
          </div>

          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Configuration</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Category" value={competition.categoryName} />
              <DetailRow
                label="Participation"
                value={formatConfigurationLabel(competition.participationMode)}
              />
              <DetailRow
                label="Gender eligibility"
                value={formatConfigurationLabel(competition.genderEligibility)}
              />
              <DetailRow
                label="Group size"
                value={`${competition.minimumGroupSize}-${competition.maximumGroupSize}`}
              />
              <DetailRow
                label="Music upload"
                value={competition.musicUploadEnabled ? "Allowed" : "Off"}
              />
            </div>
          </div>

          <div className="grid gap-3">
            <h3 className="text-sm font-medium">Competition Divisions</h3>
            {competition.divisions.map((division) => {
              const session = sessions.find(
                (item) => item.divisionId === division.id
              );
              const entryCount = entries.filter(
                (entry) => entry.divisionId === division.id
              ).length;
              return (
                <div
                  className="flex flex-col gap-3 border p-3"
                  key={division.id}
                >
                  <h4 className="text-sm font-medium">
                    {division.ageCategory?.name ?? "Unknown Age Category"}
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    {countsReady ? `${entryCount} Entries` : "Checking Entries"}
                  </p>
                  {session ? (
                    <p className="text-sm">
                      {session.venueName} · {dateFormat.format(session.startAt)}{" "}
                      – {dateFormat.format(session.endAt)} ({timeZone})
                      {session.cancelledAt !== null ? " · Cancelled" : ""}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {countsReady ? "Not scheduled" : "Checking schedule"}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {session &&
                    (availableDivisionIds.includes(division.id) ||
                      entryCount > 0) ? (
                      <Button
                        nativeButton={false}
                        variant="outline"
                        className="min-h-10 max-sm:min-h-11"
                        render={
                          <Link
                            to="/kalakriti/$year/competitions"
                            params={{ year: String(year) }}
                            search={{ center, competition: division.id }}
                          />
                        }
                      >
                        View Entries
                      </Button>
                    ) : null}
                    {session && canManageCancellations ? (
                      <Button
                        variant="ghost"
                        className="min-h-10 max-sm:min-h-11"
                        onClick={() =>
                          onSetState({
                            action:
                              session.cancelledAt === null
                                ? "Cancel"
                                : "Restore",
                            enabled: session.cancelledAt === null,
                            id: session.id,
                            kind: "session_cancelled",
                            name: `${competition.name} · ${division.ageCategory?.name ?? "Division"}`,
                          })
                        }
                      >
                        {session.cancelledAt === null
                          ? "Cancel Session"
                          : "Restore Session"}
                      </Button>
                    ) : null}
                    {session && canManageStructure ? (
                      <Button
                        variant="ghost"
                        className="min-h-10 max-sm:min-h-11"
                        onClick={() =>
                          onDelete({
                            id: session.id,
                            kind: "session",
                            name: `${competition.name} · ${division.ageCategory?.name ?? "Session"}`,
                          })
                        }
                      >
                        Remove schedule
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {canEdit || canManageCancellations || canManageStructure ? (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {canEdit ? (
                <Button onClick={handleEdit}>Edit Competition</Button>
              ) : null}
              {canManageCancellations ? (
                <Button onClick={handleCancel} variant="outline">
                  {competition.cancelledAt === null ? "Cancel" : "Restore"}
                </Button>
              ) : null}
              {canManageStructure ? (
                <>
                  <Button onClick={handleRetire} variant="outline">
                    {competition.retiredAt === null ? "Retire" : "Restore"}
                  </Button>
                  <Button onClick={handleDelete} variant="destructive">
                    Delete
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
