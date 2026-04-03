import {
  Cancel01Icon,
  Delete02Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@pi-dash/design-system/components/ui/sheet";
import { env } from "@pi-dash/env/web";
import {
  deriveMessageStatus,
  type ScheduledMessageDerivedStatus,
} from "@pi-dash/shared/scheduled-message";
import type {
  ScheduledMessage,
  ScheduledMessageRecipient,
} from "@pi-dash/zero/schema";
import { format } from "date-fns";
import { RecipientSubTable } from "@/components/scheduled-messages/recipient-sub-table";
import { SHORT_DATE_WITH_SECONDS } from "@/lib/date-formats";

type ScheduledMessageWithCreator = ScheduledMessage & {
  creator?: { name: string } | null;
  recipients: ScheduledMessageRecipient[];
};

interface Attachment {
  fileName: string;
  mimeType: string;
  r2Key: string;
}

function getStatusBadge(status: ScheduledMessageDerivedStatus) {
  switch (status) {
    case "sent":
      return { label: "Sent", variant: "success" as const };
    case "failed":
      return { label: "Failed", variant: "destructive" as const };
    case "cancelled":
      return { label: "Cancelled", variant: "warning" as const };
    case "partial":
      return { label: "Partial", variant: "secondary" as const };
    default:
      return { label: "Pending", variant: "outline" as const };
  }
}

function formatTs(ts: number): string {
  try {
    return format(new Date(ts), SHORT_DATE_WITH_SECONDS);
  } catch {
    return "\u2014";
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

interface ScheduledMessageDetailSheetProps {
  message: ScheduledMessageWithCreator | null;
  onCancel: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onOpenChange: (open: boolean) => void;
  onRetry?: (recipientId: string) => void;
  open: boolean;
}

export function ScheduledMessageDetailSheet({
  message,
  onCancel,
  onDelete,
  onEdit,
  onOpenChange,
  onRetry,
  open,
}: ScheduledMessageDetailSheetProps) {
  const status = message ? deriveMessageStatus(message.recipients) : null;
  const isPending = status === "pending";
  const badge = status ? getStatusBadge(status) : null;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        {message && badge && (
          <>
            <SheetHeader>
              <SheetTitle className="text-sm">Scheduled Message</SheetTitle>
              <SheetDescription className="sr-only">
                Scheduled message details
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-6 px-6 pb-6">
              <div className="flex items-center gap-2">
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>

              <div className="grid gap-4">
                <h3 className="font-medium text-sm">Message</h3>
                <p className="whitespace-pre-wrap text-sm">{message.message}</p>
              </div>

              <div className="grid gap-4">
                <h3 className="font-medium text-sm">Details</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow
                    label="Scheduled for"
                    value={formatTs(message.scheduledAt)}
                  />
                  <DetailRow
                    label="Created by"
                    value={message.creator?.name ?? "\u2014"}
                  />
                  <DetailRow
                    label="Created at"
                    value={formatTs(message.createdAt)}
                  />
                  <DetailRow
                    label="Updated at"
                    value={formatTs(message.updatedAt)}
                  />
                </div>
              </div>

              <div className="grid gap-4">
                <h3 className="font-medium text-sm">
                  Recipients ({message.recipients.length})
                </h3>
                <RecipientSubTable
                  onRetry={onRetry}
                  recipients={message.recipients}
                />
              </div>

              {(message.attachments as Attachment[] | null)?.length ? (
                <div className="grid gap-4">
                  <h3 className="font-medium text-sm">
                    Attachments ({(message.attachments as Attachment[]).length})
                  </h3>
                  <div className="flex flex-col gap-1.5">
                    {(message.attachments as Attachment[]).map((a) => (
                      <a
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                        download={a.fileName}
                        href={`${env.VITE_CDN_URL}/${a.r2Key}`}
                        key={a.r2Key}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {a.fileName}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {a.mimeType}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 border-t pt-4">
                {isPending && (
                  <>
                    <Button onClick={onEdit} size="sm" variant="outline">
                      <HugeiconsIcon
                        className="size-4"
                        icon={PencilEdit01Icon}
                        strokeWidth={2}
                      />
                      Edit
                    </Button>
                    <Button onClick={onCancel} size="sm" variant="outline">
                      <HugeiconsIcon
                        className="size-4"
                        icon={Cancel01Icon}
                        strokeWidth={2}
                      />
                      Cancel message
                    </Button>
                  </>
                )}
                {!isPending && (
                  <Button onClick={onDelete} size="sm" variant="outline">
                    <HugeiconsIcon
                      className="size-4"
                      icon={Delete02Icon}
                      strokeWidth={2}
                    />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
