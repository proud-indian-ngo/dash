import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

import type {
  KalakritiEntryRow,
  KalakritiEntrySession,
} from "@/components/kalakriti/entry-form-dialog";
import {
  type EntrySessionRow,
  EntrySessionsTable,
} from "@/components/kalakriti/entry-sessions-table";
import {
  buildKalakritiEntryRows,
  buildKalakritiEntrySessions,
} from "@/components/kalakriti/entry-view";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { Loader } from "@/components/loader";
import { selectKalakritiEntryCenters } from "@/lib/kalakriti-entry-policy";

export const Route = createFileRoute("/_app/kalakriti/$year/entries/")({
  component: KalakritiEntryEventsPage,
  validateSearch: z.object({ center: z.string().optional() }),
});

function retryFailedResult(result: { retry?: () => void; type: string }): void {
  if (result.type === "error") {
    result.retry?.();
  }
}

function buildSessionRows(
  sessions: readonly KalakritiEntrySession[],
  entries: readonly KalakritiEntryRow[]
): EntrySessionRow[] {
  return sessions
    .map((session) => ({
      ageCategoryName: session.ageCategory.name,
      categoryName: session.competition.category.name,
      competitionName: session.competition.name,
      endAt: session.endAt,
      entryCount: entries.filter((entry) => entry.sessionId === session.id)
        .length,
      genderEligibility: session.competition.genderEligibility,
      id: session.id,
      startAt: session.startAt,
      venueName: session.venue.name,
    }))
    .sort(
      (left, right) =>
        left.startAt - right.startAt ||
        left.competitionName.localeCompare(right.competitionName) ||
        left.ageCategoryName.localeCompare(right.ageCategoryName)
    );
}

function KalakritiEntryEventsPage() {
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const { year } = Route.useParams();
  const { center: selectedCenterId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [centers, centersResult] = useQuery(
    queries.kalakritiCenter.visible({ editionId: edition.id })
  );
  const selectableCenters = selectKalakritiEntryCenters(centers, access);
  const centerId = selectableCenters.some(
    (center) => center.id === selectedCenterId
  )
    ? selectedCenterId
    : (selectableCenters[0]?.id ?? null);
  const selectedCenter = selectableCenters.find(
    (center) => center.id === centerId
  );
  const input = {
    centerId: centerId ?? "00000000-0000-0000-0000-000000000000",
    editionId: edition.id,
  };
  const [entries, entriesResult] = useQuery(
    queries.kalakritiEntry.visibleByCenter(input),
    { enabled: centerId !== null }
  );
  const [sessions, sessionsResult] = useQuery(
    queries.kalakritiEntry.availableDivisionsByCenter(input),
    { enabled: centerId !== null }
  );
  const handleCenterChange = useEventCallback((value: string | null) => {
    navigate({
      replace: true,
      search: { center: value ?? undefined },
    });
  });
  const retry = useEventCallback(() => {
    retryFailedResult(centersResult);
    retryFailedResult(entriesResult);
    retryFailedResult(sessionsResult);
  });

  if (
    [centersResult, entriesResult, sessionsResult].some(
      (result) => result.type === "error"
    )
  ) {
    return (
      <div className="space-y-3" role="alert">
        <p className="font-medium">Entry events could not be loaded.</p>
        <p className="text-muted-foreground text-sm">
          Check your connection and try again.
        </p>
        <Button onClick={retry} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  const centersLoading =
    centers.length === 0 && centersResult.type !== "complete";
  if (centersLoading) {
    return (
      <div
        aria-label="Loading Centers"
        className="flex min-h-48 items-center justify-center"
        role="status"
      >
        <Loader />
      </div>
    );
  }
  if (selectableCenters.length === 0) {
    return (
      <div className="space-y-2">
        <KalakritiPageHeader
          kicker={`Kalakriti · ${edition.year}`}
          title="Entries"
        />
        <p className="text-muted-foreground text-sm">
          You have not been assigned to a Center for Competition Entry
          registration.
        </p>
      </div>
    );
  }

  const isLoading =
    centerId !== null &&
    sessions.length === 0 &&
    sessionsResult.type !== "complete";
  const completeSessions = buildKalakritiEntrySessions(sessions);
  const completeEntries = buildKalakritiEntryRows(entries, completeSessions);
  const sessionRows = buildSessionRows(completeSessions, completeEntries);

  return (
    <div className="space-y-6">
      <KalakritiPageHeader
        actions={
          <div className="min-w-52">
            <label
              className="mb-1 block text-sm font-medium"
              htmlFor="entry-center"
            >
              Center
            </label>
            <Select onValueChange={handleCenterChange} value={centerId ?? ""}>
              <SelectTrigger id="entry-center">
                <span data-slot="select-value">
                  {selectedCenter?.name ?? "Choose Center"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {selectableCenters.map((center) => (
                  <SelectItem key={center.id} value={center.id}>
                    {center.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        kicker={`Kalakriti · ${edition.year}`}
        title="Entries"
      />
      <EntrySessionsTable
        centerId={centerId ?? ""}
        data={sessionRows}
        isLoading={isLoading}
        year={Number(year)}
      />
    </div>
  );
}
