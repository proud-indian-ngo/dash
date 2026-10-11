import {
  ArrowRight01Icon,
  Camera01Icon,
  CheckListIcon,
  Invoice01Icon,
  MoneyReceiveSquareIcon,
  Notification01Icon,
  Store01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { cn } from "@pi-dash/design-system/lib/utils";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import type { ReactNode } from "react";

import { Tag } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/form-schemas";
import { sumAmounts } from "@/lib/stats";

/** Waits longer than this are flagged in the warning tone. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** Event names listed in a row before "and N more". */
const MAX_EVENT_NAMES = 2;

// --- Types ---

interface FinancialPendingItem {
  createdAt: number;
  id: string;
  lineItems: readonly { amount: string | number }[];
  title: string;
  user?: { name: string | null } | undefined;
}

interface VendorPaymentPendingItem {
  createdAt: number;
  id: string;
  lineItems: readonly { amount: string | number }[];
  title: string;
  vendor?: { name: string } | undefined;
}

interface EventPhotoPendingItem {
  createdAt: number;
  event?: { id: string; name: string } | undefined;
  id: string;
  uploader?: { name: string | null } | undefined;
}

interface EventUpdatePendingItem {
  author?: { name: string | null } | undefined;
  createdAt: number;
  event?: { id: string; name: string } | undefined;
  id: string;
}

interface EventInterestPendingItem {
  createdAt: number;
  event?: { id: string; name: string } | undefined;
  id: string;
  user?: { name: string | null } | undefined;
}

export interface PendingReviewsProps {
  advancePayments: readonly FinancialPendingItem[];
  eventInterests: readonly EventInterestPendingItem[];
  eventPhotos: readonly EventPhotoPendingItem[];
  eventUpdates: readonly EventUpdatePendingItem[];
  isLoading?: boolean;
  permissions: {
    canApproveRequests: boolean;
    canManageInterest: boolean;
    canManagePhotos: boolean;
    canApproveUpdates: boolean;
  };
  reimbursements: readonly FinancialPendingItem[];
  vendorPayments: readonly VendorPaymentPendingItem[];
}

// --- Event grouping helpers ---

interface EventGroup {
  count: number;
  eventId: string;
  eventName: string;
  latestAt: number;
  latestPerson: string;
}

function groupByEvent<
  T extends {
    createdAt: number;
    event?: { id: string; name: string } | undefined;
  },
>(items: readonly T[], personAccessor: (item: T) => string): EventGroup[] {
  const map = new Map<
    string,
    { count: number; eventName: string; latestAt: number; latestPerson: string }
  >();

  for (const item of items) {
    if (!item.event) {
      continue;
    }
    const existing = map.get(item.event.id);
    if (existing) {
      existing.count += 1;
      if (item.createdAt > existing.latestAt) {
        existing.latestAt = item.createdAt;
        existing.latestPerson = personAccessor(item);
      }
    } else {
      map.set(item.event.id, {
        count: 1,
        eventName: item.event.name,
        latestAt: item.createdAt,
        latestPerson: personAccessor(item),
      });
    }
  }

  return [...map.entries()]
    .map(([eventId, data]) => ({ eventId, ...data }))
    .sort((a, b) => b.latestAt - a.latestAt);
}

// --- Counting ---

/**
 * Items the person can review, counted the way the panel shows them. The
 * dashboard's "Waiting for you" chip uses this so the two always agree.
 */
export function countPendingReviews({
  advancePayments,
  eventInterests,
  eventPhotos,
  eventUpdates,
  permissions,
  reimbursements,
  vendorPayments,
}: Omit<PendingReviewsProps, "isLoading">): number {
  return (
    (permissions.canApproveRequests
      ? reimbursements.length + advancePayments.length + vendorPayments.length
      : 0) +
    (permissions.canManagePhotos ? eventPhotos.length : 0) +
    (permissions.canApproveUpdates ? eventUpdates.length : 0) +
    (permissions.canManageInterest ? eventInterests.length : 0)
  );
}

function oldest(items: readonly { createdAt: number }[]): number {
  return Math.min(...items.map((item) => item.createdAt));
}

function eventNames(groups: readonly EventGroup[]): string {
  const names = groups.slice(0, MAX_EVENT_NAMES).map((g) => g.eventName);
  const more = groups.length - names.length;
  return more > 0 ? `${names.join(", ")} and ${more} more` : names.join(", ");
}

// --- Skeleton ---

function PendingReviewsSkeleton() {
  return (
    <div className="divide-y">
      {[1, 2, 3].map((i) => (
        <div className="flex items-center gap-3 px-4 py-3" key={i}>
          <Skeleton className="size-4 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

// --- Queue row ---

interface QueueRowProps {
  count: number;
  icon: IconSvgElement;
  label: string;
  link: ReactNode;
  oldestAt: number;
  summary: ReactNode;
}

/** One kind of work: what it is, how much, how long the oldest has waited. */
function QueueRow({
  count,
  icon,
  label,
  link,
  oldestAt,
  summary,
}: QueueRowProps) {
  const stale = Date.now() - oldestAt > STALE_AFTER_MS;
  return (
    <div className="hover:bg-muted/40 relative grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 transition-colors sm:grid-cols-[1rem_minmax(0,1fr)_auto_auto_auto]">
      <HugeiconsIcon
        className="text-muted-foreground size-4"
        icon={icon}
        strokeWidth={2}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-muted-foreground truncate text-xs">{summary}</p>
      </div>
      <span className="font-mono text-sm font-semibold tabular-nums">
        {count}
      </span>
      <span
        className={cn(
          "col-start-2 text-xs whitespace-nowrap sm:col-start-auto",
          stale ? "text-warning-foreground" : "text-muted-foreground"
        )}
      >
        oldest {formatDistanceToNowStrict(oldestAt)}
      </span>
      <span className="text-primary col-start-3 row-start-2 flex items-center gap-1 text-xs font-medium whitespace-nowrap sm:col-start-auto sm:row-start-auto">
        {link}
      </span>
    </div>
  );
}

/** The row's link stretches over the whole row, so any click opens it. */
function ReviewLinkLabel() {
  return (
    <>
      <span className="absolute inset-0" />
      Review
      <HugeiconsIcon
        className="size-3"
        icon={ArrowRight01Icon}
        strokeWidth={2}
      />
    </>
  );
}

function FinancialRow({
  icon,
  items,
  label,
  to,
}: {
  icon: IconSvgElement;
  items: readonly FinancialPendingItem[] | readonly VendorPaymentPendingItem[];
  label: string;
  to: "/reimbursements" | "/vendor-payments";
}) {
  if (items.length === 0) {
    return null;
  }
  const total = items.reduce(
    (sum, item) => sum + sumAmounts(item.lineItems),
    0
  );
  return (
    <QueueRow
      count={items.length}
      icon={icon}
      label={label}
      link={
        <Link
          className="inline-flex items-center gap-1"
          aria-label={`Review ${label.toLowerCase()}`}
          search={{ status: "pending" }}
          to={to}
        >
          <ReviewLinkLabel />
        </Link>
      }
      oldestAt={oldest(items)}
      summary={`${formatINR(total)} to approve`}
    />
  );
}

function EventRow({
  groups,
  icon,
  items,
  label,
  tab,
}: {
  groups: EventGroup[];
  icon: IconSvgElement;
  items: readonly { createdAt: number }[];
  label: string;
  tab?: "updates" | "photos";
}) {
  const latest = groups[0];
  if (!latest) {
    return null;
  }
  return (
    <QueueRow
      count={items.length}
      icon={icon}
      label={label}
      link={
        <Link
          className="inline-flex items-center gap-1"
          aria-label={`Review ${label.toLowerCase()} for ${latest.eventName}`}
          params={{ id: latest.eventId }}
          search={tab ? { tab } : undefined}
          to="/events/$id"
        >
          <ReviewLinkLabel />
        </Link>
      }
      oldestAt={oldest(items)}
      summary={eventNames(groups)}
    />
  );
}

// --- Main component ---

export function PendingReviews({
  advancePayments,
  eventInterests,
  eventPhotos,
  eventUpdates,
  isLoading,
  permissions,
  reimbursements,
  vendorPayments,
}: PendingReviewsProps) {
  const {
    canApproveRequests,
    canManageInterest,
    canManagePhotos,
    canApproveUpdates,
  } = permissions;

  const hasAnyPermission =
    canApproveRequests ||
    canManagePhotos ||
    canApproveUpdates ||
    canManageInterest;

  if (!hasAnyPermission) {
    return null;
  }

  const totalCount = countPendingReviews({
    advancePayments,
    eventInterests,
    eventPhotos,
    eventUpdates,
    permissions,
    reimbursements,
    vendorPayments,
  });

  if (!isLoading && totalCount === 0) {
    return null;
  }

  // Event items grouped by event, most recent first (already scoped by Zero)
  const photoGroups = canManagePhotos
    ? groupByEvent(eventPhotos, (p) => p.uploader?.name ?? "Unknown")
    : [];
  const updateGroups = canApproveUpdates
    ? groupByEvent(eventUpdates, (u) => u.author?.name ?? "Unknown")
    : [];
  const interestGroups = canManageInterest
    ? groupByEvent(eventInterests, (i) => i.user?.name ?? "Unknown")
    : [];

  return (
    <Card aria-label="Waiting for review" className="gap-0 py-0" role="region">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <HugeiconsIcon
            className="text-muted-foreground size-4"
            icon={CheckListIcon}
            strokeWidth={2}
          />
          Waiting for review
          {totalCount > 0 && (
            <Tag className="font-mono tabular-nums">{totalCount}</Tag>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {isLoading ? (
          <PendingReviewsSkeleton />
        ) : (
          <div className="divide-y">
            {canApproveRequests ? (
              <>
                <FinancialRow
                  icon={Invoice01Icon}
                  items={reimbursements}
                  label="Reimbursements"
                  to="/reimbursements"
                />
                <FinancialRow
                  icon={MoneyReceiveSquareIcon}
                  items={advancePayments}
                  label="Advance payments"
                  to="/reimbursements"
                />
                <FinancialRow
                  icon={Store01Icon}
                  items={vendorPayments}
                  label="Vendor payments"
                  to="/vendor-payments"
                />
              </>
            ) : null}
            {canManagePhotos ? (
              <EventRow
                groups={photoGroups}
                icon={Camera01Icon}
                items={eventPhotos}
                label="Event photos"
                tab="photos"
              />
            ) : null}
            {canApproveUpdates ? (
              <EventRow
                groups={updateGroups}
                icon={Notification01Icon}
                items={eventUpdates}
                label="Event updates"
                tab="updates"
              />
            ) : null}
            {canManageInterest ? (
              <EventRow
                groups={interestGroups}
                icon={UserMultipleIcon}
                items={eventInterests}
                label="Interest requests"
              />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
