import { Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { getEntryStatusCounts, entryAttendanceKey } from "./entry-arrival";
import type { KalakritiEntryRow } from "./entry-form-dialog";

function uniqueEntryMembers(entry: KalakritiEntryRow) {
  return [
    ...new Map(
      entry.members.map((member) => [member.studentId, member])
    ).values(),
  ];
}

function EntryStatusIcon({
  ariaLabel,
  label,
  positive,
}: {
  ariaLabel: string;
  label: string;
  positive: string;
}) {
  const negative = `Not ${positive.toLowerCase()}`;
  if (label !== positive && label !== negative) {
    return (
      <span className="text-muted-foreground text-xs" aria-label={ariaLabel}>
        {label}
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={ariaLabel}
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
  );
}

export function EntryCompactParticipants({
  attended,
  entry,
  present,
}: {
  attended: ReadonlyMap<string, string> | undefined;
  entry: KalakritiEntryRow;
  present: ReadonlyMap<string, string> | undefined;
}) {
  return (
    <div className="grid gap-1">
      {uniqueEntryMembers(entry).map((member) => {
        const presentLabel =
          present?.get(member.studentId) ?? "Checking presence";
        const attendedLabel =
          attended?.get(entryAttendanceKey(entry, member.studentId)) ??
          "Checking attendance";
        return (
          <div className="grid min-w-0 gap-0.5" key={member.studentId}>
            <span className="min-w-0 truncate">{member.student.name}</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground text-xs">Present</span>
                <EntryStatusIcon
                  ariaLabel={`${member.student.name}: ${presentLabel}`}
                  label={presentLabel}
                  positive="Present"
                />
              </span>
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground text-xs">Attended</span>
                <EntryStatusIcon
                  ariaLabel={`${member.student.name}: ${attendedLabel}`}
                  label={attendedLabel}
                  positive="Attended"
                />
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function EntryStatusCell({
  entry,
  mode,
  labels,
}: {
  entry: KalakritiEntryRow;
  mode: "present" | "attended";
  labels: ReadonlyMap<string, string> | undefined;
}) {
  const members = uniqueEntryMembers(entry);
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
            <EntryStatusIcon
              ariaLabel={`${member.student.name}: ${label}`}
              label={label}
              positive={positive}
            />
          </div>
        );
      })}
    </div>
  );
}
