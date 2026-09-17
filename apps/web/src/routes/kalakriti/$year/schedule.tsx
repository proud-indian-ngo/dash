// biome-ignore-all lint/style/useFilenamingConvention: TanStack dynamic route parameters use $ in filenames.
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@pi-dash/design-system/components/ui/empty";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@pi-dash/design-system/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { ScheduleAction } from "@/components/kalakriti/public-schedule/schedule-action";
import { ScheduleItem } from "@/components/kalakriti/public-schedule/schedule-item";
import { ScheduleNotFound } from "@/components/kalakriti/public-schedule/schedule-not-found";
import { getKalakritiEditionAccess } from "@/functions/kalakriti-access";
import { getKalakritiPublicSchedule } from "@/functions/kalakriti-public-schedule";
import { getCachedAuth } from "@/lib/auth-cache";
import {
  filterKalakritiPublicSchedule,
  kalakritiPublicScheduleYearSchema,
} from "@/lib/kalakriti-public-schedule";

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
  const [venue, setVenue] = useState("");
  const [ageCategory, setAgeCategory] = useState("");
  const [category, setCategory] = useState("");
  const venueOptions = [
    ...new Set(sessions.map((session) => session.venue)),
  ].sort((a, b) => a.localeCompare(b));
  const ageOptions = [
    ...new Set(sessions.map((session) => session.ageCategory)),
  ].sort((a, b) => a.localeCompare(b));
  const categoryOptions = [
    ...new Set(sessions.map((session) => session.category)),
  ].sort((a, b) => a.localeCompare(b));
  const visibleSessions = filterKalakritiPublicSchedule(sessions, {
    ageCategory,
    category,
    venue,
  });
  const hasFilters = Boolean(venue || ageCategory || category);
  const clearFilters = () => {
    setVenue("");
    setAgeCategory("");
    setCategory("");
  };

  return (
    <main className="bg-background text-foreground min-h-svh">
      <div className="bg-brand/5 border-brand/30 border-b">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
          <KalakritiPageHeader
            actions={
              <ScheduleAction
                eventId={edition.eventId}
                hasKalakritiAccess={scheduleViewer.hasKalakritiAccess}
                isAuthenticated={scheduleViewer.isAuthenticated}
                year={edition.year}
              />
            }
            kicker="Public schedule"
            meta={
              <time className="tabular-nums" dateTime={edition.eventDate}>
                {formatEventDate(edition.eventDate)}
              </time>
            }
            title={edition.name}
            variant="public"
          />
        </div>
      </div>

      <section
        aria-labelledby="competition-schedule-heading"
        className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12"
      >
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2
              className="text-xl font-semibold tracking-tight sm:text-2xl"
              id="competition-schedule-heading"
            >
              Competition schedule
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Times are shown in {edition.timezone}.
            </p>
          </div>
          <p
            className="text-muted-foreground shrink-0 text-sm tabular-nums"
            aria-live="polite"
          >
            {hasFilters ? `${visibleSessions.length} of ` : ""}
            {sessions.length} {sessions.length === 1 ? "Session" : "Sessions"}
          </p>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed px-5 py-12 text-center">
            <p className="font-medium">The schedule is being prepared.</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Please check again closer to the event.
            </p>
          </div>
        ) : (
          <>
            <FieldGroup className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="public-schedule-venue">Venue</FieldLabel>
                <Select
                  onValueChange={(value) => setVenue(value ?? "")}
                  value={venue || null}
                >
                  <SelectTrigger
                    className="min-h-11 w-full sm:min-h-10"
                    id="public-schedule-venue"
                  >
                    <SelectValue placeholder="All Venues" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {venueOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="public-schedule-age">
                  Age Category
                </FieldLabel>
                <Select
                  onValueChange={(value) => setAgeCategory(value ?? "")}
                  value={ageCategory || null}
                >
                  <SelectTrigger
                    className="min-h-11 w-full sm:min-h-10"
                    id="public-schedule-age"
                  >
                    <SelectValue placeholder="All Ages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {ageOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="public-schedule-category">
                  Category
                </FieldLabel>
                <Select
                  onValueChange={(value) => setCategory(value ?? "")}
                  value={category || null}
                >
                  <SelectTrigger
                    className="min-h-11 w-full sm:min-h-10"
                    id="public-schedule-category"
                  >
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {categoryOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <Button
              className="mb-4 min-h-11 sm:min-h-10"
              disabled={!hasFilters}
              onClick={clearFilters}
              size="sm"
              variant="outline"
            >
              Clear filters
            </Button>
            {visibleSessions.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>No matching Sessions</EmptyTitle>
                  <EmptyDescription>
                    Change a filter or clear them to see the full schedule.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ol className="bg-card overflow-hidden rounded-lg border shadow-xs">
                {visibleSessions.map((session, index) => (
                  <ScheduleItem
                    isLast={index === visibleSessions.length - 1}
                    key={`${session.competition}-${session.ageCategory}-${session.startAt}`}
                    session={session}
                    timeFormatter={timeFormatter}
                  />
                ))}
              </ol>
            )}
          </>
        )}
      </section>
    </main>
  );
}
