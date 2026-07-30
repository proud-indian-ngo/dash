// biome-ignore-all lint/style/useFilenamingConvention: TanStack dynamic route parameters use $ in filenames.
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getKalakritiEditionAccess } from "@/functions/kalakriti-access";
import { getKalakritiPublicSchedule } from "@/functions/kalakriti-public-schedule";
import { getCachedAuth } from "@/lib/auth-cache";
import {
  type KalakritiPublicSchedule,
  kalakritiPublicScheduleYearSchema,
} from "@/lib/kalakriti-public-schedule";

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
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
  }).format(new Date(`${eventDate}T00:00:00Z`));
}

function formatTime(timestamp: number, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(timestamp));
}

function PublicSchedulePage() {
  const { publicSchedule: schedule, scheduleViewer } = Route.useRouteContext();
  const { edition, sessions } = schedule;

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
                edition={edition}
                isLast={index === sessions.length - 1}
                key={`${session.competition}-${session.ageCategory}-${session.startAt}`}
                session={session}
              />
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function ScheduleAction({
  eventId,
  hasKalakritiAccess,
  isAuthenticated,
  year,
}: {
  eventId: string;
  hasKalakritiAccess: boolean;
  isAuthenticated: boolean;
  year: number;
}) {
  if (hasKalakritiAccess) {
    return (
      <Button
        nativeButton={false}
        render={<Link params={{ year: String(year) }} to="/kalakriti/$year" />}
      >
        Go to dashboard
      </Button>
    );
  }

  if (isAuthenticated) {
    return (
      <Button
        nativeButton={false}
        render={<Link params={{ id: eventId }} to="/events/$id" />}
      >
        Show interest
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <p className="max-w-xs text-muted-foreground text-sm md:text-right">
        Want to help at Kalakriti? Create an account to show your interest.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link to="/register" />}>
          Sign up
        </Button>
        <Button
          nativeButton={false}
          render={<Link to="/login" />}
          variant="outline"
        >
          Log in
        </Button>
      </div>
    </div>
  );
}

function ScheduleItem({
  edition,
  isLast,
  session,
}: {
  edition: KalakritiPublicSchedule["edition"];
  isLast: boolean;
  session: KalakritiPublicSchedule["sessions"][number];
}) {
  const cancelled = session.status === "cancelled";

  return (
    <li className={cancelled ? "bg-muted/30" : undefined}>
      <article className="grid gap-4 px-4 py-5 sm:grid-cols-[8rem_1fr_auto] sm:items-start sm:px-6">
        <div>
          <p className="font-semibold text-base tabular-nums">
            <time dateTime={new Date(session.startAt).toISOString()}>
              {formatTime(session.startAt, edition.timezone)}
            </time>
          </p>
          <p className="mt-0.5 text-muted-foreground text-sm tabular-nums">
            until{" "}
            <time dateTime={new Date(session.endAt).toISOString()}>
              {formatTime(session.endAt, edition.timezone)}
            </time>
          </p>
        </div>

        <div className={cancelled ? "opacity-60" : undefined}>
          <h3 className="font-medium text-base">{session.competition}</h3>
          <p className="mt-1 text-muted-foreground text-sm">
            {session.ageCategory} · {session.venue}
          </p>
        </div>

        {cancelled ? (
          <Badge className="w-fit" variant="secondary">
            Cancelled
          </Badge>
        ) : null}
      </article>
      {isLast ? null : <Separator />}
    </li>
  );
}

function ScheduleNotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 text-foreground">
      <div className="max-w-md text-center">
        <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.16em]">
          Kalakriti
        </p>
        <h1 className="mt-3 font-semibold text-2xl tracking-tight">
          Schedule not available
        </h1>
        <p className="mt-2 text-muted-foreground">
          This edition does not have a public schedule yet. Check the year in
          the address or try again later.
        </p>
      </div>
    </main>
  );
}
