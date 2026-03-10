import {
  Delete02Icon,
  Edit02Icon,
  PlusSignIcon,
  UserRemoveIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@pi-dash/design-system/components/ui/alert-dialog";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import type {
  Team,
  TeamMember,
  User,
  WhatsappGroup,
} from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { AddMemberDialog } from "@/components/teams/add-member-dialog";
import { TeamFormDialog } from "@/components/teams/team-form-dialog";

export type TeamDetailData = Team & {
  members: ReadonlyArray<TeamMember & { user: User | undefined }>;
  whatsappGroup: WhatsappGroup | undefined;
};

interface TeamDetailProps {
  isAdmin: boolean;
  team: TeamDetailData;
  userId: string;
}

function isTeamLead(
  members: TeamDetailData["members"],
  userId: string
): boolean {
  return members.some((m) => m.userId === userId && m.role === "lead");
}

function MemberRow({
  canManage,
  canRemove,
  member,
  onRemove,
  onToggleRole,
}: {
  canManage: boolean;
  canRemove: boolean;
  member: TeamMember & { user: User | undefined };
  onRemove: (id: string) => void;
  onToggleRole: (memberId: string, currentRole: string) => void;
}) {
  const user = member.user;
  return (
    <div className="flex items-center justify-between border-b px-3 py-2.5 last:border-0">
      <div className="flex items-center gap-3">
        <UserAvatar
          className="size-8"
          user={{
            name: user?.name ?? "?",
            email: user?.email,
            gender: user?.gender,
          }}
        />
        <div>
          <div className="font-medium text-sm">
            {user?.name ?? "Unknown user"}
          </div>
          <div className="text-muted-foreground text-xs">
            Joined {format(member.joinedAt, "dd/MM/yyyy")}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={member.role === "lead" ? "default" : "secondary"}>
          {member.role === "lead" ? "Lead" : "Member"}
        </Badge>
        {canManage ? (
          <Button
            onClick={() => onToggleRole(member.id, member.role ?? "member")}
            size="sm"
            title={
              member.role === "lead" ? "Demote to member" : "Promote to lead"
            }
            type="button"
            variant="ghost"
          >
            {member.role === "lead" ? "Demote" : "Promote"}
          </Button>
        ) : null}
        {canRemove ? (
          <Button
            className="size-7"
            onClick={() => onRemove(member.id)}
            size="icon"
            title="Remove member"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              className="size-4 text-destructive"
              icon={UserRemoveIcon}
              strokeWidth={2}
            />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function TeamDetail({ isAdmin, team, userId }: TeamDetailProps) {
  const zero = useZero();
  const navigate = useNavigate();
  const canManage = isAdmin || isTeamLead(team.members, userId);

  const [editOpen, setEditOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [deleteTeamOpen, setDeleteTeamOpen] = useState(false);
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);
  const [isRemovingMember, setIsRemovingMember] = useState(false);

  const handleDeleteTeam = useCallback(async () => {
    setIsDeletingTeam(true);
    try {
      await zero.mutate(mutators.team.delete({ id: team.id }));
      toast.success("Team deleted");
      navigate({ to: "/teams" });
    } catch {
      toast.error("Failed to delete team");
    } finally {
      setIsDeletingTeam(false);
    }
  }, [zero, team.id, navigate]);

  const handleRemoveMember = useCallback(async () => {
    if (!removeMemberId) {
      return;
    }
    setIsRemovingMember(true);
    try {
      await zero.mutate(
        mutators.team.removeMember({
          teamId: team.id,
          memberId: removeMemberId,
        })
      );
      toast.success("Member removed");
      setRemoveMemberId(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to remove member";
      toast.error(msg);
    } finally {
      setIsRemovingMember(false);
    }
  }, [zero, team.id, removeMemberId]);

  const handleToggleRole = useCallback(
    async (memberId: string, currentRole: string) => {
      const newRole = currentRole === "lead" ? "member" : "lead";
      try {
        await zero.mutate(
          mutators.team.setMemberRole({ memberId, role: newRole })
        );
        toast.success(`Role updated to ${newRole}`);
      } catch {
        toast.error("Failed to update role");
      }
    },
    [zero]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl">{team.name}</h1>
          {team.description ? (
            <p className="text-muted-foreground text-sm">{team.description}</p>
          ) : null}
          {team.whatsappGroup ? (
            <p className="text-muted-foreground text-sm">
              WhatsApp: {team.whatsappGroup.name}
            </p>
          ) : null}
        </div>
        {isAdmin ? (
          <div className="flex gap-2">
            <Button
              onClick={() => setEditOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                className="size-4"
                icon={Edit02Icon}
                strokeWidth={2}
              />
              Edit
            </Button>
            <Button
              onClick={() => setDeleteTeamOpen(true)}
              size="sm"
              type="button"
              variant="destructive"
            >
              <HugeiconsIcon
                className="size-4"
                icon={Delete02Icon}
                strokeWidth={2}
              />
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      <Separator />

      {/* Members */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sm">
            Members ({team.members.length})
          </h2>
          {canManage ? (
            <Button
              onClick={() => setAddMemberOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add Member
            </Button>
          ) : null}
        </div>

        {team.members.length > 0 ? (
          <div className="overflow-hidden rounded-md border">
            {team.members.map((member) => (
              <MemberRow
                canManage={canManage}
                canRemove={isAdmin || (canManage && member.role !== "lead")}
                key={member.id}
                member={member}
                onRemove={setRemoveMemberId}
                onToggleRole={handleToggleRole}
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground text-sm">
            No members yet.
          </p>
        )}
      </div>

      {/* Edit Dialog */}
      {isAdmin ? (
        <TeamFormDialog
          initialValues={{
            id: team.id,
            name: team.name,
            description: team.description,
            whatsappGroupId: team.whatsappGroupId,
          }}
          onOpenChange={setEditOpen}
          open={editOpen}
        />
      ) : null}

      {/* Add Member Dialog */}
      {canManage ? (
        <AddMemberDialog
          existingMembers={team.members}
          isAdmin={isAdmin}
          onOpenChange={setAddMemberOpen}
          open={addMemberOpen}
          teamId={team.id}
        />
      ) : null}

      {/* Delete Team Confirmation */}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTeamOpen(false);
          }
        }}
        open={deleteTeamOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{team.name}" and remove all members.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeletingTeam}
              size="default"
              variant="outline"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingTeam}
              onClick={handleDeleteTeam}
              variant="destructive"
            >
              {isDeletingTeam ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Member Confirmation */}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setRemoveMemberId(null);
          }
        }}
        open={removeMemberId !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this member from the team?
              {team.whatsappGroup
                ? " They will also be removed from the linked WhatsApp group."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isRemovingMember}
              size="default"
              variant="outline"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isRemovingMember}
              onClick={handleRemoveMember}
              variant="destructive"
            >
              {isRemovingMember ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
