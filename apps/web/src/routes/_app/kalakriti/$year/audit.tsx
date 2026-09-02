import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { getRefCurrent } from "@pi-dash/design-system/hooks/get-ref-current";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { log } from "evlog";
import { parseAsIndex, parseAsInteger, useQueryStates } from "nuqs";
import { useEffect, useRef, useState } from "react";

import {
  readSelectEquality,
  removeFilterPath,
} from "@/components/data-table/compile-filter-query";
import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import {
  type KalakritiAuditRow,
  KalakritiAuditTable,
} from "@/components/kalakriti/audit-table";
import { useMigrateLegacyKalakritiAuditFilterParams } from "@/components/kalakriti/kalakriti-audit-filters";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
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
  useMigrateLegacyKalakritiAuditFilterParams();
  const { query, setQuery } = useDataTableFilters();
  const domain = readSelectEquality(query, "domain") ?? "";
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
  const domainOutOfScope = domain !== "" && requestedDomain === "";
  const requestKey = `${viewKey}:${requestedDomain}:${pageIndex}:${pageSize}:${refreshKey}`;
  const isLoading = resolvedRequestKey !== requestKey;
  const dropOutOfScopeDomain = useEventCallback(() => {
    snapshotVersionRef.current = null;
    setPagination({ pageIndex: 0 });
    setQuery(removeFilterPath(query, "domain"));
  });

  useEffect(() => {
    if (!domainOutOfScope) {
      return;
    }
    dropOutOfScopeDomain();
  }, [domainOutOfScope, dropOutOfScopeDomain]);

  useEffect(() => {
    if (isViewReady) {
      return;
    }
    snapshotVersionRef.current = null;
    let cancelled = false;
    const resetPagination = async () => {
      try {
        await setPagination({ pageIndex: 0 });
        if (!cancelled) {
          setIsViewReady(true);
        }
      } catch (caughtError) {
        if (!cancelled) {
          log.error({
            action: "resetPagination",
            component: "KalakritiAuditPage",
            error:
              caughtError instanceof Error
                ? caughtError.message
                : String(caughtError),
          });
          setError("Audit entries could not be loaded.");
        }
      }
    };
    resetPagination();
    return () => {
      cancelled = true;
    };
  }, [isViewReady, setPagination]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset snapshot when the domain chip changes
  useEffect(() => {
    snapshotVersionRef.current = null;
  }, [requestedDomain]);

  useEffect(() => {
    if (!isViewReady || domainOutOfScope) {
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
    const snapshotVersion = getRefCurrent(snapshotVersionRef);
    if (snapshotVersion) {
      params.set("snapshotVersion", snapshotVersion);
    }
    const loadAudit = async () => {
      try {
        const response = await fetch(
          `/api/kalakriti/${access.edition.year}/audit?${params.toString()}`
        );
        if (!response.ok) {
          throw new Error(`Audit request failed with ${response.status}`);
        }
        const result = (await response.json()) as AuditResponse;
        if (cancelled) {
          return;
        }
        setRows(result.items);
        setTotal(result.total);
        snapshotVersionRef.current = result.snapshotVersion;
        setError(null);
        setResolvedRequestKey(requestKey);
      } catch (caughtError) {
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
      }
    };
    loadAudit();
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
    domainOutOfScope,
  ]);

  const handleRefresh = useEventCallback(() => {
    snapshotVersionRef.current = null;
    setPagination({ pageIndex: 0 });
    setRefreshKey((current) => current + 1);
  });

  const domainOptions = scope.domains.map((value) => ({
    label: formatAuditLabel(value),
    value,
  }));

  return (
    <div className="space-y-4">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${access.edition.year}`}
        title="Audit"
      />
      {error && !isLoading ? (
        <div className="border-destructive/30 bg-destructive/5 flex flex-wrap items-center justify-between gap-3 border p-3">
          <p role="alert">{error}</p>
          <Button onClick={handleRefresh} size="sm" variant="outline">
            Retry
          </Button>
        </div>
      ) : null}
      <KalakritiAuditTable
        domainOptions={domainOptions}
        isLoading={isLoading}
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
      />
    </div>
  );
}
