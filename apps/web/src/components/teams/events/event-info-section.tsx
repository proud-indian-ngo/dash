import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { format } from "date-fns";
import { LONG_DATE_TIME } from "@/lib/date-formats";
import type { EventRow } from "./events-table";

export function EventInfoSection({ event }: { event: EventRow }) {
  const recurrence = event.recurrenceRule as
    | { frequency: string; endDate?: string }
    | null
    | undefined;

  return (
    <>
      {event.description ? (
        <p className="text-muted-foreground text-sm">{event.description}</p>
      ) : null}

      <div className="text-sm">
        {format(new Date(event.startTime), LONG_DATE_TIME)}
        {event.endTime
          ? ` - ${format(new Date(event.endTime), LONG_DATE_TIME)}`
          : null}
      </div>

      {event.location ? (
        <div className="text-muted-foreground text-sm">{event.location}</div>
      ) : null}

      <Badge variant={event.isPublic ? "default" : "secondary"}>
        {event.isPublic ? "Public" : "Private"}
      </Badge>

      {recurrence?.frequency ? (
        <div className="text-muted-foreground text-sm">
          Recurring {recurrence.frequency}
        </div>
      ) : null}

      {event.parentEventId ? (
        <div className="text-muted-foreground text-sm">
          Part of recurring event
        </div>
      ) : null}

      {event.whatsappGroup ? (
        <div className="text-muted-foreground text-sm">
          WhatsApp: {event.whatsappGroup.name}
        </div>
      ) : null}
    </>
  );
}
