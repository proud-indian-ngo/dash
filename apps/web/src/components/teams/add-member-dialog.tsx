import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@pi-dash/design-system/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { Label } from "@pi-dash/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { TeamMember } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";

interface AddMemberDialogProps {
  existingMembers: readonly TeamMember[];
  isAdmin: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  teamId: string;
}

export function AddMemberDialog({
  existingMembers,
  isAdmin,
  onOpenChange,
  open,
  teamId,
}: AddMemberDialogProps) {
  const zero = useZero();
  const [allUsers] = useQuery(queries.user.all());
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [role, setRole] = useState<"member" | "lead">("member");
  const [submitting, setSubmitting] = useState(false);
  const anchorRef = useComboboxAnchor();

  const existingUserIds = useMemo(
    () => new Set(existingMembers.map((m) => m.userId)),
    [existingMembers]
  );

  const availableUsers = useMemo(
    () => (allUsers ?? []).filter((u) => !existingUserIds.has(u.id)),
    [allUsers, existingUserIds]
  );

  const userMap = useMemo(
    () => new Map(availableUsers.map((u) => [u.id, u])),
    [availableUsers]
  );

  const handleAdd = useCallback(async () => {
    if (selectedUserIds.length === 0) {
      return;
    }
    setSubmitting(true);
    try {
      const effectiveRole = selectedUserIds.length > 1 ? "member" : role;
      await Promise.all(
        selectedUserIds.map((userId) =>
          zero.mutate(
            mutators.team.addMember({
              id: crypto.randomUUID(),
              teamId,
              userId,
              role: effectiveRole,
            })
          )
        )
      );
      const count = selectedUserIds.length;
      toast.success(count === 1 ? "Member added" : `${count} members added`);
      setSelectedUserIds([]);
      setRole("member");
      onOpenChange(false);
    } catch {
      toast.error("Failed to add member");
    } finally {
      setSubmitting(false);
    }
  }, [selectedUserIds, teamId, role, zero, onOpenChange]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setSelectedUserIds([]);
        setRole("member");
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  let buttonText = "Add Member";
  if (submitting) {
    buttonText = "Adding...";
  } else if (selectedUserIds.length > 1) {
    buttonText = `Add ${selectedUserIds.length} Members`;
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Search users</Label>
            <Combobox
              multiple
              onValueChange={setSelectedUserIds}
              value={selectedUserIds}
            >
              <ComboboxChips ref={anchorRef}>
                {selectedUserIds.map((id) => {
                  const user = userMap.get(id);
                  return (
                    <ComboboxChip key={id}>{user?.name ?? id}</ComboboxChip>
                  );
                })}
                <ComboboxChipsInput placeholder="Search by name or email..." />
              </ComboboxChips>
              <ComboboxContent anchor={anchorRef}>
                <ComboboxList>
                  <ComboboxEmpty>No matching users found.</ComboboxEmpty>
                  {availableUsers.map((u) => (
                    <ComboboxItem key={u.id} value={u.id}>
                      <UserAvatar
                        className="size-7"
                        fallbackClassName="text-xs"
                        user={u}
                      />
                      <div>
                        <div className="font-medium">{u.name}</div>
                        <div className="text-muted-foreground text-xs">
                          {u.email}
                        </div>
                      </div>
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          {isAdmin && selectedUserIds.length === 1 ? (
            <div className="grid gap-2">
              <Label htmlFor="member-role">Role</Label>
              <Select
                onValueChange={(v) => setRole(v as "member" | "lead")}
                value={role}
              >
                <SelectTrigger id="member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={submitting}
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={submitting || selectedUserIds.length === 0}
            onClick={handleAdd}
            type="button"
          >
            {buttonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
