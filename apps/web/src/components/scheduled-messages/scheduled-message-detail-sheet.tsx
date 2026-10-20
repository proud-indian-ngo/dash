import {
  Cancel01Icon,
  Delete02Icon,
  Edit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
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
import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { FilePreviewButton } from "@/components/shared/file-preview";
import { PageHeaderMenu } from "@/components/shared/page-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import {
  getAttachmentDownloadHref,
  getAttachmentPreviewHref,
} from "@/lib/attachment-links";
import { DATE_TIME } from "@/lib/date-formats";

type ScheduledMessageWithCreator = ScheduledMessage & {
  creator?: { name: string } | null;
  recipients: ScheduledMessageRecipient[];
};

interface Attachment {
  fileName: string;
  mimeType: string;
  r2Key: string;
}

function parseAttachments(value: unknown): Attachment[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const [first] = value;
  if (
    typeof first !== "object" ||
    first === null ||
    !("r2Key" in first) ||
    !("fileName" in first)
  ) {
    return null;
  }
  return value as Attachment[];
}

function getStatusBadge(status: ScheduledMessageDerivedStatus): {
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
    case "partial":
      return { label: "Partial", tone: "warning" };
    default:
      return { label: "Pending", tone: "warning" };
  }
}

function formatTs(ts: number): string {
  try {
    return format(new Date(ts), DATE_TIME);
  } catch {
    return "\u2014";
  }
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value}</span>
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
  const badge = status ? getStatusBadge(status) : null;
  const attachments = message ? parseAttachments(message.attachments) : null;

  if (!(message && badge)) {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent />
      </Sheet>
    );
  }

  const isPending = status === "pending";

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <DetailSheetHeader
          actions={
            <>
              {isPending ? (
                <Button onClick={onEdit} type="button" variant="outline">
                  <HugeiconsIcon
                    className="size-4"
                    icon={Edit02Icon}
                    strokeWidth={2}
                  />
                  Edit
                </Button>
              ) : null}
              <PageHeaderMenu
                actions={[
                  isPending
                    ? {
                        destructive: true,
                        icon: Cancel01Icon,
                        id: "cancel",
                        label: "Cancel message",
                        onSelect: onCancel,
                      }
                    : {
                        destructive: true,
                        icon: Delete02Icon,
                        id: "delete",
                        label: "Delete message",
                        onSelect: onDelete,
                      },
                ]}
                title="Scheduled message actions"
              />
            </>
          }
          badge={<StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
          meta={[`Scheduled for ${formatTs(message.scheduledAt)}`]}
          title="Scheduled message"
        />

        <div className="flex flex-col gap-6 px-6 pb-6">
          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Message</h3>
            <p className="text-sm whitespace-pre-wrap">{message.message}</p>
          </div>

          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow
                label="Scheduled for"
                value={formatTs(message.scheduledAt)}
              />
              <DetailRow
                label="Created by"
                value={message.creator?.name ?? null}
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
            <h3 className="text-sm font-medium">
              Recipients ({message.recipients.length})
            </h3>
            <RecipientSubTable
              onRetry={onRetry}
              recipients={message.recipients}
            />
          </div>

          {attachments?.length ? (
            <div className="grid gap-4">
              <h3 className="text-sm font-medium">
                Attachments ({attachments.length})
              </h3>
              <div className="flex flex-col gap-1.5">
                {attachments.map((a) => {
                  const file = {
                    filename: a.fileName,
                    mimeType: a.mimeType,
                    objectKey: a.r2Key,
                    type: "file" as const,
                  };
                  const ref = {
                    id: message.id,
                    key: a.r2Key,
                    kind: "scheduledMessageAttachment" as const,
                  };
                  return (
                    <div
                      className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                      key={a.r2Key}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {a.fileName}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {a.mimeType}
                      </span>
                      <FilePreviewButton
                        className="text-primary shrink-0 text-xs font-medium underline-offset-2 hover:underline"
                        fileName={a.fileName}
                        mimeType={a.mimeType}
                        src={getAttachmentPreviewHref(file, ref)}
                      >
                        Preview
                        <span className="sr-only"> {a.fileName}</span>
                      </FilePreviewButton>
                      <a
                        className="text-primary shrink-0 text-xs font-medium underline-offset-2 hover:underline"
                        download={a.fileName}
                        href={getAttachmentDownloadHref(file, ref)}
                      >
                        Download
                        <span className="sr-only"> {a.fileName}</span>
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
