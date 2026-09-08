import { Badge } from "@pi-dash/design-system/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@pi-dash/design-system/components/ui/popover";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useState } from "react";

import type { ParticipationCompliance } from "@/lib/kalakriti-participation-compliance";

export function ParticipationComplianceBadge({
  compliance,
}: {
  compliance: ParticipationCompliance | "unavailable" | undefined;
}) {
  const [open, setOpen] = useState(false);
  if (compliance === undefined) {
    return <Skeleton className="h-5 w-28" />;
  }
  if (compliance === "unavailable") {
    return <span className="text-muted-foreground text-sm">Not available</span>;
  }
  const { issues, minimum, students } = compliance;
  const label =
    students === 0
      ? "No students"
      : issues.length > 0
        ? "Needs attention"
        : "Compliant";
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) {
            setOpen(true);
          }
        }}
        openOnHover
        render={
          <button
            aria-label={`Participation compliance: ${label}`}
            className="rounded-sm focus-visible:outline-2"
            type="button"
          />
        }
      >
        <Badge variant={issues.length > 0 ? "destructive" : "outline"}>
          {label}
        </Badge>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80"
        finalFocus={false}
        initialFocus={false}
      >
        <PopoverTitle>Participation compliance</PopoverTitle>
        <PopoverDescription>
          {issues.length > 0
            ? `${issues.length} student${issues.length === 1 ? " is" : "s are"} below the minimum of ${minimum} events.`
            : students === 0
              ? "This Center has no registered students yet."
              : `All ${students} registered students meet the minimum of ${minimum} events.`}
        </PopoverDescription>
        {issues.length > 0 ? (
          <ul className="max-h-60 space-y-2 overflow-y-auto">
            {issues.map((student) => (
              <li key={student.id}>
                {student.humanId} · {student.name}: {student.count}/{minimum}{" "}
                events
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-muted-foreground">
          Every registered student must meet the minimum, including students
          with zero entries. Only the minimum-event rule is checked.
        </p>
      </PopoverContent>
    </Popover>
  );
}
