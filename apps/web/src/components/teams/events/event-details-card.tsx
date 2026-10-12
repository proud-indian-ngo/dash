import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { formatReminderInterval } from "@pi-dash/shared/event-reminders";
import { rruleToLabel } from "@pi-dash/zero/rrule-utils";
import type { EventPartner } from "@pi-dash/zero/schema";
import { useNavigate } from "@tanstack/react-router";
import { format, isSameDay } from "date-fns";
import upperFirst from "lodash/upperFirst";

import { Tag } from "@/components/shared/status-badge";
import { DATE_TIME, TIME } from "@/lib/date-formats";
import { formatINR } from "@/lib/form-schemas";

import type { EventRow } from "./events-table";

const URL_PATTERN = /^https?:\/\//i;

/** "16 Oct 2026, 9:40 am – 11:40 am", or both full dates across days. */
export function formatEventWhen(
  startTime: number | Date,
  endTime: number | Date | null | undefined
) {
  const start = new Date(startTime);
  const from = format(start, DATE_TIME);
  if (!endTime) {
    return from;
  }
  const end = new Date(endTime);
  return `${from} – ${format(end, isSameDay(start, end) ? TIME : DATE_TIME)}`;
}

/** The event's location, linked when it's a URL (an online meeting). */
export function EventLocation({ location }: { location: string }) {
  if (!URL_PATTERN.test(location)) {
    return <>{location}</>;
  }
  return (
    <a
      className="text-primary break-all hover:underline"
      href={location}
      rel="noopener noreferrer"
      target="_blank"
    >
      {location}
    </a>
  );
}

function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function PartnersList({ partners }: { partners: readonly EventPartner[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {partners.map((partner) => (
        <li key={partner.id}>
          {partner.name}
          {partner.instagram ? (
            <span className="text-muted-foreground"> {partner.instagram}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

interface EventDetailsCardProps {
  /** Approved sign-ups, shown against `volunteersNeeded`. */
  approvedCount: number;
  canManage: boolean;
  event: EventRow;
  /** Effective partners (an exception without its own shows the series'). */
  partners: readonly EventPartner[];
  totalExpenses: number;
  volunteersNeeded: number | null;
}

function sortedReminders(event: EventRow): number[] {
  const raw = event.reminderIntervals;
  return Array.isArray(raw) ? [...raw].sort((a, b) => b - a) : [];
}

/**
 * Whether the card has anything to show. Date, place and privacy live in the
 * page header, so a one-off event with no extras has no card at all.
 */
export function hasEventDetails({
  canManage,
  event,
  partners,
  totalExpenses,
  volunteersNeeded,
}: Omit<EventDetailsCardProps, "approvedCount">) {
  const recurrence = event.recurrenceRule as { rrule?: string } | null;
  return (
    Boolean(recurrence?.rrule) ||
    Boolean(event.seriesId) ||
    partners.length > 0 ||
    Boolean(event.whatsappGroup) ||
    Boolean(volunteersNeeded) ||
    (canManage && (sortedReminders(event).length > 0 || totalExpenses > 0))
  );
}

/** The facts that don't fit in the page header, as one label/value list. */
export function EventDetailsCard({
  approvedCount,
  canManage,
  event,
  partners,
  totalExpenses,
  volunteersNeeded,
}: EventDetailsCardProps) {
  const navigate = useNavigate();
  const reminders = sortedReminders(event);
  const recurrence = event.recurrenceRule as
    | { rrule: string; exdates?: string[] }
    | null
    | undefined;
  const openSeries = useEventCallback(() =>
    navigate({
      params: { id: event.seriesId as string },
      to: "/events/$id",
    })
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2.5">
          {recurrence?.rrule ? (
            <PropertyRow label="Repeats">
              {upperFirst(rruleToLabel(recurrence.rrule))}
            </PropertyRow>
          ) : null}

          {event.seriesId ? (
            <PropertyRow label="Series">
              <button
                className="text-left hover:underline"
                onClick={openSeries}
                type="button"
              >
                Part of a recurring series
              </button>
            </PropertyRow>
          ) : null}

          {volunteersNeeded ? (
            <PropertyRow label="Volunteers">
              <span className="tabular-nums">
                {approvedCount} of {volunteersNeeded} approved
              </span>
            </PropertyRow>
          ) : null}

          {partners.length > 0 ? (
            <PropertyRow label="Partners">
              <PartnersList partners={partners} />
            </PropertyRow>
          ) : null}

          {event.whatsappGroup ? (
            <PropertyRow label="WhatsApp">
              {event.whatsappGroup.name}
            </PropertyRow>
          ) : null}

          {canManage && reminders.length > 0 ? (
            <PropertyRow label="Reminders">
              <div className="flex flex-wrap gap-1">
                {reminders.map((m) => (
                  <Tag key={m}>{formatReminderInterval(m)}</Tag>
                ))}
              </div>
            </PropertyRow>
          ) : null}

          {canManage && totalExpenses > 0 ? (
            <PropertyRow label="Expenses">
              <span className="tabular-nums">{formatINR(totalExpenses)}</span>
            </PropertyRow>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}
