import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@pi-dash/design-system/components/ui/combobox";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Switch } from "@pi-dash/design-system/components/ui/switch";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { WhatsappGroup } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { type FormEvent, useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { handleMutationResult } from "@/lib/mutation-result";

const NONE_WHATSAPP_GROUP = "__none__";

function getTeamSuccessMsg(isEdit: boolean, createWaGroup: boolean): string {
  if (isEdit) {
    return "Team updated";
  }
  if (createWaGroup) {
    return "Team created. WhatsApp group will be created shortly.";
  }
  return "Team created";
}

function submitButtonLabel(submitting: boolean, isEdit: boolean): string {
  if (submitting) {
    return isEdit ? "Saving..." : "Creating...";
  }
  return isEdit ? "Save" : "Create";
}

interface TeamFormDialogProps {
  initialValues?: {
    id: string;
    name: string;
    description: string | null;
    whatsappGroupId: string | null;
  };
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function TeamFormDialog({
  initialValues,
  onOpenChange,
  open,
}: TeamFormDialogProps) {
  const zero = useZero();
  const isEdit = !!initialValues;

  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(
    initialValues?.description ?? ""
  );
  const [whatsappGroupId, setWhatsappGroupId] = useState(
    initialValues?.whatsappGroupId
  );
  const [createWaGroup, setCreateWaGroup] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [whatsappGroups] = useQuery(queries.whatsappGroup.all());
  const [allTeams] = useQuery(queries.team.all());
  const [allEvents] = useQuery(queries.teamEvent.allAccessible());

  const usedGroupIds = new Set<string>();
  for (const t of allTeams) {
    if (t.whatsappGroupId) {
      usedGroupIds.add(t.whatsappGroupId);
    }
  }
  for (const e of allEvents) {
    if (e.whatsappGroupId) {
      usedGroupIds.add(e.whatsappGroupId);
    }
  }

  if (isEdit && initialValues?.whatsappGroupId) {
    usedGroupIds.delete(initialValues.whatsappGroupId);
  }

  const whatsappGroupOptions = whatsappGroups
    .filter((group: WhatsappGroup) => !usedGroupIds.has(group.id))
    .map((group: WhatsappGroup) => ({ label: group.name, value: group.id }));
  const whatsappGroupLabelByValue = new Map(
    whatsappGroupOptions.map((option: any) => [option.value, option.label])
  );
  const whatsappGroupItems = [
    NONE_WHATSAPP_GROUP,
    ...whatsappGroupOptions.map((option: any) => option.value),
  ];

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? "");
      setDescription(initialValues?.description ?? "");
      setWhatsappGroupId(initialValues?.whatsappGroupId);
      setCreateWaGroup(false);
    }
  }, [open, initialValues]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    setSubmitting(true);
    const mutation = isEdit
      ? zero.mutate(
          mutators.team.update({
            description: description.trim() || undefined,
            id: initialValues.id,
            name: trimmedName,
            now: Date.now(),
            whatsappGroupId: whatsappGroupId || undefined,
          })
        )
      : zero.mutate(
          mutators.team.create({
            createWhatsAppGroup: createWaGroup || undefined,
            description: description.trim() || undefined,
            id: uuidv7(),
            name: trimmedName,
            whatsappGroupId: whatsappGroupId || undefined,
          })
        );
    const res = await mutation.server;
    setSubmitting(false);
    handleMutationResult(res, {
      entityId: isEdit ? initialValues.id : "new",
      errorMsg: isEdit ? "Couldn't update team" : "Couldn't create team",
      mutation: isEdit ? "team.update" : "team.create",
      successMsg: getTeamSuccessMsg(isEdit, createWaGroup),
    });
    if (res.type !== "error") {
      onOpenChange(false);
    }
  };
  const stableOnChange0 = (e: any) => setName(e.target.value);
  const stableItemToStringLabel1 = (value: any) => {
    if (value === NONE_WHATSAPP_GROUP) {
      return "None";
    }

    return whatsappGroupLabelByValue.get(value);
  };
  const stableOnValueChange2 = (value: any) => {
    setWhatsappGroupId(value === NONE_WHATSAPP_GROUP || !value ? "" : value);
  };
  const stableOnChange3 = (e: any) => setDescription(e.target.value);
  const stableOnCheckedChange4 = (checked: any) => {
    setCreateWaGroup(checked);
    if (checked) {
      setWhatsappGroupId("");
    }
  };
  const stableOnClick5 = () => onOpenChange(false);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Team" : "Create Team"}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? "Edit team details" : "Create a new team"}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="team-name">Name</Label>
              <Input
                id="team-name"
                onChange={stableOnChange0}
                placeholder="Team name"
                required
                value={name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="team-whatsapp">WhatsApp Group</Label>
              <Combobox
                disabled={createWaGroup}
                items={whatsappGroupItems}
                itemToStringLabel={stableItemToStringLabel1}
                onValueChange={stableOnValueChange2}
                value={whatsappGroupId ?? NONE_WHATSAPP_GROUP}
              >
                <ComboboxInput
                  aria-label="WhatsApp Group"
                  className="w-full"
                  id="team-whatsapp"
                  placeholder="None"
                />
                <ComboboxContent className="w-fit min-w-[var(--anchor-width)] max-w-[min(32rem,var(--available-width))]">
                  <ComboboxList>
                    {(itemValue: any) => (
                      <ComboboxItem
                        className="items-start"
                        key={itemValue}
                        value={itemValue}
                      >
                        <span className="block min-w-0 whitespace-normal break-words">
                          {itemValue === NONE_WHATSAPP_GROUP
                            ? "None"
                            : whatsappGroupLabelByValue.get(itemValue)}
                        </span>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                  <ComboboxEmpty>No matching groups.</ComboboxEmpty>
                </ComboboxContent>
              </Combobox>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="team-description">Description</Label>
            <Textarea
              id="team-description"
              onChange={stableOnChange3}
              placeholder="Optional description"
              rows={3}
              value={description}
            />
          </div>
          {Boolean(!(isEdit || whatsappGroupId)) && (
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="create-wa-group">Create WhatsApp group</Label>
              <Switch
                checked={createWaGroup}
                id="create-wa-group"
                onCheckedChange={stableOnCheckedChange4}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={submitting}
              onClick={stableOnClick5}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={submitting || !name.trim()} type="submit">
              {submitButtonLabel(submitting, isEdit)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
