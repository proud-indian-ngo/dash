import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { GOVERNANCE_PAGE_PERMISSIONS } from "@pi-dash/shared/governance";
import { MEETING_MODE_LABELS } from "@pi-dash/shared/meetings";
import { queries } from "@pi-dash/zero/queries";
import type { Meeting } from "@pi-dash/zero/schema";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";
import { uuidv7 } from "uuidv7";

import {
  formatMeetingTime,
  meetingDay,
  meetingDayHeading,
} from "@/components/governance/meeting-data";
import { MeetingFormDialog } from "@/components/governance/meeting-form-dialog";
import { MeetingStatusBadge } from "@/components/governance/meeting-status";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/page-skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { useIndiaToday } from "@/hooks/use-india-today";
import { preloadRouteQuery } from "@/lib/route-preload";

export const Route = createFileRoute("/_app/governance/meetings/")({
  loader: ({ abortController, context }) => {
    const canSee = GOVERNANCE_PAGE_PERMISSIONS.some((permission) =>
      context.permissions.includes(permission)
    );
    preloadRouteQuery(
      context.zero,
      canSee ? queries.meeting.all() : queries.meeting.mine(),
      abortController.signal
    );
  },
  component: MeetingsPage,
  head: () => ({
    meta: [{ title: `Board meetings | ${env.VITE_APP_NAME}` }],
  }),
});

const WHEN_VALUES = ["upcoming", "past"] as const;

type MeetingRow = Meeting & { agenda: readonly unknown[] };

/** A meeting stays upcoming until its day is over; an undated draft is always upcoming. */
function isUpcoming(row: MeetingRow, today: string): boolean {
  return row.startsAt === null || meetingDay(row.startsAt) >= today;
}

/** What a meeting that has started is still waiting for. */
function pendingStep(row: MeetingRow, now: number): string | null {
  if (row.status === "held" && !row.minutesDocumentId) {
    return "Minutes not signed";
  }
  if (
    row.status === "convened" &&
    row.startsAt !== null &&
    row.startsAt < now
  ) {
    return "Not recorded yet";
  }
  return null;
}

function groupByDay(rows: readonly MeetingRow[]) {
  const groups = new Map<string, MeetingRow[]>();
  for (const row of rows) {
    const key = row.startsAt === null ? "" : meetingDay(row.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()];
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function MeetingListRow({ now, row }: { now: number; row: MeetingRow }) {
  const pending = pendingStep(row, now);
  return (
    // Phones move the badges under the facts, as the events agenda does, so
    // they don't squeeze the title to a letter per line.
    <li className="hover:bg-muted/50 relative grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 px-3 py-2.5 transition-colors sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-4">
      <div className="pt-px text-sm font-medium tabular-nums">
        {row.startsAt === null ? (
          <span className="text-muted-foreground">No date</span>
        ) : (
          formatMeetingTime(row.startsAt)
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          className="min-w-0 text-sm font-medium wrap-break-word after:absolute after:inset-0 hover:underline sm:truncate"
          params={{ meetingId: row.id }}
          to="/governance/meetings/$meetingId"
        >
          {row.title}
        </Link>
        <div className="text-muted-foreground flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs">
          <span className="wrap-break-word sm:truncate">
            {row.place || MEETING_MODE_LABELS[row.mode ?? "hybrid"]}
          </span>
          <span>{plural(row.agenda.length, "agenda item")}</span>
        </div>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto sm:justify-end sm:self-center">
        {pending ? <StatusBadge tone="warning">{pending}</StatusBadge> : null}
        <MeetingStatusBadge status={row.status ?? "draft"} />
      </div>
    </li>
  );
}

function MeetingsPage() {
  const { hasPermission } = useApp();
  const canSee =
    hasPermission("governance.view") || hasPermission("governance.manage");
  const canManage = hasPermission("governance.manage");
  const [all, allResult] = useQuery(queries.meeting.all(), {
    enabled: canSee,
  });
  const [mine, mineResult] = useQuery(queries.meeting.mine(), {
    enabled: !canSee,
  });
  const rows: readonly MeetingRow[] = canSee ? all : mine;
  const isLoading =
    rows.length === 0 &&
    (canSee ? allResult.type : mineResult.type) !== "complete";
  const navigate = useNavigate();
  const [creating, setCreating] = useState<string | null>(null);
  const [when, setWhen] = useQueryState(
    "when",
    parseAsStringLiteral(WHEN_VALUES).withDefault("upcoming")
  );
  const [search, setSearch] = useQueryState("s", parseAsString.withDefault(""));
  const [now] = useState(() => Date.now());
  const today = useIndiaToday();

  const query = search.trim().toLowerCase();
  const matching = rows.filter((row) =>
    [row.title, row.place ?? ""].join(" ").toLowerCase().includes(query)
  );
  const upcoming = matching
    .filter((row) => isUpcoming(row, today))
    .sort(
      (a, b) =>
        (a.startsAt ?? Number.POSITIVE_INFINITY) -
        (b.startsAt ?? Number.POSITIVE_INFINITY)
    );
  const past = matching
    .filter((row) => !isUpcoming(row, today))
    .sort((a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0));
  const visible = when === "upcoming" ? upcoming : past;
  const otherCount = when === "upcoming" ? past.length : upcoming.length;

  const openCreate = useEventCallback(() => setCreating(uuidv7()));
  const handleCreated = useEventCallback((id: string) => {
    setCreating(null);
    navigate({
      params: { meetingId: id },
      to: "/governance/meetings/$meetingId",
    });
  });
  const handleWhenChange = useEventCallback((value: unknown) =>
    setWhen(value === "past" ? "past" : null)
  );
  const switchTab = useEventCallback(() =>
    setWhen(when === "upcoming" ? "past" : null)
  );
  const handleSearch = useEventCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setSearch(event.target.value || null)
  );
  const handleCreateOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setCreating(null);
    }
  });

  let emptyText =
    when === "upcoming" ? "No upcoming meetings." : "No past meetings.";
  if (rows.length === 0) {
    emptyText = canSee
      ? "No meetings yet."
      : "You haven't been given notice of a meeting.";
  }

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          canManage ? (
            <Button onClick={openCreate} type="button">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              New meeting
            </Button>
          ) : null
        }
        description="Meetings of the Board: notice and agenda, attendance, the vote on each resolution under the deed in force that day, and minutes signed by the chair."
        title="Board meetings"
      />
      <div className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4 md:border-b">
          <Tabs
            className="border-b md:border-b-0"
            onValueChange={handleWhenChange}
            value={when}
          >
            <TabsList className="h-9 gap-4 px-0" variant="line">
              <TabsTrigger className="flex-none px-0" value="upcoming">
                Upcoming
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {upcoming.length}
                </span>
              </TabsTrigger>
              <TabsTrigger className="flex-none px-0" value="past">
                Past
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {past.length}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-1 items-center md:justify-end md:pb-1">
            <Input
              aria-label="Search meetings"
              className="h-8 min-w-40 flex-1 md:w-56 md:flex-none"
              onChange={handleSearch}
              placeholder="Search meetings..."
              type="search"
              value={search}
            />
          </div>
        </div>

        {isLoading ? <TableSkeleton rows={3} /> : null}

        {!isLoading && visible.length > 0 ? (
          <ul className="overflow-hidden rounded-lg border">
            {groupByDay(visible).map(([day, dayRows]) => (
              <li className="[&:last-child>ul]:border-b-0" key={day}>
                <h2 className="bg-muted/60 text-muted-foreground border-b px-3 py-1.5 text-xs font-medium sm:px-4">
                  {dayRows[0]?.startsAt
                    ? meetingDayHeading(dayRows[0].startsAt, today)
                    : "Date not set"}
                </h2>
                <ul className="divide-y border-b">
                  {dayRows.map((row) => (
                    <MeetingListRow key={row.id} now={now} row={row} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}

        {!isLoading && visible.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
            <p>{emptyText}</p>
            {otherCount > 0 ? (
              <Button onClick={switchTab} size="sm" variant="outline">
                Show{" "}
                {plural(
                  otherCount,
                  when === "upcoming" ? "past meeting" : "upcoming meeting"
                )}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {creating ? (
        <MeetingFormDialog
          initial={{ mode: "hybrid", place: null, startsAt: null, title: "" }}
          meetingId={creating}
          mode="create"
          onOpenChange={handleCreateOpenChange}
          onSaved={handleCreated}
          open
        />
      ) : null}
    </div>
  );
}
