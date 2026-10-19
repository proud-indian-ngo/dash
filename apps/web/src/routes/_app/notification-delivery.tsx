import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Spinner } from "@pi-dash/design-system/components/ui/spinner";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";
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

import { readSelectEquality } from "@/components/data-table/compile-filter-query";
import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { DeliveryDetailSheet } from "@/components/notification-delivery/delivery-detail-sheet";
import {
  computeDeliveryStats,
  DeliveryTable,
} from "@/components/notification-delivery/delivery-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCards } from "@/components/stats/stats-cards";
import {
  type DeliveryOverview,
  getDeliveryOverview,
  listNotificationDeliveries,
} from "@/functions/notification-delivery";
import type {
  DeliveryRow,
  EmailDeliveryStatus,
  InboxStatus,
  WhatsAppDeliveryStatus,
} from "@/lib/notification-delivery";
import { assertPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/notification-delivery")({
  beforeLoad: ({ context }) =>
    assertPermission(context, "notifications.view_delivery"),
  component: NotificationDeliveryRoute,
  head: () => ({
    meta: [{ title: `Notification delivery | ${env.VITE_APP_NAME}` }],
  }),
});

function logLoadError(action: string, error: unknown) {
  log.error({
    action,
    component: "NotificationDeliveryRoute",
    error: error instanceof Error ? error.message : String(error),
  });
}

function LoadError({ onRetry, what }: { onRetry: () => void; what: string }) {
  return (
    <div
      className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-3 rounded-md border p-4"
      role="alert"
    >
      <div>
        <p className="font-medium">Couldn't load {what}</p>
        <p className="text-muted-foreground text-sm">
          Check your connection and try again.
        </p>
      </div>
      <Button onClick={onRetry} size="sm" variant="outline">
        Retry
      </Button>
    </div>
  );
}

/** The open row: from the page, or loaded on its own for a shared link. */
function useOpenRow(rows: DeliveryRow[]) {
  const [open, setOpen] = useQueryStates({
    message: parseAsString,
    messageTo: parseAsString,
  });
  const onPage =
    rows.find(
      (row) =>
        row.key === open.message && (row.userId ?? null) === open.messageTo
    ) ?? null;
  const [linked, setLinked] = useState<DeliveryRow | null>(null);

  useEffect(() => {
    if (!open.message || onPage) {
      return;
    }
    let cancelled = false;
    listNotificationDeliveries({
      data: {
        key: open.message,
        limit: 1,
        offset: 0,
        userId: open.messageTo ?? undefined,
      },
    })
      .then((page) => {
        if (!cancelled) {
          setLinked(page.rows[0] ?? null);
        }
      })
      .catch((error: unknown) => logLoadError("fetchLinkedDelivery", error));
    return () => {
      cancelled = true;
    };
  }, [onPage, open.message, open.messageTo]);

  const selected =
    onPage ??
    (linked?.key === open.message && linked.userId === open.messageTo
      ? linked
      : null);
  const select = useEventCallback((row: DeliveryRow | null) =>
    setOpen({ message: row?.key ?? null, messageTo: row?.userId ?? null })
  );
  return { isOpen: open.message !== null, select, selected };
}

function NotificationDeliveryRoute() {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [overview, setOverview] = useState<DeliveryOverview | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const { query } = useDataTableFilters();
  const [search] = useQueryState("search", parseAsString.withDefault(""));
  const topic = readSelectEquality(query, "topic");
  const userId = readSelectEquality(query, "recipient");
  const inbox = readSelectEquality(query, "inbox") as InboxStatus | undefined;
  const whatsapp = readSelectEquality(query, "whatsapp") as
    | WhatsAppDeliveryStatus
    | undefined;
  const email = readSelectEquality(query, "email") as
    | EmailDeliveryStatus
    | undefined;
  const [{ pageIndex, pageSize }] = useQueryStates(
    {
      pageIndex: parseAsIndex.withDefault(0),
      pageSize: parseAsInteger.withDefault(20),
    },
    { urlKeys: { pageIndex: "page", pageSize: "size" } }
  );
  const { isOpen, select, selected } = useOpenRow(rows);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadCount re-fetches on Refresh
  useEffect(() => {
    let cancelled = false;
    setOverviewError(false);
    getDeliveryOverview()
      .then((result) => {
        if (!cancelled) {
          setOverview(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          logLoadError("fetchOverview", error);
          setOverviewError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadCount re-fetches on Refresh
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(false);
    listNotificationDeliveries({
      data: {
        email,
        inbox,
        limit: pageSize,
        offset: pageIndex * pageSize,
        search: search || undefined,
        topic,
        userId,
        whatsapp,
      },
    })
      .then((page) => {
        if (!cancelled) {
          setRows(page.rows);
          setTotal(page.total);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        logLoadError("fetchDeliveries", error);
        toast.error("Couldn't load notification delivery");
        setRows([]);
        setTotal(0);
        setLoadError(true);
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
    email,
    inbox,
    pageIndex,
    pageSize,
    reloadCount,
    search,
    topic,
    userId,
    whatsapp,
  ]);

  const reload = useEventCallback(() => setReloadCount((k) => k + 1));
  const closeDetail = useEventCallback((open: boolean) => {
    if (!open) {
      select(null);
    }
  });

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          <Button
            disabled={isLoading}
            onClick={reload}
            type="button"
            variant="outline"
          >
            {isLoading ? (
              <Spinner className="size-4" />
            ) : (
              <HugeiconsIcon
                className="size-4"
                icon={ArrowReloadHorizontalIcon}
                strokeWidth={2}
              />
            )}
            Refresh
          </Button>
        }
        description="How each notification reached each person over the last 90 days, in the inbox, on WhatsApp and by email."
        title="Notification delivery"
      />

      <div className="mt-4 grid gap-6 *:min-w-0">
        {overviewError ? (
          <LoadError onRetry={reload} what="this week's figures" />
        ) : (
          <StatsCards
            isLoading={overview === null}
            items={computeDeliveryStats(overview?.stats ?? null)}
          />
        )}
        {loadError ? (
          <LoadError onRetry={reload} what="notification delivery" />
        ) : (
          <DeliveryTable
            isLoading={isLoading}
            onView={select}
            recipients={overview?.recipients ?? []}
            rowCount={total}
            rows={rows}
          />
        )}
      </div>

      <DeliveryDetailSheet
        onOpenChange={closeDetail}
        open={isOpen}
        row={selected}
      />
    </div>
  );
}
