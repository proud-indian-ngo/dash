import { Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@pi-dash/design-system/components/ui/tooltip";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { useState } from "react";

import type { DataTableGroupBy } from "@/components/data-table/data-table-group";
import { StatusBadge } from "@/components/shared/status-badge";
import { getStatusBadge } from "@/lib/status-badge";

/** Width of an actions cell holding Approve, Reject and the ⋯ menu. */
export const REVIEW_ACTIONS_SIZE = 108;

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

function ReviewIconButton({
  className,
  icon,
  label,
  onClick,
}: {
  className?: string;
  icon: typeof Tick02Icon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={cn("size-7 pointer-coarse:size-10", className)}
            onClick={onClick}
            size="icon"
            type="button"
            variant="ghost"
          />
        }
      >
        <HugeiconsIcon className="size-4" icon={icon} strokeWidth={2} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Approve and Reject icon buttons for a pending row; they open the review dialogs. */
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
    <div className="flex items-center gap-0.5">
      <ReviewIconButton
        className="text-success-foreground hover:text-success-foreground"
        icon={Tick02Icon}
        label={`Approve ${name}`}
        onClick={onApprove}
      />
      <ReviewIconButton
        className="text-destructive hover:text-destructive"
        icon={Cancel01Icon}
        label={`Reject ${name}`}
        onClick={onReject}
      />
    </div>
  );
}
