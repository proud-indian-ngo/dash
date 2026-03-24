import { format } from "date-fns";
import { SHORT_DATE_WITH_TIME } from "@/lib/date-formats";
import type { RequestDetailData } from "@/lib/request-types";

export function HistoryEntry({
  entry,
}: {
  entry: RequestDetailData["history"][number];
}) {
  return (
    <div className="flex gap-3">
      <div aria-hidden="true" className="mt-1 flex flex-col items-center">
        <div className="size-2 rounded-full bg-border" />
        <div className="w-px flex-1 bg-border" />
      </div>
      <div className="flex flex-col gap-0.5 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm capitalize">{entry.action}</span>
          <span className="text-muted-foreground text-xs">
            {format(entry.createdAt, SHORT_DATE_WITH_TIME)}
          </span>
        </div>
        {entry.note ? (
          <span className="text-muted-foreground text-sm italic">
            {entry.note}
          </span>
        ) : null}
      </div>
    </div>
  );
}
