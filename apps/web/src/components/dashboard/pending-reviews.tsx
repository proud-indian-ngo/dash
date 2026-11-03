import {
  ArrowDown01Icon,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@pi-dash/design-system/components/ui/collapsible";
import { cn } from "@pi-dash/design-system/lib/utils";
import { approvalFilterQuery } from "@pi-dash/shared/approval-policy";
import { eventLabel } from "@pi-dash/shared/event-label";
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

interface VendorPaymentToPayItem extends VendorPaymentPendingItem {
  transactions?:
    | readonly {
        amountPaise: number;
        status: string | null;
        voidedAt: number | null;
      }[]
    | undefined;
}

interface EventPhotoPendingItem {
  createdAt: number;
  event?: { id: string; name: string; startTime: number } | undefined;
  id: string;
}

interface EventUpdatePendingItem {
  createdAt: number;
  event?: { id: string; name: string; startTime: number } | undefined;
  id: string;
}

interface EventInterestPendingItem {
  createdAt: number;
  event?: { id: string; name: string; startTime: number } | undefined;
  id: string;
}

export interface PendingReviewsProps {
  advancePayments: readonly FinancialPendingItem[];
  eventInterests: readonly EventInterestPendingItem[];
  eventPhotos: readonly EventPhotoPendingItem[];
  eventUpdates: readonly EventUpdatePendingItem[];
  isLoading?: boolean;
  /** Pending requests waiting for the person as programme lead. */
  leadReimbursements?: readonly FinancialPendingItem[];
  leadVendorPayments?: readonly VendorPaymentPendingItem[];
  permissions: {
    /** Leads a programme, so approves its requests before finance. */
    canApproveAsLead?: boolean;
    canApproveRequests: boolean;
    canManageInterest: boolean;
    canManagePhotos: boolean;
    canApproveUpdates: boolean;
  };
  reimbursements: readonly FinancialPendingItem[];
  vendorPayments: readonly VendorPaymentPendingItem[];
  /** Vendor payments whose invoice (or no-invoice reason) awaits approval. */
  vendorInvoices?: readonly VendorPaymentPendingItem[];
  /** Approved vendor payments not yet fully paid. */
  vendorPaymentsToPay?: readonly VendorPaymentToPayItem[];
}

// --- Event grouping helpers ---

interface EventGroup {
  count: number;
  eventId: string;
  eventName: string;
  latestAt: number;
  oldestAt: number;
}

function groupByEvent(
  items: readonly {
    createdAt: number;
    event?: { id: string; name: string; startTime: number } | undefined;
  }[]
): EventGroup[] {
  const map = new Map<string, Omit<EventGroup, "eventId">>();

  for (const item of items) {
    if (!item.event) {
      continue;
    }
    const existing = map.get(item.event.id);
    if (existing) {
      existing.count += 1;
      existing.latestAt = Math.max(existing.latestAt, item.createdAt);
      existing.oldestAt = Math.min(existing.oldestAt, item.createdAt);
    } else {
      map.set(item.event.id, {
        count: 1,
        eventName: eventLabel(item.event.name, item.event.startTime),
        latestAt: item.createdAt,
        oldestAt: item.createdAt,
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
  leadReimbursements = [],
  leadVendorPayments = [],
  permissions,
  reimbursements,
  vendorInvoices = [],
  vendorPayments,
  vendorPaymentsToPay = [],
}: Omit<PendingReviewsProps, "isLoading">): number {
  return (
    (permissions.canApproveAsLead
      ? leadReimbursements.length + leadVendorPayments.length
      : 0) +
    (permissions.canApproveRequests
      ? reimbursements.length +
        advancePayments.length +
        vendorPayments.length +
        vendorPaymentsToPay.length +
        vendorInvoices.length
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
  /** Left out on an event's row under its kind of work. */
  icon?: IconSvgElement;
  isLoading?: boolean;
  label: string;
  link?: ReactNode;
  oldestAt?: number;
  summary?: ReactNode;
}

/** One kind of work (or one event of it): what, how much, the oldest wait. */
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
      className="hover:bg-muted/40 relative col-span-full grid grid-cols-subgrid items-center gap-y-0.5 px-4 py-2.5 transition-colors"
      data-slot="review-queue-row"
    >
      {icon ? (
        <HugeiconsIcon
          className="text-muted-foreground size-4"
          icon={icon}
          strokeWidth={2}
        />
      ) : (
        <span />
      )}
      <div className="min-w-0">
        <p className={cn("truncate text-sm", icon && "font-medium")}>{label}</p>
        {summary === undefined ? null : (
          <p className="text-muted-foreground truncate text-xs">
            {isLoading ? <InlineSkeleton className="h-3 w-28" /> : summary}
          </p>
        )}
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
  search = { status: "pending" },
  to,
}: {
  icon: IconSvgElement;
  items: readonly FinancialPendingItem[] | readonly VendorPaymentPendingItem[];
  isLoading?: boolean;
  label: string;
  /** The list's filter; pending requests by default. */
  search?: Record<string, unknown>;
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
            search={search as never}
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

const TO_PAY_FILTER = {
  combinator: "and",
  id: "root",
  rules: [
    {
      id: "status-to-pay",
      operator: "is_any_of",
      path: ["status"],
      type: "rule",
      value: ["approved", "partially_paid"],
    },
  ],
  type: "group",
} as const;

/** What an approved vendor payment still owes: its total less approved payments. */
function outstandingPaise(item: VendorPaymentToPayItem): number {
  const paid = sumPaise(
    (item.transactions ?? [])
      .filter((t) => t.status === "approved" && t.voidedAt === null)
      .map((t) => t.amountPaise)
  );
  return Math.max(sumAmounts(item.lineItems) - paid, 0);
}

function VendorPaymentsToPayRow({
  isLoading,
  items,
}: {
  isLoading?: boolean;
  items: readonly VendorPaymentToPayItem[];
}) {
  const hasItems = items.length > 0;
  return (
    <QueueRow
      count={items.length}
      icon={Store01Icon}
      isLoading={isLoading}
      label="Vendor payments to pay"
      link={
        hasItems ? (
          <Link
            aria-label="Review vendor payments to pay"
            className="inline-flex items-center gap-1"
            search={{ filters: TO_PAY_FILTER } as never}
            to="/vendor-payments"
          >
            <ReviewLinkLabel />
          </Link>
        ) : undefined
      }
      oldestAt={hasItems ? oldest(items) : undefined}
      summary={
        hasItems
          ? `${formatPaise(sumPaise(items.map(outstandingPaise)))} to pay`
          : "Nothing waiting"
      }
    />
  );
}

function EventReviewLink({
  group,
  label,
  tab,
}: {
  group: EventGroup;
  label: string;
  tab?: "updates" | "photos";
}) {
  return (
    <Link
      className="inline-flex items-center gap-1"
      aria-label={`Review ${label.toLowerCase()} for ${group.eventName}`}
      params={{ id: group.eventId }}
      search={tab ? { tab } : undefined}
      to="/events/$id"
    >
      <ReviewLinkLabel />
    </Link>
  );
}

/**
 * Work on one event links straight to it. Work across several expands to one
 * row per event, so the reviewer picks where to go.
 */
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
  const [first] = groups;
  const row = {
    count: items.length,
    icon,
    isLoading,
    label,
    oldestAt: first ? oldest(items) : undefined,
    summary: first ? eventNames(groups) : "Nothing waiting",
  };

  if (groups.length < 2) {
    return (
      <QueueRow
        {...row}
        link={
          first ? (
            <EventReviewLink group={first} label={label} tab={tab} />
          ) : undefined
        }
      />
    );
  }

  return (
    <Collapsible className="col-span-full grid grid-cols-subgrid">
      <QueueRow
        {...row}
        link={
          <CollapsibleTrigger
            aria-label={`Choose an event to review ${label.toLowerCase()}`}
            className="group inline-flex items-center gap-1 outline-none"
          >
            <span className="absolute inset-0" />
            {groups.length} events
            <HugeiconsIcon
              className="size-3 transition-transform group-data-[panel-open]:rotate-180"
              icon={ArrowDown01Icon}
              strokeWidth={2}
            />
          </CollapsibleTrigger>
        }
      />
      <CollapsibleContent className="bg-muted/20 col-span-full grid grid-cols-subgrid divide-y border-t">
        {groups.map((group) => (
          <QueueRow
            count={group.count}
            key={group.eventId}
            label={group.eventName}
            link={<EventReviewLink group={group} label={label} tab={tab} />}
            oldestAt={group.oldestAt}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// --- Main component ---

export function PendingReviews({
  advancePayments,
  eventInterests,
  eventPhotos,
  eventUpdates,
  isLoading,
  leadReimbursements = [],
  leadVendorPayments = [],
  permissions,
  reimbursements,
  vendorInvoices = [],
  vendorPayments,
  vendorPaymentsToPay = [],
}: PendingReviewsProps) {
  const {
    canApproveAsLead = false,
    canApproveRequests,
    canManageInterest,
    canManagePhotos,
    canApproveUpdates,
  } = permissions;

  const hasAnyPermission =
    canApproveAsLead ||
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
    leadReimbursements,
    leadVendorPayments,
    permissions,
    reimbursements,
    vendorInvoices,
    vendorPayments,
    vendorPaymentsToPay,
  });

  // Event items grouped by event, most recent first (already scoped by Zero)
  const photoGroups = canManagePhotos ? groupByEvent(eventPhotos) : [];
  const updateGroups = canApproveUpdates ? groupByEvent(eventUpdates) : [];
  const interestGroups = canManageInterest ? groupByEvent(eventInterests) : [];

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
        {/* Rows are subgrids of this grid, so their columns line up. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 divide-y sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]">
          {canApproveAsLead ? (
            <>
              <FinancialRow
                icon={Invoice01Icon}
                isLoading={isLoading}
                items={leadReimbursements}
                label="Reimbursements as programme lead"
                search={{ filters: approvalFilterQuery("you") }}
                to="/reimbursements"
              />
              <FinancialRow
                icon={Store01Icon}
                isLoading={isLoading}
                items={leadVendorPayments}
                label="Vendor payments as programme lead"
                search={{ filters: approvalFilterQuery("you") }}
                to="/vendor-payments"
              />
            </>
          ) : null}
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
              <VendorPaymentsToPayRow
                isLoading={isLoading}
                items={vendorPaymentsToPay}
              />
              <FinancialRow
                icon={Store01Icon}
                isLoading={isLoading}
                items={vendorInvoices}
                label="Vendor invoices"
                search={{ status: "invoice_pending" }}
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
