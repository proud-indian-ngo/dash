import {
  ArrowReloadHorizontalIcon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import { cn } from "@pi-dash/design-system/lib/utils";
import { MAX_RECIPIENT_RETRIES } from "@pi-dash/shared/scheduled-message";
import type { ScheduledMessageRecipient } from "@pi-dash/zero/schema";
import { type MouseEvent, useState } from "react";

import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";

function getRecipientStatusBadge(status: string | null): {
  label: string;
  tone: StatusTone;
} {
  switch (status) {
    case "sent":
      return { label: "Sent", tone: "success" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    default:
      return { label: "Pending", tone: "warning" };
  }
}

interface RecipientSubTableProps {
  onRetry?: (recipientId: string) => void;
  recipients: ScheduledMessageRecipient[];
}

function RetryRecipientButton({
  onRetry,
  recipientId,
}: {
  onRetry: (recipientId: string) => void;
  recipientId: string;
}) {
  const handleClick = useEventCallback((event: MouseEvent) => {
    event.stopPropagation();
    onRetry(recipientId);
  });

  return (
    <Button onClick={handleClick} size="sm" variant="outline">
      <HugeiconsIcon
        className="size-3.5"
        icon={ArrowReloadHorizontalIcon}
        strokeWidth={2}
      />
      Retry
    </Button>
  );
}

/** Why a send failed, clamped to two lines; tap to read the rest. */
function RecipientError({ error }: { error: string }) {
  const [expanded, setExpanded] = useState(false);
  const handleClick = useEventCallback((event: MouseEvent) => {
    event.stopPropagation();
    setExpanded((prev) => !prev);
  });

  return (
    <button
      aria-expanded={expanded}
      className={cn(
        "text-muted-foreground block max-w-full text-left text-xs",
        !expanded && "line-clamp-2"
      )}
      onClick={handleClick}
      type="button"
    >
      {error}
    </button>
  );
}

function RecipientStatus({
  recipient,
}: {
  recipient: ScheduledMessageRecipient;
}) {
  const badge = getRecipientStatusBadge(recipient.status);
  const maxedOut =
    recipient.status === "failed" &&
    (recipient.retryCount ?? 0) >= MAX_RECIPIENT_RETRIES;

  return (
    <>
      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      {maxedOut ? (
        <span className="text-muted-foreground text-xs">
          Max retries reached
        </span>
      ) : null}
    </>
  );
}

function RecipientType({ type }: { type: string }) {
  return (
    <span className="flex items-center gap-1">
      <HugeiconsIcon
        className="size-3.5"
        icon={type === "group" ? UserGroupIcon : UserIcon}
        strokeWidth={2}
      />
      {type === "group" ? "Group" : "User"}
    </span>
  );
}

function canRetry(recipient: ScheduledMessageRecipient): boolean {
  return (
    recipient.status === "failed" &&
    (recipient.retryCount ?? 0) < MAX_RECIPIENT_RETRIES
  );
}

export function RecipientSubTable({
  onRetry,
  recipients,
}: RecipientSubTableProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <ul className="divide-y rounded-lg border">
        {recipients.map((r) => (
          <li className="flex items-start gap-3 px-3 py-2.5" key={r.id}>
            <div className="grid min-w-0 flex-1 justify-items-start gap-1 text-sm">
              <span className="font-medium">{r.label}</span>
              <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <RecipientType type={r.type} />
                <RecipientStatus recipient={r} />
              </span>
              {r.error ? <RecipientError error={r.error} /> : null}
            </div>
            {canRetry(r) && onRetry ? (
              <RetryRecipientButton onRetry={onRetry} recipientId={r.id} />
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="px-4 py-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th className="pr-4 pb-2 font-medium">Recipient</th>
            <th className="pr-4 pb-2 font-medium">Type</th>
            <th className="pr-4 pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((r) => (
            <tr className="border-b align-top last:border-0" key={r.id}>
              <td className="py-2 pr-4">{r.label}</td>
              <td className="py-2 pr-4">
                <RecipientType type={r.type} />
              </td>
              <td className="py-2 pr-4">
                <div className="grid justify-items-start gap-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <RecipientStatus recipient={r} />
                  </span>
                  {r.error ? <RecipientError error={r.error} /> : null}
                </div>
              </td>
              <td className="py-2">
                {canRetry(r) && onRetry ? (
                  <RetryRecipientButton onRetry={onRetry} recipientId={r.id} />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
