import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { log } from "evlog";
import {
  parseAsIndex,
  parseAsInteger,
  parseAsString,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { useEffect, useRef, useState } from "react";
import { TableFilterSelect } from "@/components/data-table/table-filter-select";
import {
  type KalakritiAuditRow,
  KalakritiAuditTable,
} from "@/components/kalakriti/audit-table";
import {
  formatAuditLabel,
  type KalakritiAuditDomain,
  resolveKalakritiAuditScope,
} from "@/lib/kalakriti-audit-policy";

interface AuditResponse {
  allowedDomains: KalakritiAuditDomain[];
  items: KalakritiAuditRow[];
  snapshot: null | { createdAt: string; id: string };
  total: number;
}

export const Route = createFileRoute("/_app/kalakriti/$year/audit")({
  beforeLoad: ({ context }) => {
    if (!resolveKalakritiAuditScope(context.kalakritiEditionAccess)) {
      throw notFound();
    }
  },
  component: KalakritiAuditPage,
});

function KalakritiAuditPage() {
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const scope = resolveKalakritiAuditScope(access);
  const hasScope = scope !== null;
  const [rows, setRows] = useState<KalakritiAuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resolvedRequestKey, setResolvedRequestKey] = useState<string | null>(
    null
  );
  const snapshotRef = useRef<AuditResponse["snapshot"]>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [domain, setDomain] = useQueryState(
    "auditDomain",
    parseAsString.withDefault("")
  );
  const [{ pageIndex, pageSize }, setPagination] = useQueryStates(
    {
      pageIndex: parseAsIndex.withDefault(0),
      pageSize: parseAsInteger.withDefault(25),
    },
    { urlKeys: { pageIndex: "page", pageSize: "size" } }
  );
  const requestKey = `${domain}:${pageIndex}:${pageSize}:${refreshKey}`;
  const isLoading = resolvedRequestKey !== requestKey;

  useEffect(() => {
    if (!hasScope) {
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(pageIndex * pageSize),
      refresh: String(refreshKey),
    });
    if (domain) {
      params.set("domain", domain);
    }
    if (snapshotRef.current) {
      params.set("snapshotAt", snapshotRef.current.createdAt);
      params.set("snapshotId", snapshotRef.current.id);
    }
    fetch(`/api/kalakriti/${access.edition.year}/audit?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Audit request failed with ${response.status}`);
        }
        return (await response.json()) as AuditResponse;
      })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setRows(result.items);
        setTotal(result.total);
        snapshotRef.current = result.snapshot;
        setError(null);
        setResolvedRequestKey(requestKey);
      })
      .catch((caughtError: unknown) => {
        if (cancelled) {
          return;
        }
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Audit entries could not be loaded";
        log.error({
          action: "loadAudit",
          component: "KalakritiAuditPage",
          editionId: access.edition.id,
          error: message,
        });
        setRows([]);
        setTotal(0);
        setError("Audit entries could not be loaded.");
        setResolvedRequestKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [
    access.edition.id,
    access.edition.year,
    domain,
    pageIndex,
    pageSize,
    refreshKey,
    requestKey,
    hasScope,
  ]);

  const handleDomainChange = useEventCallback((value: string) => {
    snapshotRef.current = null;
    setPagination({ pageIndex: 0 });
    setDomain(value);
  });
  const handleRefresh = useEventCallback(() => {
    snapshotRef.current = null;
    setPagination({ pageIndex: 0 });
    setRefreshKey((current) => current + 1);
  });
  const handleClearFilters = useEventCallback(() => handleDomainChange(""));

  const domainOptions = scope
    ? scope.domains.map((value) => ({
        label: formatAuditLabel(value),
        value,
      }))
    : [];

  return (
    <div className="pt-6">
      <Card>
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
          <CardDescription>
            {scope?.fullEdition
              ? "Review security-sensitive changes across this Edition."
              : "Review changes within your assigned Kalakriti domain."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && !isLoading ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p role="alert">{error}</p>
              <Button onClick={handleRefresh} size="sm" variant="outline">
                Retry
              </Button>
            </div>
          ) : null}
          <KalakritiAuditTable
            hasActiveFilters={Boolean(domain)}
            isLoading={isLoading}
            onClearFilters={handleClearFilters}
            rowCount={total}
            rows={rows}
            toolbarActions={
              <Button onClick={handleRefresh} size="sm" variant="outline">
                <HugeiconsIcon
                  className="size-4"
                  icon={ArrowReloadHorizontalIcon}
                  strokeWidth={2}
                />
                Refresh
              </Button>
            }
            toolbarFilters={
              <TableFilterSelect
                label="Domain"
                onChange={handleDomainChange}
                options={domainOptions}
                value={domain}
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
