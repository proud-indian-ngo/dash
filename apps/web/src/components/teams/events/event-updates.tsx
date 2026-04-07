import {
  CheckmarkCircle02Icon,
  Delete02Icon,
  MoreVerticalIcon,
  MultiplicationSignCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventUpdate, User } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { log } from "evlog";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import {
  EditorSkeleton,
  RendererSkeleton,
} from "@/components/editor/editor-skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useApp } from "@/context/app-context";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { LONG_DATE_TIME } from "@/lib/date-formats";
import { handleMutationResult } from "@/lib/mutation-result";

const PlateEditor = lazy(() =>
  import("@/components/editor/plate-editor").then((m) => ({
    default: m.PlateEditor,
  }))
);
const PlateRenderer = lazy(() =>
  import("@/components/editor/plate-renderer").then((m) => ({
    default: m.PlateRenderer,
  }))
);

type UpdateWithAuthor = EventUpdate & { author: User | undefined };

interface EventUpdatesProps {
  approvedUpdates: readonly UpdateWithAuthor[];
  canApproveUpdates: boolean;
  canManage: boolean;
  eventId: string;
  isMember: boolean;
  pendingUpdates: readonly UpdateWithAuthor[];
}

export function EventUpdates({
  approvedUpdates,
  canApproveUpdates,
  canManage,
  eventId,
  isMember,
  pendingUpdates,
}: EventUpdatesProps) {
  const zero = useZero();
  const [saving, setSaving] = useState(false);

  const canPost = canManage || isMember;
  const isAdminOrLead = canManage;

  // Parent already splits: approvers get all pending, others get only own
  const showPendingSection = canApproveUpdates && pendingUpdates.length > 0;
  const showMyPendingSection = !canApproveUpdates && pendingUpdates.length > 0;
  const isEmpty =
    approvedUpdates.length === 0 &&
    !showPendingSection &&
    !showMyPendingSection;

  const handleCreate = async (content: string) => {
    setSaving(true);
    try {
      const now = Date.now();
      const id = uuidv7();
      const res = await zero.mutate(
        mutators.eventUpdate.create({ id, eventId, content, now })
      ).server;
      handleMutationResult(res, {
        mutation: "eventUpdate.create",
        entityId: id,
        successMsg: isAdminOrLead
          ? "Update posted"
          : "Update submitted for approval",
        errorMsg: "Failed to post update",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    const res = await zero.mutate(
      mutators.eventUpdate.approve({ id, now: Date.now() })
    ).server;
    handleMutationResult(res, {
      mutation: "eventUpdate.approve",
      entityId: id,
      successMsg: "Update approved",
      errorMsg: "Failed to approve update",
    });
  };

  const handleEdit = async (id: string, content: string) => {
    const res = await zero.mutate(
      mutators.eventUpdate.update({ id, content, now: Date.now() })
    ).server;
    handleMutationResult(res, {
      mutation: "eventUpdate.update",
      entityId: id,
      successMsg: "Update saved",
      errorMsg: "Failed to update",
    });
  };

  const handleReject = async (id: string) => {
    const res = await zero.mutate(
      mutators.eventUpdate.reject({ id, now: Date.now() })
    ).server;
    handleMutationResult(res, {
      mutation: "eventUpdate.reject",
      entityId: id,
      successMsg: "Update rejected",
      errorMsg: "Failed to reject update",
    });
  };

  const deleteAction = useConfirmAction<string>({
    onConfirm: (id) => zero.mutate(mutators.eventUpdate.delete({ id })).server,
    onSuccess: () => toast.success("Update deleted"),
    onError: (msg) => {
      log.error({
        component: "EventUpdates",
        mutation: "eventUpdate.delete",
        error: msg ?? "unknown",
      });
      toast.error("Failed to delete update");
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {canPost ? (
        <Suspense fallback={<EditorSkeleton />}>
          <PlateEditor
            entityId={eventId}
            key="create"
            onSave={handleCreate}
            saving={saving}
          />
        </Suspense>
      ) : null}

      {/* Pending Approval section — visible to admins/leads */}
      {showPendingSection ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-medium text-sm">
            Pending Approval ({pendingUpdates.length})
          </h3>
          {pendingUpdates.map((update) => (
            <PendingUpdateCard
              eventId={eventId}
              key={update.id}
              onApprove={() => handleApprove(update.id)}
              onDelete={() => deleteAction.trigger(update.id)}
              onEdit={handleEdit}
              onReject={() => handleReject(update.id)}
              update={update}
            />
          ))}
        </div>
      ) : null}

      {/* Your Pending Updates section — visible to non-admin authors */}
      {showMyPendingSection ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-medium text-sm">
            Your Pending Updates ({pendingUpdates.length})
          </h3>
          {pendingUpdates.map((update) => (
            <PendingUpdateCard
              eventId={eventId}
              key={update.id}
              onDelete={() => deleteAction.trigger(update.id)}
              onEdit={handleEdit}
              update={update}
            />
          ))}
        </div>
      ) : null}

      {/* Approved updates timeline */}
      {isEmpty ? (
        <p className="text-center text-muted-foreground text-sm">
          No updates yet.
        </p>
      ) : null}
      {!isEmpty && approvedUpdates.length > 0 ? (
        <UpdateTimeline
          canManage={canManage}
          eventId={eventId}
          onDelete={(id) => deleteAction.trigger(id)}
          updates={approvedUpdates}
        />
      ) : null}

      <ConfirmDialog
        cancelLabel="Keep"
        confirmLabel="Delete"
        description="Are you sure you want to delete this update? This action cannot be undone."
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            deleteAction.cancel();
          }
        }}
        open={deleteAction.isOpen}
        title="Delete update"
      />
    </div>
  );
}

function UpdateTimeline({
  canManage,
  eventId,
  onDelete,
  updates,
}: {
  canManage: boolean;
  eventId: string;
  onDelete: (id: string) => void;
  updates: readonly UpdateWithAuthor[];
}) {
  const zero = useZero();
  const { user } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleUpdate = async (id: string, content: string) => {
    setSaving(true);
    try {
      const res = await zero.mutate(
        mutators.eventUpdate.update({ id, content, now: Date.now() })
      ).server;
      handleMutationResult(res, {
        mutation: "eventUpdate.update",
        entityId: id,
        successMsg: "Update saved",
        errorMsg: "Failed to update",
      });
      if (res.type !== "error") {
        setEditingId(null);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute top-0 bottom-3.5 left-3.5 w-px bg-border" />

      <div className="flex flex-col gap-6">
        {updates.map((update) => {
          const isAuthor = update.createdBy === user.id;
          // Only admins/leads can edit approved updates (prevents post-approval content swap)
          const canEdit = canManage;
          const canDelete = isAuthor || canManage;
          const isEdited = update.updatedAt !== update.createdAt;

          return (
            <div className="relative pl-10" key={update.id}>
              {/* Avatar on the timeline */}
              <div className="absolute top-0 left-0">
                {update.author ? (
                  <UserAvatar
                    className="size-7 ring-4 ring-background"
                    fallbackClassName="text-xs"
                    user={update.author}
                  />
                ) : (
                  <div className="size-7 rounded-full bg-muted ring-4 ring-background" />
                )}
              </div>

              {/* Content card */}
              <div className="rounded-lg border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {update.author?.name ?? "Unknown"}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {format(new Date(update.createdAt), LONG_DATE_TIME)}
                  </span>
                  {isEdited ? (
                    <span className="text-muted-foreground text-xs">
                      (edited)
                    </span>
                  ) : null}

                  {(canEdit || canDelete) && editingId !== update.id ? (
                    <div className="ml-auto">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              aria-label="Update actions"
                              className="size-7"
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <HugeiconsIcon
                                className="size-3.5"
                                icon={MoreVerticalIcon}
                                strokeWidth={2}
                              />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end" className="w-28">
                          {canEdit ? (
                            <DropdownMenuItem
                              onClick={() => setEditingId(update.id)}
                            >
                              Edit
                            </DropdownMenuItem>
                          ) : null}
                          {canDelete ? (
                            <DropdownMenuItem
                              onClick={() => onDelete(update.id)}
                              variant="destructive"
                            >
                              Delete
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : null}
                </div>

                <Suspense
                  fallback={
                    editingId === update.id ? (
                      <EditorSkeleton />
                    ) : (
                      <RendererSkeleton />
                    )
                  }
                >
                  {editingId === update.id ? (
                    <PlateEditor
                      content={update.content}
                      entityId={eventId}
                      key={editingId}
                      onCancel={() => setEditingId(null)}
                      onSave={(content) => handleUpdate(update.id, content)}
                      saving={saving}
                    />
                  ) : (
                    <PlateRenderer
                      content={update.content}
                      key={update.updatedAt}
                    />
                  )}
                </Suspense>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PendingUpdateCard({
  eventId,
  onApprove,
  onDelete,
  onEdit,
  onReject,
  update,
}: {
  eventId: string;
  onApprove?: () => void;
  onDelete?: () => void;
  onEdit?: (id: string, content: string) => Promise<void>;
  onReject?: () => void;
  update: UpdateWithAuthor;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (content: string) => {
    if (!onEdit) {
      return;
    }
    setSaving(true);
    try {
      await onEdit(update.id, content);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        {update.author ? (
          <UserAvatar
            className="size-6"
            fallbackClassName="text-xs"
            user={update.author}
          />
        ) : (
          <div className="size-6 rounded-full bg-muted" />
        )}
        <span className="font-medium text-sm">
          {update.author?.name ?? "Unknown"}
        </span>
        <span className="text-muted-foreground text-xs">
          {format(new Date(update.createdAt), LONG_DATE_TIME)}
        </span>
        <Badge size="xs" variant="warning">
          Pending
        </Badge>

        {editing ? null : (
          <div className="ml-auto flex items-center gap-1">
            {onEdit ? (
              <Button
                aria-label="Edit"
                className="size-7"
                onClick={() => setEditing(true)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  className="size-4 text-muted-foreground"
                  icon={MoreVerticalIcon}
                  strokeWidth={2}
                />
              </Button>
            ) : null}
            {onApprove ? (
              <Button
                aria-label="Approve"
                className="size-7"
                onClick={onApprove}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  className="size-4 text-green-600"
                  icon={CheckmarkCircle02Icon}
                  strokeWidth={2}
                />
              </Button>
            ) : null}
            {onReject ? (
              <Button
                aria-label="Reject"
                className="size-7"
                onClick={onReject}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  className="size-4 text-destructive"
                  icon={MultiplicationSignCircleIcon}
                  strokeWidth={2}
                />
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                aria-label="Delete"
                className="size-7"
                onClick={onDelete}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  className="size-4 text-muted-foreground"
                  icon={Delete02Icon}
                  strokeWidth={2}
                />
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <Suspense fallback={editing ? <EditorSkeleton /> : <RendererSkeleton />}>
        {editing ? (
          <PlateEditor
            content={update.content}
            entityId={eventId}
            key={update.id}
            onCancel={() => setEditing(false)}
            onSave={handleSave}
            saving={saving}
          />
        ) : (
          <PlateRenderer content={update.content} key={update.updatedAt} />
        )}
      </Suspense>
    </div>
  );
}
