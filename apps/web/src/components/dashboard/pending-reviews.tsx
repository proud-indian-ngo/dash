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
import { cn } from "@pi-dash/design-system/lib/utils";
import { formatPaise, sumPaise } from "@pi-dash/shared/money";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import type { ReactNode } from "react";

import { Tag } from "@/components/shared/status-badge";
import { sumAmounts } from "@/lib/stats";

/** Waits longer than this are flagged in the warning tone. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** Event names listed in a row before "and N more". */
const MAX_EVENT_NAMES = 2;

// --- Types ---

interface FinancialPendingItem {
  createdAt: number;
  id: string;
  lineItems: readonly { amountPaise: number }[];
  title: string;
  user?: { name: string | null } | undefined;
}

interface VendorPaymentPendingItem {
  createdAt: number;
  id: string;
  lineItems: readonly { amountPaise: number }[];
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

// --- Queue row ---

interface QueueRowProps {
  count: number;
  icon: IconSvgElement;
  isLoading?: boolean;
  label: string;
  link?: ReactNode;
  oldestAt?: number;
  summary: ReactNode;
}

/** One kind of work: what it is, how much, how long the oldest has waited. */
function QueueRow({
  count,
  icon,
  isLoading,
  label,
  link,
  oldestAt,
  summary,
}: QueueRowProps) {
  const stale =
    oldestAt !== undefined && Date.now() - oldestAt > STALE_AFTER_MS;
  return (
    <div
      className="hover:bg-muted/40 relative grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 transition-colors sm:grid-cols-[1rem_minmax(0,1fr)_auto_auto_auto]"
      data-slot="review-queue-row"
    >
      <HugeiconsIcon
        className="text-muted-foreground size-4"
        icon={icon}
        strokeWidth={2}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-muted-foreground truncate text-xs">
          {isLoading ? <InlineSkeleton className="h-3 w-28" /> : summary}
        </p>
      </div>
      <span className="font-mono text-sm font-semibold tabular-nums">
        {isLoading ? <InlineSkeleton className="h-4 w-5" /> : count}
      </span>
      <span
        className={cn(
          "col-start-2 min-h-4 text-xs whitespace-nowrap sm:col-start-auto",
          stale ? "text-warning-foreground" : "text-muted-foreground"
        )}
      >
        {isLoading ? (
          <InlineSkeleton className="h-3 w-20" />
        ) : oldestAt === undefined ? null : (
          <>oldest {formatDistanceToNowStrict(oldestAt)}</>
        )}
      </span>
      <span className="text-primary col-start-3 row-start-2 flex min-h-4 items-center gap-1 text-xs font-medium whitespace-nowrap sm:col-start-auto sm:row-start-auto">
        {isLoading ? <InlineSkeleton className="h-3 w-14" /> : link}
      </span>
    </div>
  );
}

function InlineSkeleton({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("bg-muted inline-flex animate-pulse rounded-md", className)}
      data-slot="skeleton"
    />
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
  isLoading,
  label,
  to,
}: {
  icon: IconSvgElement;
  items: readonly FinancialPendingItem[] | readonly VendorPaymentPendingItem[];
  isLoading?: boolean;
  label: string;
  to: "/reimbursements" | "/vendor-payments";
}) {
  const hasItems = items.length > 0;
  const total = hasItems
    ? sumPaise(items.map((item) => sumAmounts(item.lineItems)))
    : 0;
  return (
    <QueueRow
      count={items.length}
      icon={icon}
      isLoading={isLoading}
      label={label}
      link={
        hasItems ? (
          <Link
            className="inline-flex items-center gap-1"
            aria-label={`Review ${label.toLowerCase()}`}
            search={{ status: "pending" }}
            to={to}
          >
            <ReviewLinkLabel />
          </Link>
        ) : undefined
      }
      oldestAt={hasItems ? oldest(items) : undefined}
      summary={
        hasItems ? `${formatPaise(total)} to approve` : "Nothing waiting"
      }
    />
  );
}

function EventRow({
  groups,
  icon,
  items,
  isLoading,
  label,
  tab,
}: {
  groups: EventGroup[];
  icon: IconSvgElement;
  items: readonly { createdAt: number }[];
  isLoading?: boolean;
  label: string;
  tab?: "updates" | "photos";
}) {
  const latest = groups[0];
  return (
    <QueueRow
      count={items.length}
      icon={icon}
      isLoading={isLoading}
      label={label}
      link={
        latest ? (
          <Link
            className="inline-flex items-center gap-1"
            aria-label={`Review ${label.toLowerCase()} for ${latest.eventName}`}
            params={{ id: latest.eventId }}
            search={tab ? { tab } : undefined}
            to="/events/$id"
          >
            <ReviewLinkLabel />
          </Link>
        ) : undefined
      }
      oldestAt={latest ? oldest(items) : undefined}
      summary={latest ? eventNames(groups) : "Nothing waiting"}
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
          <Tag className="font-mono tabular-nums">
            {isLoading ? <InlineSkeleton className="h-4 w-5" /> : totalCount}
          </Tag>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <div className="divide-y">
          {canApproveRequests ? (
            <>
              <FinancialRow
                icon={Invoice01Icon}
                isLoading={isLoading}
                items={reimbursements}
                label="Reimbursements"
                to="/reimbursements"
              />
              <FinancialRow
                icon={MoneyReceiveSquareIcon}
                isLoading={isLoading}
                items={advancePayments}
                label="Advance payments"
                to="/reimbursements"
              />
              <FinancialRow
                icon={Store01Icon}
                isLoading={isLoading}
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
              isLoading={isLoading}
              items={eventPhotos}
              label="Event photos"
              tab="photos"
            />
          ) : null}
          {canApproveUpdates ? (
            <EventRow
              groups={updateGroups}
              icon={Notification01Icon}
              isLoading={isLoading}
              items={eventUpdates}
              label="Event updates"
              tab="updates"
            />
          ) : null}
          {canManageInterest ? (
            <EventRow
              groups={interestGroups}
              icon={UserMultipleIcon}
              isLoading={isLoading}
              items={eventInterests}
              label="Interest requests"
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
