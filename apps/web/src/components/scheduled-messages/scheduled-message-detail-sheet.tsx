import {
  Cancel01Icon,
  Delete02Icon,
  PencilEdit01Icon,
  UserGroupIcon,
  UserIcon,
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
import type { ScheduledMessage } from "@pi-dash/zero/schema";
import { format } from "date-fns";
import { SHORT_DATE_WITH_SECONDS } from "@/lib/date-formats";

type ScheduledMessageWithCreator = ScheduledMessage & {
  creator?: { name: string } | null;
};

interface Recipient {
  id: string;
  label: string;
  type: "group" | "user";
}

interface Attachment {
  fileName: string;
  mimeType: string;
  r2Key: string;
}

const STATUS_BADGE_MAP = {
  pending: { label: "Pending", variant: "outline" as const },
  sent: { label: "Sent", variant: "success" as const },
  failed: { label: "Failed", variant: "destructive" as const },
  cancelled: { label: "Cancelled", variant: "warning" as const },
};

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
  open: boolean;
}

export function ScheduledMessageDetailSheet({
  message,
  onCancel,
  onDelete,
  onEdit,
  onOpenChange,
  open,
}: ScheduledMessageDetailSheetProps) {
  const isPending = message?.status === "pending";
  const badge = message
    ? (STATUS_BADGE_MAP[message.status ?? "pending"] ??
      STATUS_BADGE_MAP.pending)
    : null;

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
                  Recipients ({(message.recipients as Recipient[]).length})
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {(message.recipients as Recipient[]).map((r) => (
                    <Badge className="gap-1" key={r.id} variant="secondary">
                      <HugeiconsIcon
                        className="size-3"
                        icon={r.type === "group" ? UserGroupIcon : UserIcon}
                        strokeWidth={2}
                      />
                      {r.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {(message.attachments as Attachment[] | null)?.length ? (
                <div className="grid gap-4">
                  <h3 className="font-medium text-sm">
                    Attachments ({(message.attachments as Attachment[]).length})
                  </h3>
                  <div className="flex flex-col gap-1.5">
                    {(message.attachments as Attachment[]).map((a) => (
                      <div
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                        key={a.r2Key}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {a.fileName}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {a.mimeType}
                        </span>
                      </div>
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
