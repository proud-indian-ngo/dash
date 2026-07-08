import {
  Delete02Icon,
  PencilEdit01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { WhatsappGroup } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { log } from "evlog";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useApp } from "@/context/app-context";
import { fetchWhatsAppGroups } from "@/functions/whatsapp-groups";
import { handleMutationResult } from "@/lib/mutation-result";
import { GroupAssignments } from "./whatsapp-group-assignments";
import { GroupForm, type GroupFormValues } from "./whatsapp-group-form";
import { WhatsAppGroupPickerDialog } from "./whatsapp-group-picker-dialog";

type RowAction = { kind: "delete"; group: WhatsappGroup } | null;

type EditMode = { group: WhatsappGroup } | null;

export function WhatsAppGroupsSection() {
  const zero = useZero();
  const { hasPermission } = useApp();
  const [groups] = useQuery(queries.whatsappGroup.all());
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [rowAction, setRowAction] = useState<RowAction>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wapiConfigured, setWapiConfigured] = useState<boolean | null>(null);

  const groupList = groups ?? [];
  const canManageGroups = hasPermission("settings.whatsapp_groups");

  const existingJids = useMemo(
    () => new Set(groupList.map((g) => g.jid)),
    [groupList]
  );

  useEffect(() => {
    if (!canManageGroups) {
      return;
    }
    fetchWhatsAppGroups()
      .then((result) => setWapiConfigured(result.configured))
      .catch((error: unknown) => {
        log.error({
          action: "checkWapiConfig",
          component: "WhatsAppGroupsSection",
          error: error instanceof Error ? error.message : String(error),
        });
        // An API error (e.g. 429 rate-limit) doesn't mean WhatsApp isn't configured —
        // keep the button visible so the user can retry via the picker dialog.
        setWapiConfigured(true);
      });
  }, [canManageGroups]);

  const handleBulkCreate = useEventCallback(
    async (selectedGroups: { jid: string; name: string }[]) => {
      const results = await Promise.allSettled(
        selectedGroups.map(async (group) => {
          const id = uuidv7();
          const res = await zero.mutate(
            mutators.whatsappGroup.create({
              description: "",
              id,
              jid: group.jid,
              name: group.name,
            })
          ).server;
          return { name: group.name, res };
        })
      );

      const succeeded = results.filter(
        (r) => r.status === "fulfilled" && r.value.res.type !== "error"
      ).length;
      const failed = results.length - succeeded;

      if (failed === 0) {
        toast.success(
          succeeded === 1 ? "Group added" : `${succeeded} groups added`
        );
      } else {
        toast.error(
          `Added ${succeeded} of ${results.length} groups. ${failed} failed.`
        );
      }
    }
  );

  const handleUpdate = useEventCallback(async (values: GroupFormValues) => {
    if (!editMode) {
      return;
    }
    const res = await zero.mutate(
      mutators.whatsappGroup.update({
        description: values.description,
        id: editMode.group.id,
        jid: values.jid,
        name: values.name,
      })
    ).server;
    handleMutationResult(res, {
      entityId: editMode.group.id,
      errorMsg: "Couldn't update group",
      mutation: "whatsappGroup.update",
      successMsg: "Group updated",
    });
    if (res.type !== "error") {
      setEditMode(null);
    }
  });

  const handleDelete = useEventCallback(async () => {
    if (rowAction?.kind !== "delete") {
      return;
    }
    const res = await zero.mutate(
      mutators.whatsappGroup.delete({ id: rowAction.group.id })
    ).server;
    handleMutationResult(res, {
      entityId: rowAction.group.id,
      errorMsg: "Couldn't delete group",
      mutation: "whatsappGroup.delete",
      successMsg: "Group deleted",
    });
    if (res.type !== "error") {
      setRowAction(null);
    }
  });

  const showAddButton = canManageGroups && wapiConfigured !== false;
  const stableOnClick0 = useEventCallback(() => setPickerOpen(true));
  const stableOnOpenChange1 = useEventCallback((open: boolean) => {
    if (!open) {
      setRowAction(null);
    }
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-xs">WhatsApp Groups</p>
        {showAddButton ? (
          <Button
            disabled={wapiConfigured === null}
            onClick={stableOnClick0}
            size="sm"
            type="button"
          >
            <HugeiconsIcon
              className="size-3.5"
              icon={PlusSignIcon}
              strokeWidth={2}
            />
            Add group
          </Button>
        ) : null}
      </div>

      {groupList.length > 0 ? (
        <div className="flex flex-col gap-2">
          {groupList.map((group) => {
            const editingGroup =
              editMode && editMode.group.id === group.id
                ? editMode.group
                : null;
            return (
              <div key={group.id}>
                {editingGroup ? (
                  <div className="rounded-md border p-3">
                    <p className="mb-3 font-medium text-sm">Edit Group</p>
                    <GroupForm
                      initialValues={{
                        description: editingGroup.description ?? "",
                        jid: editingGroup.jid,
                        name: editingGroup.name,
                      }}
                      key={`edit-${group.id}`}
                      onCancel={() => setEditMode(null)}
                      onSubmit={handleUpdate}
                    />
                  </div>
                ) : (
                  <div className="flex items-start justify-between rounded-md border p-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-sm">{group.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {group.jid}
                      </span>
                      {group.description ? (
                        <span className="text-muted-foreground text-xs">
                          {group.description}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        aria-label="Edit group"
                        onClick={() => setEditMode({ group })}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <HugeiconsIcon
                          className="size-4"
                          icon={PencilEdit01Icon}
                          strokeWidth={2}
                        />
                      </Button>
                      <Button
                        aria-label="Delete group"
                        onClick={() => setRowAction({ group, kind: "delete" })}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <HugeiconsIcon
                          className="size-4"
                          icon={Delete02Icon}
                          strokeWidth={2}
                        />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {groupList.length === 0 && !editMode ? (
        <>
          <Separator />
          <p className="text-center text-muted-foreground text-xs">
            No WhatsApp groups yet.
          </p>
        </>
      ) : null}

      {groupList.length > 0 ? (
        <>
          <Separator />
          <GroupAssignments groups={groupList} />
        </>
      ) : null}

      <WhatsAppGroupPickerDialog
        existingJids={existingJids}
        onAdd={handleBulkCreate}
        onOpenChange={setPickerOpen}
        open={pickerOpen}
      />

      <ConfirmDialog
        confirmLabel="Delete"
        description={
          rowAction?.kind === "delete"
            ? `"${rowAction.group.name}" will be permanently deleted. This cannot be undone.`
            : ""
        }
        onConfirm={handleDelete}
        onOpenChange={stableOnOpenChange1}
        open={rowAction?.kind === "delete"}
        title="Delete group?"
      />
    </div>
  );
}
