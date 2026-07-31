import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import type { KalakritiPublicSchedule } from "@/lib/kalakriti-public-schedule";

export function ScheduleItem({
  isLast,
  session,
  timeFormatter,
}: {
  isLast: boolean;
  session: KalakritiPublicSchedule["sessions"][number];
  timeFormatter: Intl.DateTimeFormat;
}) {
  const cancelled = session.status === "cancelled";

  return (
    <li className={cancelled ? "bg-muted/30" : undefined}>
      <article className="grid gap-4 px-4 py-5 sm:grid-cols-[8rem_1fr_auto] sm:items-start sm:px-6">
        <div>
          <p className="font-semibold text-base tabular-nums">
            <time dateTime={new Date(session.startAt).toISOString()}>
              {timeFormatter.format(session.startAt)}
            </time>
          </p>
          <p className="mt-0.5 text-muted-foreground text-sm tabular-nums">
            until{" "}
            <time dateTime={new Date(session.endAt).toISOString()}>
              {timeFormatter.format(session.endAt)}
            </time>
          </p>
        </div>

        <div className={cancelled ? "opacity-60" : undefined}>
          <h3 className="font-medium text-base">{session.competition}</h3>
          <p className="mt-1 text-muted-foreground text-sm">
            {session.ageCategory} · {session.venue}
          </p>
        </div>

        {cancelled ? (
          <Badge className="w-fit" variant="secondary">
            Cancelled
          </Badge>
        ) : null}
      </article>
      {isLast ? null : <Separator />}
    </li>
  );
}
