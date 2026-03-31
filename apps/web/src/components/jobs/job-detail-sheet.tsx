import { Badge } from "@pi-dash/design-system/components/reui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@pi-dash/design-system/components/ui/sheet";
import { format } from "date-fns";
import type { JobRow } from "@/components/jobs/job-stats";
import { SHORT_DATE_WITH_SECONDS } from "@/lib/date-formats";

interface JobDetailSheetProps {
  job: JobRow | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function getStateBadge(state: string) {
  switch (state) {
    case "created":
      return { variant: "outline" as const, label: "Created" };
    case "retry":
      return { variant: "warning-outline" as const, label: "Retry" };
    case "active":
      return { variant: "info" as const, label: "Active" };
    case "completed":
      return { variant: "success" as const, label: "Completed" };
    case "failed":
      return { variant: "destructive" as const, label: "Failed" };
    case "cancelled":
      return { variant: "warning" as const, label: "Cancelled" };
    default:
      return { variant: "secondary" as const, label: state };
  }
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value ?? "\u2014"}</span>
    </div>
  );
}

function formatTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    return format(new Date(value), SHORT_DATE_WITH_SECONDS);
  } catch {
    return value;
  }
}

export { getStateBadge };

export function JobDetailSheet({
  job,
  onOpenChange,
  open,
}: JobDetailSheetProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        {job && (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono text-sm">{job.id}</SheetTitle>
              <SheetDescription className="sr-only">
                Job details and payload
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-6 px-6 pb-6">
              <div className="flex items-center gap-2">
                {(() => {
                  const badge = getStateBadge(job.state);
                  return <Badge variant={badge.variant}>{badge.label}</Badge>;
                })()}
              </div>

              <div className="grid gap-4">
                <h3 className="font-medium text-sm">Details</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="Queue" value={job.name} />
                  <DetailRow label="State" value={job.state} />
                  <DetailRow label="Priority" value={String(job.priority)} />
                  <DetailRow
                    label="Created"
                    value={formatTimestamp(job.createdOn)}
                  />
                  <DetailRow
                    label="Started"
                    value={formatTimestamp(job.startedOn)}
                  />
                  <DetailRow
                    label="Completed"
                    value={formatTimestamp(job.completedOn)}
                  />
                  <DetailRow
                    label="Scheduled For"
                    value={formatTimestamp(job.startAfter)}
                  />
                </div>
              </div>

              {job.state === "failed" && (
                <div className="grid gap-4">
                  <h3 className="font-medium text-sm">Error Info</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailRow
                      label="Retry Count"
                      value={`${job.retryCount} / ${job.retryLimit}`}
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-4">
                <h3 className="font-medium text-sm">Payload</h3>
                <pre className="overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                  {JSON.stringify(job.data, null, 2)}
                </pre>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
