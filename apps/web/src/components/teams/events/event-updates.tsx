import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventUpdate, User } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { log } from "evlog";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
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

  const handleCreate = async (content: string) => {
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
  };

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
        <Suspense fallback={<EditorSkeleton />}>
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
        <div className="relative">
          {/* Timeline line — stops at last avatar center (0.875rem = half of size-7) */}
          <div className="absolute top-0 bottom-3.5 left-3.5 w-px bg-border" />

          <div className="flex flex-col gap-6">
            {updates.map((update) => {
              const isAuthor = update.createdBy === user.id;
              const canEdit = isAuthor || canManage;
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

                      {canEdit && editingId !== update.id ? (
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
                              <DropdownMenuItem
                                onClick={() => setEditingId(update.id)}
                              >
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => deleteAction.trigger(update.id)}
                                variant="destructive"
                              >
                                Delete
                              </DropdownMenuItem>
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

function EditorSkeleton() {
  return (
    <div className="rounded-md border">
      <div className="flex gap-1 border-b p-1">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

function RendererSkeleton() {
  return (
    <div className="space-y-2 py-1">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}
