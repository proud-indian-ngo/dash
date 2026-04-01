import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import type {
  TeamEvent,
  TeamEventMember,
  User,
  WhatsappGroup,
} from "@pi-dash/zero/schema";

export type EventRow = TeamEvent & {
  members: ReadonlyArray<TeamEventMember & { user: User | undefined }>;
  whatsappGroup: WhatsappGroup | undefined;
};

export function getEventStatus(event: EventRow): {
  label: string;
  variant: "destructive" | "outline" | "secondary" | "success-outline";
} {
  if (event.cancelledAt) {
    return { label: "Cancelled", variant: "destructive" };
  }
  const eventEnd = event.endTime ?? event.startTime;
  if (new Date(eventEnd) < new Date()) {
    return { label: "Past", variant: "secondary" };
  }
  return { label: "Upcoming", variant: "success-outline" };
}

export function getRecurrenceLabel(
  rule: { rrule: string } | null | undefined
): string {
  if (!rule) {
    return "One-time";
  }
  // TODO: Parse RRULE string into human-readable label (Step 2)
  const rrule = rule.rrule.toUpperCase();
  if (rrule.includes("FREQ=DAILY")) {
    return "Daily";
  }
  if (rrule.includes("FREQ=WEEKLY")) {
    if (rrule.includes("INTERVAL=2")) {
      return "Biweekly";
    }
    return "Weekly";
  }
  if (rrule.includes("FREQ=MONTHLY")) {
    return "Monthly";
  }
  if (rrule.includes("FREQ=YEARLY")) {
    return "Yearly";
  }
  return "Recurring";
}

export function searchEvent(row: EventRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.name, row.description ?? "", row.location ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export const SKELETON_NAME = <Skeleton className="h-5 w-36" />;
export const SKELETON_DATETIME = <Skeleton className="h-5 w-40" />;
export const SKELETON_LOCATION = <Skeleton className="h-5 w-28" />;
export const SKELETON_BADGE = <Skeleton className="h-5 w-16" />;
export const SKELETON_COUNT = <Skeleton className="h-5 w-10" />;
