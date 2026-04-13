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
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { formatINR } from "@/lib/form-schemas";
import { sumAmounts } from "@/lib/stats";

const MAX_ITEMS_PER_GROUP = 5;

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
      existing.count++;
      if (item.createdAt > existing.latestAt) {
        existing.latestAt = item.createdAt;
        existing.latestPerson = personAccessor(item);
      }
    } else {
      map.set(item.event.id, {
        eventName: item.event.name,
        count: 1,
        latestAt: item.createdAt,
        latestPerson: personAccessor(item),
      });
    }
  }

  return [...map.entries()]
    .map(([eventId, data]) => ({ eventId, ...data }))
    .sort((a, b) => b.latestAt - a.latestAt);
}

// --- Skeleton ---

function PendingReviewsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div className="space-y-2" key={i}>
          <Skeleton className="h-4 w-40" />
          <div className="space-y-1.5">
            {[1, 2].map((j) => (
              <Skeleton className="h-8 w-full" key={j} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Group section ---

function GroupHeader({
  count,
  icon,
  iconColor,
  label,
}: {
  count: number;
  icon: IconSvgElement;
  iconColor: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 pb-1">
      <HugeiconsIcon
        className={`size-3.5 ${iconColor}`}
        icon={icon}
        strokeWidth={2}
      />
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </span>
      <Badge size="xs" variant="warning-outline">
        {count}
      </Badge>
    </div>
  );
}

function ViewAllLink({
  count,
  to,
  search,
}: {
  count: number;
  search?: Record<string, string>;
  to: string;
}) {
  if (count <= MAX_ITEMS_PER_GROUP) {
    return null;
  }
  return (
    <Link
      className="flex items-center gap-1 py-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
      search={search}
      to={to}
    >
      View all {count}
      <HugeiconsIcon
        className="size-3"
        icon={ArrowRight01Icon}
        strokeWidth={2}
      />
    </Link>
  );
}

function FinancialGroup({
  icon,
  iconColor,
  items,
  label,
  route,
  viewAllTo,
}: {
  icon: IconSvgElement;
  iconColor: string;
  items: readonly FinancialPendingItem[];
  label: string;
  route: string;
  viewAllTo: string;
}) {
  if (items.length === 0) {
    return null;
  }
  const displayed = items.slice(0, MAX_ITEMS_PER_GROUP);

  return (
    <div>
      <GroupHeader
        count={items.length}
        icon={icon}
        iconColor={iconColor}
        label={label}
      />
      <div>
        {displayed.map((item) => (
          <Link
            className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
            key={item.id}
            params={{ id: item.id }}
            to={route}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">{item.title}</p>
              <p className="truncate text-muted-foreground text-xs">
                {item.user?.name ?? "Unknown"}
                {" \u00b7 "}
                {formatDistanceToNow(item.createdAt, { addSuffix: true })}
              </p>
            </div>
            <span className="shrink-0 font-medium text-sm tabular-nums">
              {formatINR(sumAmounts(item.lineItems))}
            </span>
          </Link>
        ))}
      </div>
      <ViewAllLink
        count={items.length}
        search={{ status: "pending" }}
        to={viewAllTo}
      />
    </div>
  );
}

function VendorPaymentGroup({
  items,
}: {
  items: readonly VendorPaymentPendingItem[];
}) {
  if (items.length === 0) {
    return null;
  }
  const displayed = items.slice(0, MAX_ITEMS_PER_GROUP);

  return (
    <div>
      <GroupHeader
        count={items.length}
        icon={Store01Icon}
        iconColor="text-purple-500"
        label="Vendor Payments"
      />
      <div>
        {displayed.map((item) => (
          <Link
            className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
            key={item.id}
            params={{ id: item.id }}
            to="/vendor-payments/$id"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">
                {item.vendor?.name ? `${item.vendor.name} \u2014 ` : ""}
                {item.title}
              </p>
              <p className="truncate text-muted-foreground text-xs">
                {formatDistanceToNow(item.createdAt, { addSuffix: true })}
              </p>
            </div>
            <span className="shrink-0 font-medium text-sm tabular-nums">
              {formatINR(sumAmounts(item.lineItems))}
            </span>
          </Link>
        ))}
      </div>
      <ViewAllLink
        count={items.length}
        search={{ status: "pending" }}
        to="/vendor-payments"
      />
    </div>
  );
}

function EventGroupSection({
  groups,
  icon,
  iconColor,
  label,
  noun,
  tab,
}: {
  groups: EventGroup[];
  icon: IconSvgElement;
  iconColor: string;
  label: string;
  noun: string;
  tab?: "updates" | "photos" | "feedback" | "expenses";
}) {
  if (groups.length === 0) {
    return null;
  }
  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);
  const displayed = groups.slice(0, MAX_ITEMS_PER_GROUP);

  return (
    <div>
      <GroupHeader
        count={totalCount}
        icon={icon}
        iconColor={iconColor}
        label={label}
      />
      <div>
        {displayed.map((group) => (
          <Link
            className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
            key={group.eventId}
            params={{ id: group.eventId }}
            search={tab ? { tab } : undefined}
            to="/events/$id"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">{group.eventName}</p>
              <p className="truncate text-muted-foreground text-xs">
                {group.count} {group.count === 1 ? noun : `${noun}s`}
                {" \u00b7 "}
                latest by {group.latestPerson}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
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

  // Financial items (already filtered to pending by caller)
  const pendingReimbursements = canApproveRequests ? reimbursements : [];
  const pendingAdvancePayments = canApproveRequests ? advancePayments : [];
  const pendingVendorPayments = canApproveRequests ? vendorPayments : [];

  // Event items grouped by event (already scoped by Zero query)
  const photoGroups = canManagePhotos
    ? groupByEvent(eventPhotos, (p) => p.uploader?.name ?? "Unknown")
    : [];
  const updateGroups = canApproveUpdates
    ? groupByEvent(eventUpdates, (u) => u.author?.name ?? "Unknown")
    : [];
  const interestGroups = canManageInterest
    ? groupByEvent(eventInterests, (i) => i.user?.name ?? "Unknown")
    : [];

  const totalCount =
    pendingReimbursements.length +
    pendingAdvancePayments.length +
    pendingVendorPayments.length +
    (canManagePhotos ? eventPhotos.length : 0) +
    (canApproveUpdates ? eventUpdates.length : 0) +
    (canManageInterest ? eventInterests.length : 0);

  if (!isLoading && totalCount === 0) {
    return null;
  }

  return (
    <Card className="border-l-2 border-l-amber-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <HugeiconsIcon
            className="size-4 text-amber-500"
            icon={CheckListIcon}
            strokeWidth={2}
          />
          Pending Reviews
          {totalCount > 0 && (
            <Badge size="xs" variant="warning-outline">
              {totalCount}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <PendingReviewsSkeleton />
        ) : (
          <div className="fade-in-0 animate-in space-y-4 duration-150 ease-(--ease-out-expo)">
            <FinancialGroup
              icon={Invoice01Icon}
              iconColor="text-blue-500"
              items={pendingReimbursements}
              label="Reimbursements"
              route="/reimbursements/$id"
              viewAllTo="/reimbursements"
            />
            <FinancialGroup
              icon={MoneyReceiveSquareIcon}
              iconColor="text-emerald-500"
              items={pendingAdvancePayments}
              label="Advance Payments"
              route="/reimbursements/$id"
              viewAllTo="/reimbursements"
            />
            <VendorPaymentGroup items={pendingVendorPayments} />
            <EventGroupSection
              groups={photoGroups}
              icon={Camera01Icon}
              iconColor="text-pink-500"
              label="Event Photos"
              noun="photo"
              tab="photos"
            />
            <EventGroupSection
              groups={updateGroups}
              icon={Notification01Icon}
              iconColor="text-orange-500"
              label="Event Updates"
              noun="update"
              tab="updates"
            />
            <EventGroupSection
              groups={interestGroups}
              icon={UserMultipleIcon}
              iconColor="text-teal-500"
              label="Interest Requests"
              noun="request"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
