import { Calendar03Icon } from "@hugeicons/core-free-icons";
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
import { format } from "date-fns";

interface TeamEvent {
  id: string;
  name: string;
  startTime: number;
  isPublic: boolean;
  interests: readonly { id: string }[];
  team: readonly { id: string; name: string }[];
}

const MAX_EVENTS = 5;

export function UpcomingEvents({
  events,
  isLoading,
}: {
  events: readonly TeamEvent[];
  isLoading?: boolean;
}) {
  const upcoming = events
    .filter((e) => e.startTime > Date.now())
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, MAX_EVENTS);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <HugeiconsIcon
            className="size-4"
            icon={Calendar03Icon}
            strokeWidth={2}
          />
          Upcoming Events
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-1 h-3 w-24" />
              </div>
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No upcoming events scheduled.
          </p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((event) => (
              <Link
                className="block rounded-md p-2 transition-colors hover:bg-muted/50"
                key={event.id}
                params={{ id: event.id }}
                to="/events/$id"
              >
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-sm">{event.name}</p>
                  {event.isPublic && (
                    <Badge size="xs" variant="info-light">
                      Public
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-muted-foreground text-xs">
                  <span>{format(event.startTime, "PPP p")}</span>
                  {event.team[0] && (
                    <>
                      <span>&middot;</span>
                      <span>{event.team[0].name}</span>
                    </>
                  )}
                  {event.interests.length > 0 && (
                    <>
                      <span>&middot;</span>
                      <span>
                        {event.interests.length} interested
                      </span>
                    </>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
