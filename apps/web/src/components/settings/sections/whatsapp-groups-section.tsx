import {
  Delete02Icon,
  PencilEdit01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Label } from "@pi-dash/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { WhatsappGroup } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useMemo, useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { handleMutationResult } from "@/lib/mutation-result";

const ORIENTATION_GROUP_ID = "orientation_group_id";
const ALL_VOLUNTEERS_GROUP_ID = "all_volunteers_group_id";

const groupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  jid: z.string().min(1, "JID is required"),
  description: z.string().optional(),
});

type GroupFormValues = z.infer<typeof groupSchema>;

function GroupForm({
  initialValues,
  onCancel,
  onSubmit,
}: {
  initialValues: GroupFormValues;
  onCancel: () => void;
  onSubmit: (values: GroupFormValues) => void | Promise<void>;
}) {
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: {
      onBlur: groupSchema,
      onSubmit: groupSchema,
    },
  });

  return (
    <FormLayout form={form}>
      <div className="flex flex-col gap-3 py-2">
        <InputField isRequired label="Name" name="name" />
        <InputField isRequired label="JID" name="jid" />
        <TextareaField label="Description" name="description" />
        <FormActions
          onCancel={onCancel}
          submitLabel="Save"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}

type RowAction = { kind: "delete"; group: WhatsappGroup } | null;

type InlineMode =
  | { kind: "create" }
  | { kind: "edit"; group: WhatsappGroup }
  | null;

function GroupAssignments({ groups }: { groups: readonly WhatsappGroup[] }) {
  const zero = useZero();
  const [configRows] = useQuery(queries.appConfig.all());

  const configMap = useMemo(
    () => new Map((configRows ?? []).map((row) => [row.key, row.value])),
    [configRows]
  );

  const orientationGroupId = configMap.get(ORIENTATION_GROUP_ID) ?? "";
  const allVolunteersGroupId = configMap.get(ALL_VOLUNTEERS_GROUP_ID) ?? "";

  const groupNameMap = useMemo(
    () => new Map(groups.map((g) => [g.id, g.name])),
    [groups]
  );

  const handleChange = (key: string, value: string) => {
    zero
      .mutate(mutators.appConfig.upsert({ key, value }))
      .server.then((res) => {
        handleMutationResult(res, {
          mutation: "appConfig.upsert",
          entityId: key,
          successMsg: "Assignment updated",
          errorMsg: "Failed to update assignment",
        });
      });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="font-medium text-xs">Group Assignments</p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm">New volunteer group</Label>
          <Select
            onValueChange={(v) => {
              if (v) {
                handleChange(ORIENTATION_GROUP_ID, v);
              }
            }}
            value={orientationGroupId}
          >
            <SelectTrigger aria-label="New volunteer group">
              <SelectValue placeholder="Select a group">
                {groupNameMap.get(orientationGroupId) ?? "Select a group"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            New volunteers are added to this group when created.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm">Orientation completed group</Label>
          <Select
            onValueChange={(v) => {
              if (v) {
                handleChange(ALL_VOLUNTEERS_GROUP_ID, v);
              }
            }}
            value={allVolunteersGroupId}
          >
            <SelectTrigger aria-label="Orientation completed group">
              <SelectValue placeholder="Select a group">
                {groupNameMap.get(allVolunteersGroupId) ?? "Select a group"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Volunteers are moved here after completing orientation.
          </p>
        </div>
      </div>
    </div>
  );
}

export function WhatsAppGroupsSection() {
  const zero = useZero();
  const [groups] = useQuery(queries.whatsappGroup.all());
  const [inlineMode, setInlineMode] = useState<InlineMode>(null);
  const [rowAction, setRowAction] = useState<RowAction>(null);

  const groupList = groups ?? [];

  const handleCreate = async (values: GroupFormValues) => {
    const id = uuidv7();
    const res = await zero.mutate(
      mutators.whatsappGroup.create({
        id,
        name: values.name,
        jid: values.jid,
        description: values.description,
      })
    ).server;
    handleMutationResult(res, {
      mutation: "whatsappGroup.create",
      entityId: id,
      successMsg: "Group created",
      errorMsg: "Failed to create group",
    });
    if (res.type !== "error") {
      setInlineMode(null);
    }
  };

  const handleUpdate = async (values: GroupFormValues) => {
    if (inlineMode?.kind !== "edit") {
      return;
    }
    const res = await zero.mutate(
      mutators.whatsappGroup.update({
        id: inlineMode.group.id,
        name: values.name,
        jid: values.jid,
        description: values.description,
      })
    ).server;
    handleMutationResult(res, {
      mutation: "whatsappGroup.update",
      entityId: inlineMode.group.id,
      successMsg: "Group updated",
      errorMsg: "Failed to update group",
    });
    if (res.type !== "error") {
      setInlineMode(null);
    }
  };

  const handleDelete = async () => {
    if (rowAction?.kind !== "delete") {
      return;
    }
    const res = await zero.mutate(
      mutators.whatsappGroup.delete({ id: rowAction.group.id })
    ).server;
    handleMutationResult(res, {
      mutation: "whatsappGroup.delete",
      entityId: rowAction.group.id,
      successMsg: "Group deleted",
      errorMsg: "Failed to delete group",
    });
    if (res.type !== "error") {
      setRowAction(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-xs">WhatsApp Groups</p>
        {inlineMode ? null : (
          <Button
            onClick={() => setInlineMode({ kind: "create" })}
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
        )}
      </div>

      {inlineMode?.kind === "create" ? (
        <div className="rounded-md border p-3">
          <p className="mb-3 font-medium text-sm">Add Group</p>
          <GroupForm
            initialValues={{ name: "", jid: "", description: "" }}
            onCancel={() => setInlineMode(null)}
            onSubmit={handleCreate}
          />
        </div>
      ) : null}

      {groupList.length > 0 ? (
        <div className="flex flex-col gap-2">
          {groupList.map((group) => (
            <div key={group.id}>
              {inlineMode?.kind === "edit" &&
              inlineMode.group.id === group.id ? (
                <div className="rounded-md border p-3">
                  <p className="mb-3 font-medium text-sm">Edit Group</p>
                  <GroupForm
                    initialValues={{
                      name: inlineMode.group.name,
                      jid: inlineMode.group.jid,
                      description: inlineMode.group.description ?? "",
                    }}
                    key={`edit-${group.id}`}
                    onCancel={() => setInlineMode(null)}
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
                      onClick={() => setInlineMode({ kind: "edit", group })}
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
                      onClick={() => setRowAction({ kind: "delete", group })}
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
          ))}
        </div>
      ) : null}

      {groupList.length === 0 && !inlineMode ? (
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

      <ConfirmDialog
        confirmLabel="Delete"
        description={
          rowAction?.kind === "delete"
            ? `"${rowAction.group.name}" will be permanently deleted. This cannot be undone.`
            : ""
        }
        onConfirm={handleDelete}
        onOpenChange={(open) => {
          if (!open) {
            setRowAction(null);
          }
        }}
        open={rowAction?.kind === "delete"}
        title="Delete group?"
      />
    </div>
  );
}
