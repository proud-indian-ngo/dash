import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

import {
  EntrySessionsTable,
  type EntrySessionRow,
} from "@/components/kalakriti/entry-sessions-table";
import {
  buildKalakritiEntryRows,
  buildKalakritiEntrySessions,
} from "@/components/kalakriti/entry-view";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
export const Route = createFileRoute("/_app/kalakriti/$year/entries/")({
  component: KalakritiEntryEventsPage,
  validateSearch: z.object({ center: z.string().optional() }),
});
function KalakritiEntryEventsPage() {
  const {
    kalakritiEditionAccess: { edition },
  } = Route.useRouteContext();
  const [entries, entriesResult] = useQuery(
    queries.kalakritiEntry.visible({ editionId: edition.id })
  );
  const [sessions, sessionsResult] = useQuery(
    queries.kalakritiEntry.availableDivisions({ editionId: edition.id })
  );
  const retry = useEventCallback(() => {
    if (entriesResult.type === "error") entriesResult.retry?.();
    if (sessionsResult.type === "error") sessionsResult.retry?.();
  });
  if (entriesResult.type === "error" || sessionsResult.type === "error")
    return (
      <div role="alert">
        <p>Entry events could not be loaded.</p>
        <Button onClick={retry}>Retry</Button>
      </div>
    );
  const completeSessions = buildKalakritiEntrySessions(sessions);
  const completeEntries = buildKalakritiEntryRows(entries, completeSessions);
  const snapshotReady =
    entriesResult.type === "complete" && sessionsResult.type === "complete";
  const rows: EntrySessionRow[] = completeSessions
    .map((session) => {
      const sessionEntries = completeEntries.filter(
        (entry) => entry.sessionId === session.id
      );
      return {
        id: session.id,
        competitionName: session.competition.name,
        categoryName: session.competition.category.name,
        ageCategoryName: session.ageCategory.name,
        genderEligibility: session.competition.genderEligibility,
        startAt: session.startAt,
        endAt: session.endAt,
        venueName: session.venue.name,
        entryCount: sessionEntries.length,
        snapshotReady,
      };
    })
    .sort(
      (a, b) =>
        a.startAt - b.startAt ||
        a.competitionName.localeCompare(b.competitionName)
    );
  return (
    <div className="space-y-6">
      <KalakritiPageHeader
        title="Entries"
        kicker={`Kalakriti · ${edition.year}`}
      />
      <EntrySessionsTable
        data={rows}
        year={edition.year}
        isLoading={
          (sessions.length === 0 && sessionsResult.type !== "complete") ||
          (entries.length === 0 && entriesResult.type !== "complete")
        }
      />
    </div>
  );
}
