import {
  ArrowReloadHorizontalIcon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@pi-dash/design-system/components/ui/tooltip";
import { MAX_RECIPIENT_RETRIES } from "@pi-dash/shared/scheduled-message";
import type { ScheduledMessageRecipient } from "@pi-dash/zero/schema";

function getRecipientStatusBadge(status: string | null) {
  switch (status) {
    case "sent":
      return { label: "Sent", variant: "success" as const };
    case "failed":
      return { label: "Failed", variant: "destructive" as const };
    case "cancelled":
      return { label: "Cancelled", variant: "warning" as const };
    default:
      return { label: "Pending", variant: "outline" as const };
  }
}

interface RecipientSubTableProps {
  onRetry?: (recipientId: string) => void;
  recipients: ScheduledMessageRecipient[];
}

export function RecipientSubTable({
  onRetry,
  recipients,
}: RecipientSubTableProps) {
  return (
    <div className="px-4 py-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground text-xs">
            <th className="pr-4 pb-2 font-medium">Recipient</th>
            <th className="pr-4 pb-2 font-medium">Type</th>
            <th className="pr-4 pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((r) => {
            const badge = getRecipientStatusBadge(r.status);
            const canRetry =
              r.status === "failed" &&
              (r.retryCount ?? 0) < MAX_RECIPIENT_RETRIES;

            return (
              <tr className="border-b last:border-0" key={r.id}>
                <td className="py-2 pr-4">{r.label}</td>
                <td className="py-2 pr-4">
                  <span className="flex items-center gap-1">
                    <HugeiconsIcon
                      className="size-3.5"
                      icon={r.type === "group" ? UserGroupIcon : UserIcon}
                      strokeWidth={2}
                    />
                    {r.type === "group" ? "Group" : "User"}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <span className="flex items-center gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {r.error && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="cursor-default text-muted-foreground text-xs">
                              (error)
                            </span>
                          }
                        />
                        <TooltipContent>{r.error}</TooltipContent>
                      </Tooltip>
                    )}
                    {r.status === "failed" &&
                      (r.retryCount ?? 0) >= MAX_RECIPIENT_RETRIES && (
                        <span className="text-muted-foreground text-xs">
                          Max retries reached
                        </span>
                      )}
                  </span>
                </td>
                <td className="py-2">
                  {canRetry && onRetry && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRetry(r.id);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      <HugeiconsIcon
                        className="size-3.5"
                        icon={ArrowReloadHorizontalIcon}
                        strokeWidth={2}
                      />
                      Retry
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
