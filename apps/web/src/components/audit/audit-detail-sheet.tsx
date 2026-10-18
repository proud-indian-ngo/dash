import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { DetailsRow } from "@/components/shared/record-detail";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatTimestamp } from "@/lib/date-formats";

import { outcomeLabel, outcomeTone } from "./audit-log-table";
import type { AuditLogRow } from "./audit-types";

/** A label and value; omitted when there is no value. */
function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return value ? (
    <DetailsRow label={label}>
      <span className="break-all">{value}</span>
    </DetailsRow>
  ) : null;
}

export function AuditDetailSheet({
  entry,
  onOpenChange,
  open,
}: {
  entry: AuditLogRow | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        {entry ? (
          <>
            <DetailSheetHeader
              badge={
                <StatusBadge tone={outcomeTone(entry.outcome)}>
                  {outcomeLabel(entry.outcome)}
                </StatusBadge>
              }
              description={`Immutable audit entry ${entry.id}`}
              meta={[
                entry.actorName,
                formatTimestamp(entry.attemptedAt, { seconds: true }),
              ]}
              title={<span className="font-mono text-sm">{entry.action}</span>}
            />
            <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-6 pb-6">
              {/* The actor and attempt time are in the header. */}
              <dl className="flex flex-col gap-2.5">
                <DetailRow
                  label="Actor role"
                  value={entry.actorRoleName ?? entry.actorRole}
                />
                <DetailRow label="Actor ID" value={entry.actorUserId} />
                <DetailRow
                  label="Completed"
                  value={
                    entry.completedAt
                      ? formatTimestamp(entry.completedAt, { seconds: true })
                      : null
                  }
                />
                <DetailRow
                  label="Impersonator"
                  value={entry.impersonatorName}
                />
                <DetailRow
                  label="Impersonator ID"
                  value={entry.impersonatorUserId}
                />
                <DetailRow label="Target type" value={entry.targetType} />
                <DetailRow label="Target ID" value={entry.targetId} />
                <DetailRow label="Trace ID" value={entry.traceId} />
              </dl>
              <div className="grid gap-2">
                <h3 className="text-sm font-medium">Safe metadata</h3>
                <pre className="bg-muted/50 max-h-96 overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              </div>
            </div>
          </>
        ) : (
          <DetailSheetHeader
            description="No entry selected."
            title="Audit entry"
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
