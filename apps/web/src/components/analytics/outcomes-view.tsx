import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { OutcomeLine } from "@pi-dash/shared/outcomes";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { endOfDay, startOfDay } from "date-fns";
import { log } from "evlog";
import {
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { type ReactNode, useEffect, useState } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { NotFoundState } from "@/components/shared/not-found-state";
import { useApp } from "@/context/app-context";
import { getOutcomes } from "@/functions/outcomes";
import type { DateRange } from "@/lib/date-range";
import { formatPaiseCompact } from "@/lib/paise";

type Outcomes = Awaited<ReturnType<typeof getOutcomes>>;

const BREAKDOWNS = ["programme", "team"] as const;
const ALL = "all";
const SKELETON = <Skeleton className="h-5 w-16" />;

const outcomeFilterParams = {
  programme: parseAsString,
  team: parseAsString,
};

const number = (value: number) => value.toLocaleString("en-IN");
const hours = (value: number) =>
  value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
/** Whole rupees: volunteer time is an estimate, not an amount to the paisa. */
const rupees = (paise: number) =>
  formatPaiseCompact(Math.round(paise / 100) * 100);

const eventCount = (count: number) =>
  count === 1 ? "1 event" : `${number(count)} events`;

function useOutcomes(filters: {
  costCentreId: string | null;
  from: string | null;
  programmeId: string | null;
  teamId: string | null;
  to: string | null;
}) {
  const load = useServerFn(getOutcomes);
  // Each result remembers the filters it answers, so figures for the old
  // filters never show under the new ones while the next load runs.
  const [loaded, setLoaded] = useState<{
    key: string;
    outcomes: Outcomes;
  } | null>(null);
  // Like results, a failure belongs to the filters it was for: changing them
  // shows loading, not the old error.
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { costCentreId, from, programmeId, teamId, to } = filters;
  const key = JSON.stringify([costCentreId, from, programmeId, teamId, to]);
  useEffect(() => {
    let cancelled = false;
    load({ data: { costCentreId, from, programmeId, teamId, to } })
      .then((outcomes) => {
        if (!cancelled) {
          setLoaded({ key, outcomes });
          setFailedKey(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFailedKey(key);
        }
        log.error({
          action: "analytics.outcomes",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "OutcomesView",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, costCentreId, from, key, load, programmeId, teamId, to]);
  const retry = useEventCallback(() => {
    setFailedKey(null);
    setAttempt((n) => n + 1);
  });
  return {
    failed: failedKey === key,
    retry,
    // Filter options don't depend on the filters, so the last ones stay.
    options: loaded?.outcomes,
    result: loaded?.key === key ? loaded.outcomes : null,
  };
}

function OutcomeTile({
  caption,
  label,
  value,
}: {
  caption: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="flex min-w-0 flex-col gap-1 rounded-xl border p-4"
      data-slot="outcome-tile"
    >
      <h2 className="text-muted-foreground text-sm">{label}</h2>
      <p
        className="font-display text-2xl font-semibold tabular-nums"
        data-slot="outcome-value"
      >
        {value}
      </p>
      <p className="text-muted-foreground text-xs">{caption}</p>
    </section>
  );
}

function FilterSelect({
  allLabel,
  label,
  onChange,
  options,
  value,
}: {
  allLabel: string;
  label: string;
  onChange: (value: string | null) => void;
  options: readonly { id: string; name: string }[];
  value: string | null;
}) {
  const handleChange = useEventCallback((next: string | null) =>
    onChange(next === ALL ? null : next)
  );
  return (
    <Select onValueChange={handleChange} value={value ?? ALL}>
      <SelectTrigger aria-label={label} className="h-8 max-w-56">
        <SelectValue>
          {options.find((o) => o.id === value)?.name ?? allLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function gapsLabel(line: OutcomeLine): string {
  const parts = [
    line.withoutRecap > 0 ? `${number(line.withoutRecap)} without recap` : null,
    line.withoutAttendance > 0
      ? `${number(line.withoutAttendance)} without attendance`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function CoverageNotes({ totals }: { totals: OutcomeLine }) {
  const notes = [
    totals.withoutRecap > 0
      ? `${eventCount(totals.withoutRecap)} without a social recap: their children aren't counted.`
      : null,
    totals.withoutAttendance > 0
      ? `${eventCount(totals.withoutAttendance)} without attendance marked: their volunteer hours aren't counted.`
      : null,
    totals.withoutEndTime > 0
      ? `${eventCount(totals.withoutEndTime)} without an end time: they add no hours.`
      : null,
  ].filter((note): note is string => note !== null);
  if (totals.events === 0) {
    return null;
  }
  return (
    <ul
      aria-label="Coverage"
      className="text-muted-foreground flex flex-col gap-0.5 text-sm"
    >
      {notes.length === 0 ? (
        <li>Every event in this period has a recap and attendance.</li>
      ) : (
        notes.map((note) => <li key={note}>{note}</li>)
      )}
    </ul>
  );
}

/**
 * Analytics → Outcomes: children reached and volunteer time over held events,
 * with coverage notes and a breakdown by programme or team. The rules are in
 * docs/architecture/finance-and-programmes.md#outcomes.
 */
export function OutcomesView({
  costCentreId,
  dateRange,
}: {
  costCentreId: string | null;
  dateRange: DateRange;
}) {
  const { hasPermission } = useApp();
  const [filters, setFilters] = useQueryStates(outcomeFilterParams);
  const [breakdown, setBreakdown] = useQueryState(
    "by",
    parseAsStringLiteral(BREAKDOWNS).withDefault("programme")
  );
  const { failed, options, result, retry } = useOutcomes({
    costCentreId,
    from: dateRange.from ? startOfDay(dateRange.from).toISOString() : null,
    programmeId: filters.programme,
    teamId: filters.team,
    to: dateRange.to ? endOfDay(dateRange.to).toISOString() : null,
  });

  const setProgramme = useEventCallback((programme: string | null) =>
    setFilters({ programme })
  );
  const setTeam = useEventCallback((team: string | null) =>
    setFilters({ team })
  );
  const handleBreakdown = useEventCallback((value: unknown) =>
    setBreakdown(value as (typeof BREAKDOWNS)[number])
  );
  const getRowId = useEventCallback((line: OutcomeLine) => line.key);
  const searchLine = useEventCallback((line: OutcomeLine, query: string) =>
    line.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect
        allLabel="All programmes"
        label="Programme"
        onChange={setProgramme}
        options={options?.programmes ?? []}
        value={filters.programme}
      />
      <FilterSelect
        allLabel="All teams"
        label="Team"
        onChange={setTeam}
        options={options?.teams ?? []}
        value={filters.team}
      />
    </div>
  );

  if (failed) {
    return (
      <div className="flex flex-col gap-4">
        {filterBar}
        <NotFoundState
          actions={
            <Button onClick={retry} type="button" variant="outline">
              Try again
            </Button>
          }
          description="Outcomes couldn't load for these filters."
          icon={Calendar03Icon}
          role="alert"
          title="Outcomes unavailable"
        />
      </div>
    );
  }

  const summary = result?.summary;
  const totals = summary?.totals;
  const hourValue = summary?.hourValuePaise ?? null;
  const loading = <Skeleton className="my-1 h-6 w-20" />;
  const canSetValue = hasPermission("finance.manage");

  let valueContent: ReactNode = loading;
  if (totals && totals.valuePaise !== null) {
    valueContent = rupees(totals.valuePaise);
  } else if (totals) {
    valueContent = canSetValue ? (
      <Link
        className="text-sm font-medium underline underline-offset-4 sm:text-base"
        to="/settings/programmes"
      >
        Set an hourly value
      </Link>
    ) : (
      <span className="text-muted-foreground text-sm font-medium sm:text-base">
        No hourly value set
      </span>
    );
  }

  const valueColumn: DataGridColumnDef<OutcomeLine> = {
    accessorFn: (line) => line.valuePaise,
    cell: ({ row }) => rupees(row.original.valuePaise ?? 0),
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Value" visibility={true} />
    ),
    id: "value",
    meta: { headerTitle: "Value", kind: "amount", skeleton: SKELETON },
    size: 130,
  };
  const lines =
    (breakdown === "team" ? summary?.byTeam : summary?.byProgramme) ?? [];
  const columns: DataGridColumnDef<OutcomeLine>[] = [
    {
      accessorFn: (line) => line.name,
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title={breakdown === "team" ? "Team" : "Programme"}
          visibility={true}
        />
      ),
      id: "name",
      meta: {
        compact: "primary",
        headerTitle: "Name",
        skeleton: <Skeleton className="h-5 w-40" />,
      },
      size: 240,
    },
    {
      accessorFn: (line) => line.events,
      cell: ({ row }) => number(row.original.events),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Events"
          visibility={true}
        />
      ),
      id: "events",
      meta: { headerTitle: "Events", kind: "count", skeleton: SKELETON },
      size: 100,
    },
    {
      accessorFn: (line) => line.children,
      cell: ({ row }) => number(row.original.children),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Children"
          visibility={true}
        />
      ),
      id: "children",
      meta: {
        compact: "trailing",
        headerTitle: "Children",
        kind: "count",
        skeleton: SKELETON,
      },
      size: 110,
    },
    {
      accessorFn: (line) => line.volunteerHours,
      cell: ({ row }) => hours(row.original.volunteerHours),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Volunteer hours"
          visibility={true}
        />
      ),
      id: "hours",
      meta: {
        headerTitle: "Volunteer hours",
        kind: "count",
        skeleton: SKELETON,
      },
      size: 150,
    },
    ...(hourValue === null ? [] : [valueColumn]),
    {
      accessorFn: (line) => line.withoutRecap + line.withoutAttendance,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{gapsLabel(row.original)}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Not recorded"
          visibility={true}
        />
      ),
      id: "gaps",
      meta: { headerTitle: "Not recorded", skeleton: SKELETON },
      size: 220,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {filterBar}

      <div className="grid grid-cols-2 gap-3 *:min-w-0 lg:grid-cols-4">
        <OutcomeTile
          caption="Past sessions, not cancelled"
          label="Events held"
          value={totals ? number(totals.events) : loading}
        />
        <OutcomeTile
          caption="Child contacts: a child at weekly classes counts each time"
          label="Children reached"
          value={totals ? number(totals.children) : loading}
        />
        <OutcomeTile
          caption="Present volunteers × session length"
          label="Volunteer hours"
          value={totals ? hours(totals.volunteerHours) : loading}
        />
        <OutcomeTile
          caption={
            hourValue === null
              ? "For reports only, never posted to the books"
              : `At ${formatPaiseCompact(hourValue)} an hour, never posted to the books`
          }
          label="Value of volunteer time"
          value={valueContent}
        />
      </div>

      {totals ? <CoverageNotes totals={totals} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Breakdown</h2>
        <Tabs onValueChange={handleBreakdown} value={breakdown}>
          <TabsList>
            <TabsTrigger value="programme">By programme</TabsTrigger>
            <TabsTrigger value="team">By team</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <DataTableWrapper<OutcomeLine>
        columns={columns}
        compactOnMobile
        data={lines}
        emptyMessage="No events held in this period."
        getRowId={getRowId}
        isLoading={!result}
        searchFn={searchLine}
        searchPlaceholder="Search..."
        searchQueryKey="outcomeSearch"
        storageKey="analytics_outcomes_table_state_v1"
        tableLayout={{ columnsResizable: true, columnsVisibility: true }}
      />
    </div>
  );
}
