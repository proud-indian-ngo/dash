import { Badge } from "@pi-dash/design-system/components/reui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@pi-dash/design-system/components/ui/sheet";
import { formatTimestamp } from "@/lib/date-formats";
import type { AuditLogRow } from "./audit-types";

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="break-all text-sm">{value || "None"}</span>
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
            <SheetHeader>
              <SheetTitle className="font-mono text-sm">
                {entry.action}
              </SheetTitle>
              <SheetDescription>
                Immutable audit entry {entry.id}
              </SheetDescription>
            </SheetHeader>
            <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 pb-6">
              <Badge className="w-fit" variant="outline">
                {entry.outcome}
              </Badge>
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
                <h3 className="font-medium text-sm">Safe metadata</h3>
                <pre className="max-h-96 overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              </div>
            </div>
          </>
        ) : (
          <SheetHeader>
            <SheetTitle>Audit entry</SheetTitle>
            <SheetDescription>No entry selected.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}
