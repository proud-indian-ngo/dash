import { Cancel01Icon, RepeatIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";

import type { JobRow } from "@/components/jobs/job-stats";
import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { PageHeaderMenu } from "@/components/shared/page-header";
import { DetailsRow } from "@/components/shared/record-detail";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { formatTimestamp } from "@/lib/date-formats";

interface JobDetailSheetProps {
  job: JobRow | null;
  onCancel?: (job: JobRow) => void;
  onOpenChange: (open: boolean) => void;
  onRetry?: (job: JobRow) => void;
  open: boolean;
}

function getStateBadge(state: string): { label: string; tone: StatusTone } {
  switch (state) {
    case "created":
      return { label: "Created", tone: "neutral" };
    case "retry":
      return { label: "Retry", tone: "warning" };
    case "active":
      return { label: "Active", tone: "info" };
    case "completed":
      return { label: "Completed", tone: "success" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    default:
      return { label: state, tone: "neutral" };
  }
}

/** A label and value; omitted when there is no value. */
function DetailRow({ label, value }: { label: string; value: string | null }) {
  return value ? <DetailsRow label={label}>{value}</DetailsRow> : null;
}

const timestamp = (value: string | null) =>
  formatTimestamp(value, { fallback: "", seconds: true }) || null;

export { getStateBadge };

export function JobDetailSheet({
  job,
  onCancel,
  onOpenChange,
  onRetry,
  open,
}: JobDetailSheetProps) {
  if (!job) {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent />
      </Sheet>
    );
  }

  const badge = getStateBadge(job.state);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <DetailSheetHeader
          actions={
            <>
              {job.state === "failed" && onRetry ? (
                <Button
                  onClick={() => onRetry(job)}
                  type="button"
                  variant="outline"
                >
                  <HugeiconsIcon
                    className="size-4"
                    icon={RepeatIcon}
                    strokeWidth={2}
                  />
                  Retry
                </Button>
              ) : null}
              <PageHeaderMenu
                actions={[
                  (job.state === "created" || job.state === "retry") &&
                    onCancel && {
                      destructive: true,
                      icon: Cancel01Icon,
                      id: "cancel",
                      label: "Cancel job",
                      onSelect: () => onCancel(job),
                    },
                ]}
                title="Job actions"
              />
            </>
          }
          badge={<StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
          meta={[job.name, formatTimestamp(job.createdOn, { seconds: true })]}
          title={<span className="font-mono text-sm">{job.id}</span>}
        />

        <div className="flex flex-col gap-6 px-6 pb-6">
          <div className="grid gap-3">
            <h3 className="text-sm font-medium">Details</h3>
            {/* Queue, state and created time are in the header. */}
            <dl className="flex flex-col gap-2.5">
              <DetailRow label="Priority" value={String(job.priority)} />
              <DetailRow
                label="Scheduled for"
                value={timestamp(job.startAfter)}
              />
              <DetailRow label="Started" value={timestamp(job.startedOn)} />
              <DetailRow label="Completed" value={timestamp(job.completedOn)} />
              {job.state === "failed" ? (
                <DetailRow
                  label="Retries"
                  value={`${job.retryCount} of ${job.retryLimit}`}
                />
              ) : null}
            </dl>
          </div>

          {Boolean(job.output) && (
            <div className="grid gap-4">
              <h3 className="text-sm font-medium">
                {job.state === "failed" ? "Error output" : "Output"}
              </h3>
              <pre className="bg-muted/50 max-h-96 overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed">
                {JSON.stringify(job.output, null, 2)}
              </pre>
            </div>
          )}

          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Payload</h3>
            <pre className="bg-muted/50 overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed">
              {JSON.stringify(job.data, null, 2)}
            </pre>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
