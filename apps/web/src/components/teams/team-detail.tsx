import {
  Calendar03Icon,
  Delete02Icon,
  Edit02Icon,
  PlusSignIcon,
  UserRemoveIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type {
  Team,
  TeamMember,
  User,
  WhatsappGroup,
} from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { AddMemberDialog } from "@/components/teams/add-member-dialog";
import { EventFormDialog } from "@/components/teams/events/event-form-dialog";
import type { EventRow } from "@/components/teams/events/events-table";
import { EventsTable } from "@/components/teams/events/events-table";
import { TeamFormDialog } from "@/components/teams/team-form-dialog";
import { isTeamLead } from "@/lib/team-utils";

export type TeamDetailData = Team & {
  members: ReadonlyArray<TeamMember & { user: User | undefined }>;
  whatsappGroup: WhatsappGroup | undefined;
};

interface TeamDetailProps {
  isAdmin: boolean;
  team: TeamDetailData;
  userId: string;
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

  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [editEventData, setEditEventData] = useState<EventRow | null>(null);
  const [cancelEventData, setCancelEventData] = useState<EventRow | null>(null);
  const [isCancellingEvent, setIsCancellingEvent] = useState(false);

  const [events] = useQuery(queries.teamEvent.byTeam({ teamId: team.id }));

  const handleDeleteTeam = useCallback(async () => {
    setIsDeletingTeam(true);
    const res = await zero.mutate(mutators.team.delete({ id: team.id })).server;
    if (res.type === "error") {
      setIsDeletingTeam(false);
      toast.error("Failed to delete team");
    } else {
      toast.success("Team deleted");
      navigate({ to: "/teams" });
    }
  }, [zero, team.id, navigate]);

  const handleRemoveMember = useCallback(async () => {
    if (!removeMemberId) {
      return;
    }
    setIsRemovingMember(true);
    const res = await zero.mutate(
      mutators.team.removeMember({
        teamId: team.id,
        memberId: removeMemberId,
      })
    ).server;
    setIsRemovingMember(false);
    if (res.type === "error") {
      toast.error(res.error.message || "Failed to remove member");
    } else {
      toast.success("Member removed");
      setRemoveMemberId(null);
    }
  }, [zero, team.id, removeMemberId]);

  const handleToggleRole = useCallback(
    async (memberId: string, currentRole: string) => {
      const newRole = currentRole === "lead" ? "member" : "lead";
      const res = await zero.mutate(
        mutators.team.setMemberRole({ memberId, role: newRole })
      ).server;
      if (res.type === "error") {
        toast.error("Failed to update role");
      } else {
        toast.success(`Role updated to ${newRole}`);
      }
    },
    [zero]
  );

  const handleConfirmCancelEvent = useCallback(async () => {
    if (!cancelEventData) {
      return;
    }
    setIsCancellingEvent(true);
    const res = await zero.mutate(
      mutators.teamEvent.cancel({ id: cancelEventData.id })
    ).server;
    setIsCancellingEvent(false);
    if (res.type === "error") {
      toast.error("Failed to cancel event");
    } else {
      toast.success("Event cancelled");
      setCancelEventData(null);
    }
  }, [zero, cancelEventData]);

  const handleSelectEvent = useCallback(
    (event: EventRow) => {
      navigate({ to: "/events/$id", params: { id: event.id } });
    },
    [navigate]
  );

  const handleEditEvent = useCallback((event: EventRow) => {
    setEditEventData(event);
  }, []);

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

      <Separator />

      {/* Events */}
      <div className="flex flex-col gap-3">
        <h2 className="font-medium text-sm">
          <HugeiconsIcon
            className="mr-1 inline size-4"
            icon={Calendar03Icon}
            strokeWidth={2}
          />
          Events
        </h2>

        <EventsTable
          canManage={canManage}
          events={(events as EventRow[]) ?? []}
          onCancelEvent={setCancelEventData}
          onEditEvent={handleEditEvent}
          onSelectEvent={handleSelectEvent}
          toolbarActions={
            canManage ? (
              <Button
                onClick={() => setCreateEventOpen(true)}
                size="sm"
                type="button"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                Create Event
              </Button>
            ) : undefined
          }
        />
      </div>

      {/* Edit Team Dialog */}
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

      {/* Create Event Dialog */}
      <EventFormDialog
        onOpenChange={setCreateEventOpen}
        open={createEventOpen}
        teamId={team.id}
      />

      {/* Edit Event Dialog */}
      {editEventData ? (
        <EventFormDialog
          initialValues={{
            id: editEventData.id,
            name: editEventData.name,
            description: editEventData.description,
            endTime: editEventData.endTime,
            isPublic: editEventData.isPublic ?? false,
            location: editEventData.location,
            parentEventId: editEventData.parentEventId,
            recurrenceRule: editEventData.recurrenceRule as {
              frequency: "weekly" | "biweekly" | "monthly";
              endDate?: string;
            } | null,
            startTime: editEventData.startTime,
            whatsappGroupId: editEventData.whatsappGroupId,
          }}
          onOpenChange={(open) => {
            if (!open) {
              setEditEventData(null);
            }
          }}
          open
          teamId={team.id}
        />
      ) : null}

      {/* Delete Team Confirmation */}
      <ConfirmDialog
        confirmLabel="Delete"
        description={`This will permanently delete "${team.name}" and remove all members. This action cannot be undone.`}
        loading={isDeletingTeam}
        loadingLabel="Deleting..."
        onConfirm={handleDeleteTeam}
        onOpenChange={setDeleteTeamOpen}
        open={deleteTeamOpen}
        title="Delete team"
      />

      {/* Remove Member Confirmation */}
      <ConfirmDialog
        confirmLabel="Remove"
        description={`Are you sure you want to remove this member from the team?${team.whatsappGroup ? " They will also be removed from the linked WhatsApp group." : ""}`}
        loading={isRemovingMember}
        loadingLabel="Removing..."
        onConfirm={handleRemoveMember}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveMemberId(null);
          }
        }}
        open={removeMemberId !== null}
        title="Remove member"
      />

      {/* Cancel Event Confirmation */}
      <ConfirmDialog
        cancelLabel="Keep Event"
        confirmLabel="Cancel Event"
        description={`Are you sure you want to cancel "${cancelEventData?.name}"? This action cannot be undone and all members will be notified.`}
        loading={isCancellingEvent}
        loadingLabel="Cancelling..."
        onConfirm={handleConfirmCancelEvent}
        onOpenChange={(open) => {
          if (!open) {
            setCancelEventData(null);
          }
        }}
        open={cancelEventData !== null}
        title="Cancel event"
      />
    </div>
  );
}
