import { Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { getEntryStatusCounts, entryAttendanceKey } from "./entry-arrival";
import type { KalakritiEntryRow } from "./entry-form-dialog";
export function EntryStatusCell({
  entry,
  mode,
  labels,
}: {
  entry: KalakritiEntryRow;
  mode: "present" | "attended";
  labels: ReadonlyMap<string, string> | undefined;
}) {
  const members = [
    ...new Map(
      entry.members.map((member) => [member.studentId, member])
    ).values(),
  ];
  const keyFor = (id: string) =>
    mode === "present" ? id : entryAttendanceKey(entry, id);
  const positive = mode === "present" ? "Present" : "Attended";
  const checking =
    mode === "present" ? "Checking presence" : "Checking attendance";
  const counts = getEntryStatusCounts(
    members.map((member) => keyFor(member.studentId)),
    labels,
    positive
  );
  return (
    <div className="space-y-1">
      {entry.participationMode === "group" ? (
        <p>
          {counts.category === "checking"
            ? checking
            : `${counts.count} / ${counts.total} ${mode}`}
        </p>
      ) : null}
      {members.map((member) => {
        const label = labels?.get(keyFor(member.studentId)) ?? checking;
        if (label !== positive && label !== `Not ${mode}`)
          return (
            <p className="text-muted-foreground text-xs" key={member.studentId}>
              {member.student.name}: {checking}
            </p>
          );
        return (
          <div className="flex items-center gap-2" key={member.studentId}>
            {entry.participationMode === "group" ? (
              <span className="text-xs">{member.student.name}</span>
            ) : null}
            <span
              role="img"
              aria-label={`${member.student.name}: ${label}`}
              className={
                label === positive
                  ? "inline-flex text-green-600 dark:text-green-400"
                  : "inline-flex text-red-600 dark:text-red-400"
              }
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={label === positive ? Tick02Icon : Cancel01Icon}
                className="size-4"
                strokeWidth={2}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}
