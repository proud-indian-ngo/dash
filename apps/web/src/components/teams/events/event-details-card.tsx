import {
  Calendar03Icon,
  Location01Icon,
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
import { format } from "date-fns";
import { LONG_DATE_TIME } from "@/lib/date-formats";
import type { EventRow } from "./events-table";

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
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

export function EventDetailsCard({ event }: { event: EventRow }) {
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
            {event.location}
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
            {recurrence.rrule}
          </PropertyRow>
        ) : null}

        {event.seriesId ? (
          <PropertyRow icon={RepeatIcon} label="Series">
            Part of a recurring event
          </PropertyRow>
        ) : null}

        {event.whatsappGroup ? (
          <PropertyRow icon={WhatsappIcon} label="WhatsApp">
            {event.whatsappGroup.name}
          </PropertyRow>
        ) : null}
      </CardContent>
    </Card>
  );
}
