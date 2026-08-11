// biome-ignore-all lint/style/useFilenamingConvention: TanStack dynamic route parameters use $ in filenames.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo } from "react";
import { ScheduleAction } from "@/components/kalakriti/public-schedule/schedule-action";
import { ScheduleItem } from "@/components/kalakriti/public-schedule/schedule-item";
import { ScheduleNotFound } from "@/components/kalakriti/public-schedule/schedule-not-found";
import { getKalakritiEditionAccess } from "@/functions/kalakriti-access";
import { getKalakritiPublicSchedule } from "@/functions/kalakriti-public-schedule";
import { getCachedAuth } from "@/lib/auth-cache";
import { kalakritiPublicScheduleYearSchema } from "@/lib/kalakriti-public-schedule";

const EVENT_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  weekday: "long",
  year: "numeric",
});

export const Route = createFileRoute("/kalakriti/$year/schedule")({
  beforeLoad: async ({ params }) => {
    const { session } = await getCachedAuth();
    const year = kalakritiPublicScheduleYearSchema.safeParse(params.year);
    if (!year.success) {
      throw notFound();
    }

    const schedule = await getKalakritiPublicSchedule({ data: year.data });
    if (!schedule) {
      throw notFound();
    }
    const access = session
      ? await getKalakritiEditionAccess({ data: { year: year.data } })
      : null;
    return {
      publicSchedule: schedule,
      scheduleViewer: {
        hasKalakritiAccess: Boolean(access),
        isAuthenticated: Boolean(session),
      },
    };
  },
  component: PublicSchedulePage,
  head: () => ({
    meta: [
      {
        title: "Kalakriti schedule",
      },
      {
        content: "Kalakriti public competition schedule.",
        name: "description",
      },
    ],
  }),
  notFoundComponent: ScheduleNotFound,
});

function formatEventDate(eventDate: string) {
  return EVENT_DATE_FORMATTER.format(new Date(`${eventDate}T00:00:00Z`));
}

function PublicSchedulePage() {
  const { publicSchedule: schedule, scheduleViewer } = Route.useRouteContext();
  const { edition, sessions } = schedule;
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: edition.timezone,
      }),
    [edition.timezone]
  );

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="border-b bg-muted/30">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.16em]">
              Public schedule
            </p>
            <h1 className="mt-3 text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
              {edition.name}
            </h1>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              <time dateTime={edition.eventDate}>
                {formatEventDate(edition.eventDate)}
              </time>
            </p>
          </div>
          <ScheduleAction
            eventId={edition.eventId}
            hasKalakritiAccess={scheduleViewer.hasKalakritiAccess}
            isAuthenticated={scheduleViewer.isAuthenticated}
            year={edition.year}
          />
        </div>
      </header>

      <section
        aria-labelledby="competition-schedule-heading"
        className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12"
      >
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2
              className="font-semibold text-xl tracking-tight sm:text-2xl"
              id="competition-schedule-heading"
            >
              Competition schedule
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Times are shown in {edition.timezone}.
            </p>
          </div>
          <p className="shrink-0 text-muted-foreground text-sm">
            {sessions.length} {sessions.length === 1 ? "event" : "events"}
          </p>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed px-5 py-12 text-center">
            <p className="font-medium">The schedule is being prepared.</p>
            <p className="mt-1 text-muted-foreground text-sm">
              Please check again closer to the event.
            </p>
          </div>
        ) : (
          <ol className="overflow-hidden rounded-lg border bg-card shadow-xs">
            {sessions.map((session, index) => (
              <ScheduleItem
                isLast={index === sessions.length - 1}
                key={`${session.competition}-${session.ageCategory}-${session.startAt}`}
                session={session}
                timeFormatter={timeFormatter}
              />
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
