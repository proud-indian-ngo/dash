import {
  Progress,
  ProgressLabel,
} from "@pi-dash/design-system/components/ui/progress";

import type { KalakritiRegistrationDashboardProjection } from "@/lib/server/kalakriti-registration-dashboard";

type Center = KalakritiRegistrationDashboardProjection["centers"][number];

export function CenterRegistrationChart({ centers }: { centers: Center[] }) {
  const visible = [...centers]
    .sort((a, b) => {
      if (a.students === 0 || b.students === 0) {
        if (a.students === 0 && b.students !== 0) return 1;
        if (b.students === 0 && a.students !== 0) return -1;
      } else {
        const coverage =
          a.registeredStudents / a.students - b.registeredStudents / b.students;
        if (coverage !== 0) return coverage;
      }
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    })
    .slice(0, 5);

  return (
    <section aria-label="Entry coverage by Center" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium">Entry coverage by Center</h3>
        <p className="text-muted-foreground text-xs">
          {visible.length < centers.length
            ? `Showing ${visible.length} of ${centers.length} visible Centers`
            : `${centers.length} visible Centers`}
        </p>
      </div>
      <ol className="grid gap-3">
        {visible.map((center) => (
          <li key={center.id}>
            {center.students === 0 ? (
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
                <span>{center.name}</span>
                <span className="text-muted-foreground">No Students</span>
              </div>
            ) : (
              <Progress
                value={Math.min(center.registeredStudents, center.students)}
                max={center.students}
                aria-valuetext={`${center.registeredStudents} of ${center.students} Students have an Entry`}
              >
                <ProgressLabel className="min-w-0 flex-1">
                  {center.name}
                </ProgressLabel>
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {center.registeredStudents} with an Entry / {center.students}{" "}
                  Students
                </span>
              </Progress>
            )}
          </li>
        ))}
      </ol>
      {visible.length < centers.length ? (
        <p className="text-muted-foreground text-xs">
          Lowest coverage first. Full list in Registration breakdown.
        </p>
      ) : null}
    </section>
  );
}
