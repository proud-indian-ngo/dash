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
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import {
  formatAuditLabel,
  getKalakritiAuditViewKey,
  type KalakritiAuditDomain,
  type KalakritiAuditScope,
  resolveKalakritiAuditScope,
} from "@/lib/kalakriti-audit-policy";

interface AuditResponse {
  allowedDomains: KalakritiAuditDomain[];
  items: KalakritiAuditRow[];
  snapshotVersion: string;
  total: number;
}

export const Route = createFileRoute("/_app/kalakriti/$year/audit")({
  beforeLoad: ({ context }) => {
    if (!resolveKalakritiAuditScope(context.kalakritiEditionAccess)) {
      throw notFound();
    }
  },
  component: KalakritiAuditRoute,
});

function KalakritiAuditRoute() {
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const scope = resolveKalakritiAuditScope(access);
  if (!scope) {
    throw notFound();
  }
  const viewKey = getKalakritiAuditViewKey(access);

  return (
    <KalakritiAuditPage
      access={access}
      key={viewKey}
      scope={scope}
      viewKey={viewKey}
    />
  );
}

function KalakritiAuditPage({
  access,
  scope,
  viewKey,
}: {
  access: KalakritiEditionAccess;
  scope: KalakritiAuditScope;
  viewKey: string;
}) {
  const [rows, setRows] = useState<KalakritiAuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resolvedRequestKey, setResolvedRequestKey] = useState<string | null>(
    null
  );
  const snapshotVersionRef = useRef<string | null>(null);
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
  const [isViewReady, setIsViewReady] = useState(pageIndex === 0);
  const requestedDomain = scope.domains.some((value) => value === domain)
    ? domain
    : "";
  const requestKey = `${viewKey}:${requestedDomain}:${pageIndex}:${pageSize}:${refreshKey}`;
  const isLoading = resolvedRequestKey !== requestKey;

  useEffect(() => {
    if (isViewReady) {
      return;
    }
    snapshotVersionRef.current = null;
    let cancelled = false;
    setPagination({ pageIndex: 0 }).then(() => {
      if (!cancelled) {
        setIsViewReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isViewReady, setPagination]);

  useEffect(() => {
    if (domain && !requestedDomain) {
      snapshotVersionRef.current = null;
      setPagination({ pageIndex: 0 });
      setDomain("");
    }
  }, [domain, requestedDomain, setDomain, setPagination]);

  useEffect(() => {
    if (!isViewReady) {
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(pageIndex * pageSize),
      refresh: String(refreshKey),
    });
    if (requestedDomain) {
      params.set("domain", requestedDomain);
    }
    if (snapshotVersionRef.current) {
      params.set("snapshotVersion", snapshotVersionRef.current);
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
        snapshotVersionRef.current = result.snapshotVersion;
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
    pageIndex,
    pageSize,
    refreshKey,
    requestKey,
    requestedDomain,
    isViewReady,
  ]);

  const handleDomainChange = useEventCallback((value: string) => {
    snapshotVersionRef.current = null;
    setPagination({ pageIndex: 0 });
    setDomain(value);
  });
  const handleRefresh = useEventCallback(() => {
    snapshotVersionRef.current = null;
    setPagination({ pageIndex: 0 });
    setRefreshKey((current) => current + 1);
  });
  const handleClearFilters = useEventCallback(() => handleDomainChange(""));

  const domainOptions = scope.domains.map((value) => ({
    label: formatAuditLabel(value),
    value,
  }));

  return (
    <div className="pt-6">
      <Card>
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
          <CardDescription>
            {scope.fullEdition
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
            hasActiveFilters={Boolean(requestedDomain)}
            isLoading={isLoading}
            onClearFilters={handleClearFilters}
            rowCount={total}
            rows={rows}
            timeZone={access.edition.timezone}
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
                value={requestedDomain}
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
