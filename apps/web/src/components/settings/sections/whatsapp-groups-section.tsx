import {
  Delete02Icon,
  PencilEdit01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { WhatsappGroup } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { log } from "evlog";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";

import {
  SettingsCard,
  SettingsListItem,
} from "@/components/settings/settings-ui";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useApp } from "@/context/app-context";
import { checkWhatsAppConfiguration } from "@/functions/whatsapp-groups";
import { handleMutationResult } from "@/lib/mutation-result";

import { GroupAssignments } from "./whatsapp-group-assignments";
import { GroupForm, type GroupFormValues } from "./whatsapp-group-form";
import { WhatsAppGroupPickerDialog } from "./whatsapp-group-picker-dialog";

type RowAction = { kind: "delete"; group: WhatsappGroup } | null;

type EditMode = { group: WhatsappGroup } | null;

function WhatsAppGroupDisplayRow({
  group,
  onDelete,
  onEdit,
}: {
  group: WhatsappGroup;
  onDelete: (group: WhatsappGroup) => void;
  onEdit: (group: WhatsappGroup) => void;
}) {
  const handleEdit = useEventCallback(() => onEdit(group));
  const handleDelete = useEventCallback(() => onDelete(group));

  return (
    <SettingsListItem
      actions={
        <>
          <Button
            aria-label="Edit group"
            onClick={handleEdit}
            size="icon-sm"
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
            onClick={handleDelete}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              className="size-4"
              icon={Delete02Icon}
              strokeWidth={2}
            />
          </Button>
        </>
      }
      detail={
        <>
          <span className="font-mono">{group.jid}</span>
          {group.description ? ` · ${group.description}` : null}
        </>
      }
    >
      {group.name}
    </SettingsListItem>
  );
}

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
    checkWhatsAppConfiguration()
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
  const stableOnCancelEdit = useEventCallback(() => setEditMode(null));
  const handleEditRequest = useEventCallback((group: WhatsappGroup) =>
    setEditMode({ group })
  );
  const handleDeleteRequest = useEventCallback((group: WhatsappGroup) =>
    setRowAction({ group, kind: "delete" })
  );
  const stablePickerOpenChange = useEventCallback((open: boolean) =>
    setPickerOpen(open)
  );
  const stableOnOpenChange1 = useEventCallback((open: boolean) => {
    if (!open) {
      setRowAction(null);
    }
  });

  return (
    <div className="flex flex-col gap-8">
      <SettingsCard
        action={
          showAddButton ? (
            <Button
              disabled={wapiConfigured === null}
              onClick={stableOnClick0}
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                className="size-3.5"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add group
            </Button>
          ) : null
        }
        title={`${groupList.length} ${groupList.length === 1 ? "group" : "groups"}`}
      >
        {groupList.map((group) => {
          const editingGroup =
            editMode && editMode.group.id === group.id ? editMode.group : null;
          return editingGroup ? (
            <div className="bg-muted/30 px-4 py-3" key={group.id}>
              <h3 className="mb-3 text-sm font-medium">Edit group</h3>
              <GroupForm
                initialValues={{
                  description: editingGroup.description ?? "",
                  jid: editingGroup.jid,
                  name: editingGroup.name,
                }}
                key={`edit-${group.id}`}
                onCancel={stableOnCancelEdit}
                onSubmit={handleUpdate}
              />
            </div>
          ) : (
            <WhatsAppGroupDisplayRow
              group={group}
              key={group.id}
              onDelete={handleDeleteRequest}
              onEdit={handleEditRequest}
            />
          );
        })}
        {groupList.length === 0 && !editMode ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            No WhatsApp groups yet.
          </p>
        ) : null}
      </SettingsCard>

      {groupList.length > 0 ? <GroupAssignments groups={groupList} /> : null}

      <WhatsAppGroupPickerDialog
        existingJids={existingJids}
        onAdd={handleBulkCreate}
        onOpenChange={stablePickerOpenChange}
        open={pickerOpen}
      />

      <ConfirmDialog
        confirmLabel="Delete group"
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
