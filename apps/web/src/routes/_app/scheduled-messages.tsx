import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { ScheduledMessage } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { log } from "evlog";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import type { MediaAttachment } from "@/components/scheduled-messages/media-upload";
import type { Recipient } from "@/components/scheduled-messages/recipient-picker";
import { ScheduleMessageFormDialog } from "@/components/scheduled-messages/schedule-message-form-dialog";
import { ScheduledMessageDetailSheet } from "@/components/scheduled-messages/scheduled-message-detail-sheet";
import {
  type ScheduledMessageRow,
  ScheduledMessagesTable,
} from "@/components/scheduled-messages/scheduled-messages-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { handleMutationResult } from "@/lib/mutation-result";
import { assertPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/scheduled-messages")({
  head: () => ({
    meta: [{ title: `Scheduled Messages | ${env.VITE_APP_NAME}` }],
  }),
  beforeLoad: ({ context }) => assertPermission(context, "messages.schedule"),
  component: ScheduledMessagesPage,
});

type DialogMode =
  | { kind: "create" }
  | { kind: "edit"; message: ScheduledMessage }
  | null;

function ScheduledMessagesPage() {
  const zero = useZero();
  const [messagesData, queryResult] = useQuery(queries.scheduledMessage.all());
  const messages = (messagesData ?? []) as ScheduledMessageRow[];
  const isLoading = messages.length === 0 && queryResult.type !== "complete";

  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] =
    useState<ScheduledMessageRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ScheduledMessageRow | null>(
    null
  );
  const [isCancelling, setIsCancelling] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledMessageRow | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const handleView = (row: ScheduledMessageRow) => {
    setSelectedMessage(row);
    setSheetOpen(true);
  };

  const handleEdit = (row: ScheduledMessageRow) => {
    setSheetOpen(false);
    setDialogMode({ kind: "edit", message: row });
  };

  const handleCancelRequest = (row: ScheduledMessageRow) => {
    setSheetOpen(false);
    setCancelTarget(row);
  };

  const handleDeleteRequest = (row: ScheduledMessageRow) => {
    setSheetOpen(false);
    setDeleteTarget(row);
  };

  const handleFormSubmit = async (values: {
    message: string;
    scheduledAt: number;
    recipients: Recipient[];
    attachments?: MediaAttachment[];
  }) => {
    if (dialogMode?.kind === "edit") {
      const res = await zero.mutate(
        mutators.scheduledMessage.update({
          id: dialogMode.message.id,
          message: values.message,
          scheduledAt: values.scheduledAt,
          recipients: values.recipients,
          attachments: values.attachments,
        })
      ).server;
      handleMutationResult(res, {
        mutation: "scheduledMessage.update",
        entityId: dialogMode.message.id,
        successMsg: "Message updated",
        errorMsg: "Failed to update message",
      });
      if (res.type !== "error") {
        setDialogMode(null);
      }
    } else {
      const id = uuidv7();
      const res = await zero.mutate(
        mutators.scheduledMessage.create({
          id,
          message: values.message,
          scheduledAt: values.scheduledAt,
          recipients: values.recipients,
          attachments: values.attachments,
        })
      ).server;
      handleMutationResult(res, {
        mutation: "scheduledMessage.create",
        entityId: id,
        successMsg: "Message scheduled",
        errorMsg: "Failed to schedule message",
      });
      if (res.type !== "error") {
        setDialogMode(null);
      }
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) {
      return;
    }
    setIsCancelling(true);
    try {
      const res = await zero.mutate(
        mutators.scheduledMessage.cancel({ id: cancelTarget.id })
      ).server;
      handleMutationResult(res, {
        mutation: "scheduledMessage.cancel",
        entityId: cancelTarget.id,
        successMsg: "Message cancelled",
        errorMsg: "Failed to cancel message",
      });
      if (res.type !== "error") {
        setCancelTarget(null);
      }
    } catch (error) {
      log.error({
        component: "ScheduledMessagesPage",
        action: "cancelMessage",
        messageId: cancelTarget.id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) {
      return;
    }
    setIsDeleting(true);
    try {
      const res = await zero.mutate(
        mutators.scheduledMessage.delete({ id: deleteTarget.id })
      ).server;
      handleMutationResult(res, {
        mutation: "scheduledMessage.delete",
        entityId: deleteTarget.id,
        successMsg: "Message deleted",
        errorMsg: "Failed to delete message",
      });
      if (res.type !== "error") {
        setDeleteTarget(null);
      }
    } catch (error) {
      log.error({
        component: "ScheduledMessagesPage",
        action: "deleteMessage",
        messageId: deleteTarget.id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Scheduled Messages
      </h1>

      <div className="mt-4 grid gap-6 *:min-w-0">
        <ScheduledMessagesTable
          isLoading={isLoading}
          messages={messages}
          onCancel={handleCancelRequest}
          onDelete={handleDeleteRequest}
          onEdit={handleEdit}
          onView={handleView}
          toolbarActions={
            <Button onClick={() => setDialogMode({ kind: "create" })} size="sm">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Schedule message
            </Button>
          }
        />
      </div>

      <ScheduledMessageDetailSheet
        message={selectedMessage}
        onCancel={() => {
          if (selectedMessage) {
            handleCancelRequest(selectedMessage);
          }
        }}
        onDelete={() => {
          if (selectedMessage) {
            handleDeleteRequest(selectedMessage);
          }
        }}
        onEdit={() => {
          if (selectedMessage) {
            handleEdit(selectedMessage);
          }
        }}
        onOpenChange={setSheetOpen}
        open={sheetOpen}
      />

      <ScheduleMessageFormDialog
        initialValues={
          dialogMode?.kind === "edit" ? dialogMode.message : undefined
        }
        onClose={() => setDialogMode(null)}
        onSubmit={handleFormSubmit}
        open={!!dialogMode}
      />

      <ConfirmDialog
        confirmLabel="Cancel message"
        description={
          cancelTarget
            ? "This will cancel the scheduled message. It will not be sent. This action cannot be undone."
            : ""
        }
        loading={isCancelling}
        loadingLabel="Cancelling..."
        onConfirm={handleCancelConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
          }
        }}
        open={!!cancelTarget}
        title="Cancel scheduled message?"
        variant="destructive"
      />

      <ConfirmDialog
        confirmLabel="Delete"
        description={
          deleteTarget
            ? "This will permanently delete the scheduled message record. This cannot be undone."
            : ""
        }
        loading={isDeleting}
        loadingLabel="Deleting..."
        onConfirm={handleDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={!!deleteTarget}
        title="Delete scheduled message?"
        variant="destructive"
      />
    </div>
  );
}
