import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventUpdate, User } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { TiptapRenderer } from "@/components/editor/tiptap-renderer";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useApp } from "@/context/app-context";

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
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = useCallback(
    async (content: string) => {
      setSaving(true);
      try {
        const now = Date.now();
        const res = await zero.mutate(
          mutators.eventUpdate.create({
            id: crypto.randomUUID(),
            eventId,
            content,
            now,
          })
        ).server;
        if (res.type === "error") {
          toast.error("Failed to post update");
        } else {
          toast.success("Update posted");
          setIsCreating(false);
        }
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
        if (res.type === "error") {
          toast.error("Failed to update");
        } else {
          toast.success("Update saved");
          setEditingId(null);
        }
      } finally {
        setSaving(false);
      }
    },
    [zero]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await zero.mutate(mutators.eventUpdate.delete({ id })).server;
      if (res.type === "error") {
        toast.error("Failed to delete update");
      } else {
        toast.success("Update deleted");
      }
    },
    [zero]
  );

  return (
    <div className="flex flex-col gap-4">
      {canManage && isCreating ? (
        <TiptapEditor
          onCancel={() => setIsCreating(false)}
          onSave={handleCreate}
          saving={saving}
        />
      ) : null}
      {canManage && !isCreating ? (
        <Button onClick={() => setIsCreating(true)} size="sm" variant="outline">
          Post Update
        </Button>
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

                {editingId === update.id ? (
                  <TiptapEditor
                    content={update.content}
                    onCancel={() => setEditingId(null)}
                    onSave={(content) => handleUpdate(update.id, content)}
                    saving={saving}
                  />
                ) : (
                  <TiptapRenderer content={update.content} />
                )}

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
                      onClick={() => handleDelete(update.id)}
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
    </div>
  );
}
