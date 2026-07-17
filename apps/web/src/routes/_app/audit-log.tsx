import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { log } from "evlog";
import {
  parseAsIndex,
  parseAsInteger,
  parseAsString,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { AuditDetailSheet } from "@/components/audit/audit-detail-sheet";
import { AuditLogTable } from "@/components/audit/audit-log-table";
import type {
  AuditLogResponse,
  AuditLogRow,
} from "@/components/audit/audit-types";
import { TableFilterSelect } from "@/components/data-table/table-filter-select";
import { ISO_DATE } from "@/lib/date-formats";
import { dateRangeSearchParams, resolveDateRange } from "@/lib/date-range";
import { assertPermission } from "@/lib/route-guards";

const OUTCOME_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Success", value: "success" },
  { label: "Denied", value: "denied" },
  { label: "Failure", value: "failure" },
];

export const Route = createFileRoute("/_app/audit-log")({
  beforeLoad: ({ context }) => assertPermission(context, "audit_log.view"),
  component: AuditLogRoute,
  head: () => ({ meta: [{ title: `Audit Log | ${env.VITE_APP_NAME}` }] }),
});

function AuditLogRoute() {
  const [entries, setEntries] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<AuditLogResponse["facets"]>({
    actions: [],
    targetTypes: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [selected, setSelected] = useState<AuditLogRow | null>(null);
  const [search] = useQueryState("search", parseAsString.withDefault(""));
  const [action, setAction] = useQueryState(
    "action",
    parseAsString.withDefault("")
  );
  const [outcome, setOutcome] = useQueryState(
    "outcome",
    parseAsString.withDefault("")
  );
  const [targetType, setTargetType] = useQueryState(
    "targetType",
    parseAsString.withDefault("")
  );
  const [dateParams, setDateParams] = useQueryStates(dateRangeSearchParams);
  const [{ pageIndex, pageSize }, setPagination] = useQueryStates(
    {
      pageIndex: parseAsIndex.withDefault(0),
      pageSize: parseAsInteger.withDefault(20),
    },
    { urlKeys: { pageIndex: "page", pageSize: "size" } }
  );

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(pageIndex * pageSize),
    });
    if (search) {
      params.set("search", search);
    }
    if (action) {
      params.set("action", action);
    }
    if (outcome) {
      params.set("outcome", outcome);
    }
    if (targetType) {
      params.set("targetType", targetType);
    }
    const range = resolveDateRange(
      dateParams.range,
      dateParams.from,
      dateParams.to
    );
    if (range.from) {
      params.set("from", format(range.from, ISO_DATE));
    }
    if (range.to) {
      params.set("to", format(range.to, ISO_DATE));
    }

    setIsLoading(true);
    setLoadError(false);
    fetch(`/api/audit-log?${params.toString()}`, {
      cache: reloadCount > 0 ? "no-store" : "default",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch audit log: ${response.status}`);
        }
        return (await response.json()) as AuditLogResponse;
      })
      .then((data) => {
        if (!cancelled) {
          setEntries(data.entries);
          setFacets(data.facets);
          setTotal(data.total);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          log.error({
            action: "fetchAuditLog",
            component: "AuditLogRoute",
            error: error instanceof Error ? error.message : String(error),
          });
          setEntries([]);
          setTotal(0);
          setLoadError(true);
          toast.error("Couldn't load the audit log");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    action,
    dateParams.from,
    dateParams.range,
    dateParams.to,
    outcome,
    pageIndex,
    pageSize,
    reloadCount,
    search,
    targetType,
  ]);

  const resetPage = useEventCallback(() => setPagination({ pageIndex: 0 }));
  const changeAction = useEventCallback((value: string) => {
    resetPage();
    setAction(value);
  });
  const changeOutcome = useEventCallback((value: string) => {
    resetPage();
    setOutcome(value);
  });
  const changeTargetType = useEventCallback((value: string) => {
    resetPage();
    setTargetType(value);
  });
  const clearFilters = useEventCallback(() => {
    resetPage();
    setAction("");
    setOutcome("");
    setTargetType("");
    setDateParams({ from: "", range: "all", to: "" });
  });
  const viewEntry = useEventCallback((entry: AuditLogRow) =>
    setSelected(entry)
  );
  const closeDetail = useEventCallback((open: boolean) => {
    if (!open) {
      setSelected(null);
    }
  });
  const retryLoad = useEventCallback(() =>
    setReloadCount((count) => count + 1)
  );

  const hasActiveFilters = Boolean(
    action || outcome || targetType || dateParams.range !== "all"
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Audit Log
      </h1>
      <div className="mt-4">
        {loadError ? (
          <div
            className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4"
            role="alert"
          >
            <div>
              <p className="font-medium">Couldn't load the audit log</p>
              <p className="text-muted-foreground text-sm">
                Check your connection and try again.
              </p>
            </div>
            <Button onClick={retryLoad} size="sm" variant="outline">
              Retry
            </Button>
          </div>
        ) : (
          <AuditLogTable
            entries={entries}
            hasActiveFilters={hasActiveFilters}
            isLoading={isLoading}
            onClearFilters={clearFilters}
            onView={viewEntry}
            rowCount={total}
            toolbarFilters={
              <>
                <TableFilterSelect
                  label="Outcome"
                  onChange={changeOutcome}
                  options={OUTCOME_OPTIONS}
                  value={outcome}
                />
                <TableFilterSelect
                  label="Action"
                  onChange={changeAction}
                  options={facets.actions.map((value) => ({
                    label: value,
                    value,
                  }))}
                  value={action}
                />
                <TableFilterSelect
                  label="Target"
                  onChange={changeTargetType}
                  options={facets.targetTypes.map((value) => ({
                    label: value,
                    value,
                  }))}
                  value={targetType}
                />
                <DateRangeFilter onChange={resetPage} />
              </>
            }
          />
        )}
      </div>
      <AuditDetailSheet
        entry={selected}
        onOpenChange={closeDetail}
        open={!!selected}
      />
    </div>
  );
}
