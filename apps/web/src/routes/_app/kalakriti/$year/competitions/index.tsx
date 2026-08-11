import {
  Calendar03Icon,
  Layers01Icon,
  Location01Icon,
  TaskDaily02Icon,
} from "@hugeicons/core-free-icons";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { StatsCards } from "@/components/stats/stats-cards";

export const Route = createFileRoute("/_app/kalakriti/$year/competitions/")({
  component: CompetitionOverviewPage,
});

function CompetitionOverviewPage() {
  const {
    kalakritiCompetitionAccess,
    kalakritiEditionAccess: { edition },
  } = Route.useRouteContext();
  const [categories, categoryResult] = useQuery(
    queries.kalakritiCompetition.categories({ editionId: edition.id })
  );
  const [competitions, competitionResult] = useQuery(
    queries.kalakritiCompetition.competitions({ editionId: edition.id })
  );
  const [venues, venueResult] = useQuery(
    queries.kalakritiCompetition.venues({ editionId: edition.id })
  );
  const [sessions, sessionResult] = useQuery(
    queries.kalakritiCompetition.sessions({ editionId: edition.id })
  );
  const isLoading =
    categories.length === 0 &&
    competitions.length === 0 &&
    venues.length === 0 &&
    sessions.length === 0 &&
    [categoryResult, competitionResult, venueResult, sessionResult].some(
      (result) => result.type !== "complete"
    );
  const activeCompetitions = competitions.filter(
    (competition) =>
      competition.cancelledAt === null && competition.retiredAt === null
  ).length;
  const activeCategories = categories.filter(
    (category) => category.retiredAt === null
  ).length;
  const activeVenues = venues.filter(
    (venue) => venue.retiredAt === null
  ).length;
  const scheduledSessions = sessions.filter(
    (session) => session.cancelledAt === null
  );
  const basePath = `/kalakriti/${edition.year}/competitions`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-semibold text-2xl">
          Competition overview
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          A summary of Categories, Competitions, Venues, and the event-day
          Schedule.
        </p>
      </div>

      <StatsCards
        className="lg:grid-cols-4"
        isLoading={isLoading}
        items={[
          {
            description: `${activeCategories} active groupings`,
            href: `${basePath}/categories`,
            icon: Layers01Icon,
            label: "Categories",
            value: categories.length,
          },
          {
            description: `${activeCompetitions} active Competitions`,
            href: `${basePath}/catalog`,
            icon: TaskDaily02Icon,
            label: "Competitions",
            value: competitions.length,
          },
          {
            description: `${activeVenues} active locations`,
            href: `${basePath}/venues`,
            icon: Location01Icon,
            label: "Venues",
            value: venues.length,
          },
          {
            description: `${scheduledSessions.reduce(
              (capacity, session) => capacity + session.capacity,
              0
            )} total Entry capacity`,
            href: `${basePath}/schedule`,
            icon: Calendar03Icon,
            label: "Scheduled Sessions",
            value: scheduledSessions.length,
          },
        ]}
      />

      {kalakritiCompetitionAccess.configurationLocked ? (
        <p className="border-primary border-l-2 pl-4 text-muted-foreground text-sm">
          Configuration is locked while this Edition is {edition.lifecycle}. The
          tables remain available for reference.
        </p>
      ) : null}
    </div>
  );
}
