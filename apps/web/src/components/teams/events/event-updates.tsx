import {
  CheckmarkCircle02Icon,
  Delete02Icon,
  Edit02Icon,
  MultiplicationSignCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
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
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { UserHoverCard } from "@/components/shared/user-hover-card";
import { useApp } from "@/context/app-context";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { DATE_TIME } from "@/lib/date-formats";
import { deferAction, useDeferredIds } from "@/lib/deferred-actions";
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
  canUploadImages: boolean;
  eventId: string;
  isMember: boolean;
  pendingUpdates: readonly UpdateWithAuthor[];
}

export function EventUpdates({
  approvedUpdates,
  canApproveUpdates,
  canManage,
  canUploadImages,
  eventId,
  isMember,
  pendingUpdates: allPendingUpdates,
}: EventUpdatesProps) {
  const zero = useZero();
  const deferredIds = useDeferredIds();
  const pendingUpdates = allPendingUpdates.filter(
    (update) => !deferredIds.has(update.id)
  );
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

  const handleCreate = useEventCallback(async (content: string) => {
    const successMsg = isAdminOrLead
      ? "Update posted"
      : "Update submitted for approval";
    setSaving(true);
    try {
      const now = Date.now();
      const id = uuidv7();
      const res = await zero.mutate(
        mutators.eventUpdate.create({ content, eventId, id, now })
      ).server;
      handleMutationResult(res, {
        entityId: id,
        errorMsg: "Failed to post update",
        mutation: "eventUpdate.create",
        successMsg,
      });
    } catch (error) {
      setSaving(false);
      throw error;
    }
    setSaving(false);
  });

  const decide = useEventCallback(
    (id: string, decision: "approve" | "reject") => {
      const approve = decision === "approve";
      deferAction({
        ids: [id],
        key: `eventUpdate.${decision}:${id}`,
        message: approve ? "Update approved" : "Update rejected",
        run: async () => {
          const args = { id, now: Date.now() };
          const res = await zero.mutate(
            approve
              ? mutators.eventUpdate.approve(args)
              : mutators.eventUpdate.reject(args)
          ).server;
          handleMutationResult(res, {
            entityId: id,
            errorMsg: approve
              ? "Failed to approve update"
              : "Failed to reject update",
            mutation: `eventUpdate.${decision}`,
          });
        },
      });
    }
  );
  const handleApprove = useEventCallback((id: string) => decide(id, "approve"));

  const handleEdit = useEventCallback(async (id: string, content: string) => {
    const res = await zero.mutate(
      mutators.eventUpdate.update({ content, id, now: Date.now() })
    ).server;
    handleMutationResult(res, {
      entityId: id,
      errorMsg: "Failed to update",
      mutation: "eventUpdate.update",
      successMsg: "Update saved",
    });
  });

  const handleReject = useEventCallback((id: string) => decide(id, "reject"));
  const deleteAction = useConfirmAction<string>({
    onConfirm: (id) => zero.mutate(mutators.eventUpdate.delete({ id })).server,
    onError: (msg) => {
      log.error({
        component: "EventUpdates",
        error: msg ?? "unknown",
        mutation: "eventUpdate.delete",
      });
      toast.error("Couldn't delete update");
    },
    onSuccess: () => toast.success("Update removed"),
  });
  const stableOnDelete0 = useEventCallback((id: string) =>
    deleteAction.trigger(id)
  );
  const stableOnOpenChange1 = useEventCallback((open: boolean) => {
    if (!open) {
      deleteAction.cancel();
    }
  });

  return (
    <div className="flex flex-col gap-4">
      {canPost ? (
        <Suspense fallback={<EditorSkeleton />}>
          <PlateEditor
            allowImageUpload={canUploadImages}
            entityId={eventId}
            key="create"
            onSave={handleCreate}
            saving={saving}
            submitLabel="Post update"
          />
        </Suspense>
      ) : null}

      {/* Pending approval section — visible to admins/leads */}
      {showPendingSection ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">
            Pending approval ({pendingUpdates.length})
          </h3>
          {pendingUpdates.map((update) => (
            <PendingUpdateCard
              canUploadImages={canUploadImages}
              eventId={eventId}
              key={update.id}
              onApprove={handleApprove}
              onDelete={stableOnDelete0}
              onEdit={handleEdit}
              onReject={handleReject}
              update={update}
            />
          ))}
        </div>
      ) : null}

      {/* Your pending updates section — visible to non-admin authors */}
      {showMyPendingSection ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">
            Your pending updates ({pendingUpdates.length})
          </h3>
          {pendingUpdates.map((update) => (
            <PendingUpdateCard
              canUploadImages={canUploadImages}
              eventId={eventId}
              key={update.id}
              onDelete={stableOnDelete0}
              onEdit={handleEdit}
              update={update}
            />
          ))}
        </div>
      ) : null}

      {/* Approved updates timeline */}
      {isEmpty ? (
        <p className="text-muted-foreground text-center text-sm">
          No updates yet.
        </p>
      ) : null}
      {!isEmpty && approvedUpdates.length > 0 ? (
        <UpdateTimeline
          canManage={canManage}
          canUploadImages={canUploadImages}
          eventId={eventId}
          onDelete={stableOnDelete0}
          updates={approvedUpdates}
        />
      ) : null}

      <ConfirmDialog
        cancelLabel="Keep"
        confirmLabel="Delete update"
        description="Are you sure you want to delete this update? This action cannot be undone."
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={stableOnOpenChange1}
        open={deleteAction.isOpen}
        title="Delete update"
      />
    </div>
  );
}

function TimelineItem({
  canManage,
  canUploadImages,
  editingId,
  eventId,
  onDelete,
  onEdit,
  onEditStart,
  saving,
  update,
  userId,
}: {
  canManage: boolean;
  canUploadImages: boolean;
  editingId: string | null;
  eventId: string;
  onDelete: (id: string) => void;
  onEdit: (id: string, content: string) => Promise<void>;
  onEditStart: (id: string | null) => void;
  saving: boolean;
  update: UpdateWithAuthor;
  userId: string;
}) {
  const isAuthor = update.createdBy === userId;
  const canEdit = canManage;
  const canDelete = isAuthor || canManage;
  const isEdited = update.updatedAt !== update.createdAt;
  const stableOnClick2 = useEventCallback(() => onEditStart(update.id));
  const stableOnClick3 = useEventCallback(() => onDelete(update.id));
  const stableOnCancel4 = useEventCallback(() => onEditStart(null));
  const stableOnSave5 = useEventCallback((content: string) =>
    onEdit(update.id, content)
  );

  return (
    <div className="relative pl-10">
      {/* Avatar on the timeline */}
      <div className="absolute top-0 left-0">
        {update.author ? (
          <UserAvatar
            className="ring-background size-7 ring-4"
            fallbackClassName="text-xs"
            user={update.author}
          />
        ) : (
          <div className="bg-muted ring-background size-7 rounded-full ring-4" />
        )}
      </div>

      {/* Content card */}
      <div className="rounded-lg border p-4">
        <div className="mb-2 flex items-center gap-2">
          {update.author ? (
            <UserHoverCard user={update.author}>
              <span className="text-sm font-medium">{update.author.name}</span>
            </UserHoverCard>
          ) : (
            <span className="text-sm font-medium">Unknown</span>
          )}
          <span className="text-muted-foreground text-xs">
            {format(new Date(update.createdAt), DATE_TIME)}
          </span>
          {isEdited ? (
            <span className="text-muted-foreground text-xs">(edited)</span>
          ) : null}

          {(canEdit || canDelete) && editingId !== update.id ? (
            <div className="ml-auto">
              <ResponsiveActionMenu
                title="Update actions"
                trigger={<RowActionsButton aria-label="Update actions" />}
                actions={[
                  canEdit && {
                    id: "edit",
                    icon: Edit02Icon,
                    label: "Edit",
                    onSelect: stableOnClick2,
                  },
                  canDelete && {
                    id: "delete",
                    icon: Delete02Icon,
                    label: "Delete",
                    onSelect: stableOnClick3,
                    destructive: true,
                  },
                ]}
              />
            </div>
          ) : null}
        </div>

        <Suspense
          fallback={
            editingId === update.id ? <EditorSkeleton /> : <RendererSkeleton />
          }
        >
          {editingId === update.id ? (
            <PlateEditor
              allowImageUpload={canUploadImages}
              content={update.content}
              entityId={eventId}
              key={editingId}
              onCancel={stableOnCancel4}
              onSave={stableOnSave5}
              saving={saving}
              submitLabel="Save changes"
            />
          ) : (
            <PlateRenderer
              content={update.content}
              eventId={eventId}
              key={update.updatedAt}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}

function UpdateTimeline({
  canManage,
  canUploadImages,
  eventId,
  onDelete,
  updates,
}: {
  canManage: boolean;
  canUploadImages: boolean;
  eventId: string;
  onDelete: (id: string) => void;
  updates: readonly UpdateWithAuthor[];
}) {
  const zero = useZero();
  const { user } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleUpdate = useEventCallback(async (id: string, content: string) => {
    setSaving(true);
    try {
      const res = await zero.mutate(
        mutators.eventUpdate.update({ content, id, now: Date.now() })
      ).server;
      handleMutationResult(res, {
        entityId: id,
        errorMsg: "Failed to update",
        mutation: "eventUpdate.update",
        successMsg: "Update saved",
      });
      if (res.type !== "error") {
        setEditingId(null);
      }
    } catch (error) {
      setSaving(false);
      throw error;
    }
    setSaving(false);
  });

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="bg-border absolute top-0 bottom-3.5 left-3.5 w-px" />

      <div className="flex flex-col gap-6">
        {updates.map((update) => (
          <TimelineItem
            canManage={canManage}
            canUploadImages={canUploadImages}
            editingId={editingId}
            eventId={eventId}
            key={update.id}
            onDelete={onDelete}
            onEdit={handleUpdate}
            onEditStart={setEditingId}
            saving={saving}
            update={update}
            userId={user.id}
          />
        ))}
      </div>
    </div>
  );
}

function PendingUpdateCard({
  eventId,
  canUploadImages,
  onApprove,
  onDelete,
  onEdit,
  onReject,
  update,
}: {
  eventId: string;
  canUploadImages: boolean;
  onApprove?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, content: string) => Promise<void>;
  onReject?: (id: string) => void;
  update: UpdateWithAuthor;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = useEventCallback(async (content: string) => {
    if (!onEdit) {
      return;
    }
    setSaving(true);
    await onEdit(update.id, content)
      .then(() => setEditing(false))
      .finally(() => setSaving(false));
  });
  const stableOnClick6 = useEventCallback(() => setEditing(true));
  const stableOnCancel7 = useEventCallback(() => setEditing(false));
  const stableOnApprove = useEventCallback(() => onApprove?.(update.id));
  const stableOnDelete = useEventCallback(() => onDelete?.(update.id));
  const stableOnReject = useEventCallback(() => onReject?.(update.id));

  return (
    <div className="border-warning/30 bg-warning/5 rounded-lg border p-4">
      <div className="mb-2 flex items-start gap-2">
        {update.author ? (
          <UserHoverCard user={update.author}>
            <UserAvatar
              className="size-6"
              fallbackClassName="text-xs"
              user={update.author}
            />
          </UserHoverCard>
        ) : (
          <div className="bg-muted size-6 shrink-0 rounded-full" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">
            {update.author?.name ?? "Unknown"}
          </span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-muted-foreground text-xs">
              {format(new Date(update.createdAt), DATE_TIME)}
            </span>
            <StatusBadge tone="warning">Pending</StatusBadge>
          </div>
        </div>

        {editing ? null : (
          <div className="flex shrink-0 items-center gap-1 pointer-coarse:gap-2">
            {onApprove ? (
              <Button
                aria-label="Approve"
                className="size-7 pointer-coarse:size-10"
                onClick={stableOnApprove}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  className="text-success-foreground size-4"
                  icon={CheckmarkCircle02Icon}
                  strokeWidth={2}
                />
              </Button>
            ) : null}
            {onReject ? (
              <Button
                aria-label="Reject"
                className="size-7 pointer-coarse:size-10"
                onClick={stableOnReject}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  className="text-destructive size-4"
                  icon={MultiplicationSignCircleIcon}
                  strokeWidth={2}
                />
              </Button>
            ) : null}
            <ResponsiveActionMenu
              actions={[
                onEdit && {
                  icon: Edit02Icon,
                  id: "edit",
                  label: "Edit",
                  onSelect: stableOnClick6,
                },
                onDelete && {
                  destructive: true,
                  icon: Delete02Icon,
                  id: "delete",
                  label: "Delete",
                  onSelect: stableOnDelete,
                },
              ]}
              title="Update actions"
              trigger={<RowActionsButton aria-label="Update actions" />}
            />
          </div>
        )}
      </div>

      <Suspense fallback={editing ? <EditorSkeleton /> : <RendererSkeleton />}>
        {editing ? (
          <PlateEditor
            allowImageUpload={canUploadImages}
            content={update.content}
            entityId={eventId}
            key={update.id}
            onCancel={stableOnCancel7}
            onSave={handleSave}
            saving={saving}
            submitLabel="Save changes"
          />
        ) : (
          <PlateRenderer
            content={update.content}
            eventId={eventId}
            key={update.updatedAt}
          />
        )}
      </Suspense>
    </div>
  );
}
