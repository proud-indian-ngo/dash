import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventUpdate, User } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { log } from "evlog";
import { lazy, Suspense, useCallback, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useApp } from "@/context/app-context";
import { useConfirmAction } from "@/hooks/use-confirm-action";
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
  canManage: boolean;
  eventId: string;
  updates: readonly UpdateWithAuthor[];
}

export function EventUpdates({
  canManage,
  eventId,
  updates,
}: EventUpdatesProps) {
  const zero = useZero();
  const { user } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = useCallback(
    async (content: string) => {
      setSaving(true);
      try {
        const now = Date.now();
        const id = uuidv7();
        const res = await zero.mutate(
          mutators.eventUpdate.create({
            id,
            eventId,
            content,
            now,
          })
        ).server;
        handleMutationResult(res, {
          mutation: "eventUpdate.create",
          entityId: id,
          successMsg: "Update posted",
          errorMsg: "Failed to post update",
        });
      } finally {
        setSaving(false);
      }
    },
    [zero, eventId]
  );

  const handleUpdate = useCallback(
    async (id: string, content: string) => {
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
    },
    [zero]
  );

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
      {canManage ? (
        <Suspense>
          <PlateEditor
            entityId={eventId}
            key="create"
            onSave={handleCreate}
            saving={saving}
          />
        </Suspense>
      ) : null}

      {updates.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm">
          No updates yet.
        </p>
      ) : (
        updates.map((update, index) => {
          const isAuthor = update.createdBy === user.id;
          const canEdit = isAuthor || canManage;
          const isEdited = update.updatedAt !== update.createdAt;

          return (
            <div key={update.id}>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {update.author ? (
                    <UserAvatar
                      className="size-7"
                      fallbackClassName="text-xs"
                      user={update.author}
                    />
                  ) : null}
                  <span className="font-medium text-sm">
                    {update.author?.name ?? "Unknown"}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {format(new Date(update.createdAt), "PPP p")}
                  </span>
                  {isEdited ? (
                    <span className="text-muted-foreground text-xs">
                      (edited)
                    </span>
                  ) : null}
                </div>

                <Suspense>
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

                {canEdit && editingId !== update.id ? (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setEditingId(update.id)}
                      size="sm"
                      variant="ghost"
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => deleteAction.trigger(update.id)}
                      size="sm"
                      variant="ghost"
                    >
                      Delete
                    </Button>
                  </div>
                ) : null}
              </div>
              {index < updates.length - 1 ? (
                <Separator className="mt-4" />
              ) : null}
            </div>
          );
        })
      )}

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
