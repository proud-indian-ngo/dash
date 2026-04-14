import {
  Calendar03Icon,
  Location01Icon,
  NotificationIcon,
  RepeatIcon,
  ViewIcon,
  ViewOffSlashIcon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { formatReminderInterval } from "@pi-dash/shared/event-reminders";
import { rruleToLabel } from "@pi-dash/zero/rrule-utils";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import upperFirst from "lodash/upperFirst";
import { LONG_DATE_TIME } from "@/lib/date-formats";
import type { EventRow } from "./events-table";

const URL_PATTERN = /^https?:\/\//i;

function isUrl(text: string) {
  return URL_PATTERN.test(text);
}

function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <HugeiconsIcon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        icon={icon}
        strokeWidth={2}
      />
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="break-words text-sm">{children}</div>
      </div>
    </div>
  );
}

export function EventDetailsCard({
  canManage,
  event,
}: {
  canManage?: boolean;
  event: EventRow;
}) {
  const navigate = useNavigate();
  const reminderIntervals = (event.reminderIntervals as number[] | null) ?? [];
  const recurrence = event.recurrenceRule as
    | { rrule: string; exdates?: string[] }
    | null
    | undefined;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <PropertyRow icon={Calendar03Icon} label="Date & Time">
          {format(new Date(event.startTime), LONG_DATE_TIME)}
          {event.endTime
            ? ` — ${format(new Date(event.endTime), LONG_DATE_TIME)}`
            : null}
        </PropertyRow>

        {event.location ? (
          <PropertyRow icon={Location01Icon} label="Location">
            {isUrl(event.location) ? (
              <a
                className="text-primary hover:underline"
                href={event.location}
                rel="noopener noreferrer"
                target="_blank"
              >
                {event.location}
              </a>
            ) : (
              event.location
            )}
          </PropertyRow>
        ) : null}

        {event.type === "class" ? (
          <PropertyRow icon={ViewIcon} label="Event Type">
            <Badge size="xs" variant="info-light">
              Class
            </Badge>
          </PropertyRow>
        ) : null}

        {event.center ? (
          <PropertyRow icon={Location01Icon} label="Center">
            <Badge size="xs" variant="secondary">
              {event.center.name}
            </Badge>
          </PropertyRow>
        ) : null}

        <PropertyRow
          icon={event.isPublic ? ViewIcon : ViewOffSlashIcon}
          label="Privacy"
        >
          <Badge
            size="xs"
            variant={event.isPublic ? "info-light" : "secondary"}
          >
            {event.isPublic ? "Public" : "Private"}
          </Badge>
        </PropertyRow>

        {recurrence?.rrule ? (
          <PropertyRow icon={RepeatIcon} label="Recurrence">
            {upperFirst(rruleToLabel(recurrence.rrule))}
          </PropertyRow>
        ) : null}

        {event.seriesId ? (
          <PropertyRow icon={RepeatIcon} label="Series">
            <button
              className="text-left hover:underline"
              onClick={() =>
                navigate({
                  to: "/events/$id",
                  params: { id: event.seriesId as string },
                })
              }
              type="button"
            >
              Part of a recurring series
            </button>
          </PropertyRow>
        ) : null}

        {event.whatsappGroup ? (
          <PropertyRow icon={WhatsappIcon} label="WhatsApp">
            {event.whatsappGroup.name}
          </PropertyRow>
        ) : null}

        {canManage && reminderIntervals.length > 0 ? (
          <PropertyRow icon={NotificationIcon} label="Reminders">
            <div className="flex flex-wrap gap-1">
              {reminderIntervals
                .sort((a, b) => b - a)
                .map((m) => (
                  <Badge key={m} size="xs" variant="secondary">
                    {formatReminderInterval(m)}
                  </Badge>
                ))}
            </div>
          </PropertyRow>
        ) : null}
      </CardContent>
    </Card>
  );
}
