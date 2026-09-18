import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Progress,
  ProgressLabel,
} from "@pi-dash/design-system/components/ui/progress";

import { getEntryStatusCounts } from "./entry-arrival";
import { SummaryMetricCards } from "./summary-metric-cards";

export function EntrySessionSummary({
  entries,
  studentIds,
  attendanceIds,
  present,
  attended,
  ready,
  missingMusic,
  sequential = false,
  onReviewMusic,
}: {
  entries: number;
  studentIds: readonly string[];
  attendanceIds: readonly string[];
  present: ReadonlyMap<string, string> | undefined;
  attended: ReadonlyMap<string, string> | undefined;
  ready: boolean;
  missingMusic?: number;
  sequential?: boolean;
  onReviewMusic: () => void;
}) {
  const presence = getEntryStatusCounts(studentIds, present, "Present");
  const attendance = getEntryStatusCounts(attendanceIds, attended, "Attended");
  const metrics = [
    { label: "Entries", value: ready ? entries : "Checking" },
    { label: "Distinct Students", value: ready ? presence.total : "Checking" },
    {
      label: "Students present",
      value:
        ready && presence.category !== "checking"
          ? `${presence.count} / ${presence.total}`
          : "Checking",
    },
    {
      label: "Students attended",
      value:
        ready && attendance.category !== "checking"
          ? `${attendance.count} / ${attendance.total}`
          : "Checking",
    },
  ];
  return (
    <section aria-label="Session participation" className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        This Session · All authorized Entries
        {sequential
          ? " · Suggested order lists participants who have another Competition next"
          : ""}
      </p>
      <SummaryMetricCards metrics={metrics} />
      {ready && attendance.category !== "checking" && attendance.total > 0 ? (
        <Progress
          value={attendance.count}
          max={attendance.total}
          aria-valuetext={`${attendance.count} of ${attendance.total} Students`}
        >
          <ProgressLabel>Session attendance</ProgressLabel>
        </Progress>
      ) : null}
      {missingMusic !== undefined ? (
        <Button
          className="min-h-10 self-start max-sm:min-h-11"
          disabled={!ready}
          onClick={onReviewMusic}
          variant="link"
        >
          {ready ? missingMusic : "Checking"} Entries missing required music ·
          Review
        </Button>
      ) : null}
    </section>
  );
}
