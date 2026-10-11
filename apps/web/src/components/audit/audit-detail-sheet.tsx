import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatTimestamp } from "@/lib/date-formats";

import { outcomeTone } from "./audit-log-table";
import type { AuditLogRow } from "./audit-types";

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm break-all">{value || "None"}</span>
    </div>
  );
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
                  {entry.outcome}
                </StatusBadge>
              }
              description={`Immutable audit entry ${entry.id}`}
              meta={[entry.actorName, formatTimestamp(entry.attemptedAt)]}
              title={<span className="font-mono text-sm">{entry.action}</span>}
            />
            <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 pb-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailRow
                  label="Attempted"
                  value={formatTimestamp(entry.attemptedAt)}
                />
                <DetailRow
                  label="Completed"
                  value={formatTimestamp(entry.completedAt)}
                />
                <DetailRow label="Actor" value={entry.actorName} />
                <DetailRow label="Actor ID" value={entry.actorUserId} />
                <DetailRow label="Actor role" value={entry.actorRole} />
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
              </div>
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
