import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useState } from "react";

import type { DataTableGroupBy } from "@/components/data-table/data-table-group";
import { StatusBadge } from "@/components/shared/status-badge";
import { getStatusBadge } from "@/lib/status-badge";

/** Width of an actions cell holding Approve, Reject and the ⋯ menu. */
export const REVIEW_ACTIONS_SIZE = 196;

/** "Group by status" for tables whose rows carry a status, pending first. */
export function createStatusGroupBy<TData extends { status: null | string }>(
  order: readonly string[]
): DataTableGroupBy<TData> {
  return {
    columnId: "status",
    formatValue: (value) => getStatusBadge(value).label,
    getValue: (row) => row.status ?? "",
    label: "status",
    order,
    renderValue: (value) => {
      const { label, tone } = getStatusBadge(value);
      return <StatusBadge tone={tone}>{label}</StatusBadge>;
    },
  };
}

/** Tracks which row's approve or reject dialog is open. */
export function useRowReview<TRow>() {
  const [target, setTarget] = useState<{
    kind: "approve" | "reject";
    row: TRow;
  } | null>(null);
  const approve = useEventCallback((row: TRow) =>
    setTarget({ kind: "approve", row })
  );
  const reject = useEventCallback((row: TRow) =>
    setTarget({ kind: "reject", row })
  );
  const handleOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setTarget(null);
    }
  });
  return {
    approve,
    approveOpen: target?.kind === "approve",
    close: () => setTarget(null),
    handleOpenChange,
    reject,
    rejectOpen: target?.kind === "reject",
    row: target?.row ?? null,
  };
}

export function RowReviewButtons({
  name,
  onApprove,
  onReject,
}: {
  name: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        aria-label={`Approve ${name}`}
        onClick={onApprove}
        size="xs"
        type="button"
        variant="outline"
      >
        Approve
      </Button>
      <Button
        aria-label={`Reject ${name}`}
        className="text-destructive hover:text-destructive"
        onClick={onReject}
        size="xs"
        type="button"
        variant="ghost"
      >
        Reject
      </Button>
    </div>
  );
}
