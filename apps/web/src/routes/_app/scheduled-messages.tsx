import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { deriveMessageStatus } from "@pi-dash/shared/scheduled-message";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { log } from "evlog";
import { parseAsString, useQueryState } from "nuqs";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import { TableFilterSelect } from "@/components/data-table/table-filter-select";
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
  | { kind: "edit"; message: ScheduledMessageRow }
  | null;

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Sent", value: "sent" },
  { label: "Failed", value: "failed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Partial", value: "partial" },
];

function ScheduledMessagesPage() {
  const zero = useZero();
  const [messagesData, queryResult] = useQuery(queries.scheduledMessage.all());
  const allMessages = (messagesData ?? []) as ScheduledMessageRow[];
  const isLoading = allMessages.length === 0 && queryResult.type !== "complete";

  const [statusFilter, setStatusFilter] = useQueryState(
    "status",
    parseAsString.withDefault("")
  );

  const messages = statusFilter
    ? allMessages.filter(
        (m) => deriveMessageStatus(m.recipients) === statusFilter
      )
    : allMessages;

  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null
  );
  const selectedMessage = selectedMessageId
    ? (allMessages.find((m) => m.id === selectedMessageId) ?? null)
    : null;
  const [cancelTarget, setCancelTarget] = useState<ScheduledMessageRow | null>(
    null
  );
  const [isCancelling, setIsCancelling] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledMessageRow | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const handleView = (row: ScheduledMessageRow) => {
    setSelectedMessageId(row.id);
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
    sendNow?: boolean;
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
        errorMsg: "Couldn't update message",
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
        successMsg: values.sendNow ? "Message sent" : "Message scheduled",
        errorMsg: values.sendNow
          ? "Couldn't send message"
          : "Couldn't schedule message",
      });
      if (res.type !== "error") {
        setDialogMode(null);
      }
    }
  };

  const handleRetryRecipient = async (recipientId: string) => {
    try {
      const res = await zero.mutate(
        mutators.scheduledMessage.retryRecipient({ recipientId })
      ).server;
      handleMutationResult(res, {
        mutation: "scheduledMessage.retryRecipient",
        entityId: recipientId,
        successMsg: "Retry scheduled",
        errorMsg: "Failed to retry recipient",
      });
    } catch (error) {
      log.error({
        component: "ScheduledMessagesPage",
        action: "retryRecipient",
        recipientId,
        error: error instanceof Error ? error.message : String(error),
      });
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
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Scheduled Messages
      </h1>

      <div className="mt-4 grid gap-6 *:min-w-0">
        <ScheduledMessagesTable
          hasActiveFilters={!!statusFilter}
          isLoading={isLoading}
          messages={messages}
          onCancel={handleCancelRequest}
          onClearFilters={() => setStatusFilter("")}
          onDelete={handleDeleteRequest}
          onEdit={handleEdit}
          onRetry={handleRetryRecipient}
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
          toolbarFilters={
            <TableFilterSelect
              label="Status"
              onChange={setStatusFilter}
              options={STATUS_OPTIONS}
              value={statusFilter}
            />
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
        onRetry={handleRetryRecipient}
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
            ? "This will cancel all pending recipients. Already sent or failed recipients will not be affected."
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
