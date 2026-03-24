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
import { useCallback } from "react";
import { toast } from "sonner";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { AddMemberDialog } from "@/components/teams/add-member-dialog";
import { EventFormDialog } from "@/components/teams/events/event-form-dialog";
import type { EventRow } from "@/components/teams/events/events-table";
import { EventsTable } from "@/components/teams/events/events-table";
import { TeamFormDialog } from "@/components/teams/team-form-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useDialogManager } from "@/hooks/use-dialog-manager";
import { handleMutationResult } from "@/lib/mutation-result";
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

type TeamDialog =
  | { type: "edit" }
  | { type: "addMember" }
  | { type: "createEvent" }
  | { type: "editEvent"; event: EventRow };

function getRoleToggleTitle(isSoleLeadSelf: boolean, role: string): string {
  if (isSoleLeadSelf && role === "lead") {
    return "You are the only lead — promote another member first";
  }
  if (role === "lead") {
    return "Demote to member";
  }
  return "Promote to lead";
}

function MemberRow({
  canManage,
  canRemove,
  isSoleLeadSelf,
  member,
  onRemove,
  onToggleRole,
}: {
  canManage: boolean;
  canRemove: boolean;
  isSoleLeadSelf: boolean;
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
            disabled={isSoleLeadSelf && member.role === "lead"}
            onClick={() => onToggleRole(member.id, member.role ?? "member")}
            size="sm"
            title={getRoleToggleTitle(isSoleLeadSelf, member.role ?? "member")}
            type="button"
            variant="ghost"
          >
            {member.role === "lead" ? "Demote" : "Promote"}
          </Button>
        ) : null}
        {canRemove ? (
          <Button
            aria-label={`Remove ${user?.name ?? "member"}`}
            className="size-7"
            onClick={() => onRemove(member.id)}
            size="icon"
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

  const dialog = useDialogManager<TeamDialog>();

  const deleteTeam = useConfirmAction({
    onConfirm: () => zero.mutate(mutators.team.delete({ id: team.id })).server,
    mutationMeta: {
      mutation: "team.delete",
      entityId: team.id,
      successMsg: "Team deleted",
      errorMsg: "Failed to delete team",
    },
    onSuccess: () => {
      navigate({ to: "/teams" });
    },
  });

  const removeMember = useConfirmAction<string>({
    onConfirm: (memberId) =>
      zero.mutate(mutators.team.removeMember({ teamId: team.id, memberId }))
        .server,
    mutationMeta: {
      mutation: "team.removeMember",
      entityId: team.id,
      successMsg: "Member removed",
      errorMsg: "Failed to remove member",
    },
  });

  const cancelEvent = useConfirmAction<EventRow>({
    onConfirm: (event) =>
      zero.mutate(mutators.teamEvent.cancel({ id: event.id, now: Date.now() }))
        .server,
    mutationMeta: {
      mutation: "teamEvent.cancel",
      entityId: (event) => event.id,
      successMsg: "Event cancelled",
      errorMsg: "Failed to cancel event",
    },
  });

  const [events] = useQuery(queries.teamEvent.byTeam({ teamId: team.id }));

  const pendingInterestCount = canManage
    ? events.reduce(
        (acc, e) =>
          acc +
          (e.interests?.filter((i) => i.status === "pending").length ?? 0),
        0
      )
    : 0;

  const leadCount = team.members.filter((m) => m.role === "lead").length;

  const handleToggleRole = useCallback(
    async (memberId: string, currentRole: string) => {
      const newRole = currentRole === "lead" ? "member" : "lead";
      if (newRole === "member" && leadCount === 1) {
        toast.error(
          "Cannot demote the last lead. Promote another member first."
        );
        return;
      }
      const res = await zero.mutate(
        mutators.team.setMemberRole({ memberId, role: newRole })
      ).server;
      handleMutationResult(res, {
        mutation: "team.setMemberRole",
        entityId: memberId,
        successMsg: `Role updated to ${newRole}`,
        errorMsg: "Failed to update role",
      });
    },
    [zero, leadCount]
  );

  const handleSelectEvent = useCallback(
    (event: EventRow) => {
      navigate({ to: "/events/$id", params: { id: event.id } });
    },
    [navigate]
  );

  const editEventData = dialog.getData("editEvent");

  return (
    <AppErrorBoundary level="section">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-semibold text-2xl">{team.name}</h1>
            {team.description ? (
              <p className="text-muted-foreground text-sm">
                {team.description}
              </p>
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
                onClick={() => dialog.open({ type: "edit" })}
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
                onClick={() => deleteTeam.trigger()}
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
                onClick={() => dialog.open({ type: "addMember" })}
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
                  isSoleLeadSelf={
                    leadCount === 1 &&
                    member.role === "lead" &&
                    member.userId === userId
                  }
                  key={member.id}
                  member={member}
                  onRemove={(id) => removeMember.trigger(id)}
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
              aria-hidden="true"
              className="mr-1 inline size-4"
              icon={Calendar03Icon}
              strokeWidth={2}
            />
            Events
            {pendingInterestCount > 0 ? (
              <Badge className="ml-2" variant="outline">
                {pendingInterestCount} pending interest
                {pendingInterestCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </h2>

          <EventsTable
            canManage={canManage}
            events={(events as EventRow[]) ?? []}
            onCancelEvent={(event) => cancelEvent.trigger(event)}
            onEditEvent={(event) => dialog.open({ type: "editEvent", event })}
            onSelectEvent={handleSelectEvent}
            toolbarActions={
              canManage ? (
                <Button
                  onClick={() => dialog.open({ type: "createEvent" })}
                  size="sm"
                  type="button"
                >
                  <HugeiconsIcon
                    className="size-4"
                    icon={PlusSignIcon}
                    strokeWidth={2}
                  />
                  Add event
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
            onOpenChange={dialog.onOpenChange}
            open={dialog.isOpen("edit")}
          />
        ) : null}

        {/* Add Member Dialog */}
        {canManage ? (
          <AddMemberDialog
            existingMembers={team.members}
            isAdmin={isAdmin}
            onOpenChange={dialog.onOpenChange}
            open={dialog.isOpen("addMember")}
            teamId={team.id}
          />
        ) : null}

        {/* Create Event Dialog */}
        {canManage ? (
          <EventFormDialog
            onOpenChange={dialog.onOpenChange}
            open={dialog.isOpen("createEvent")}
            teamId={team.id}
          />
        ) : null}

        {/* Edit Event Dialog */}
        {editEventData ? (
          <EventFormDialog
            initialValues={{
              id: editEventData.event.id,
              name: editEventData.event.name,
              description: editEventData.event.description,
              endTime: editEventData.event.endTime,
              isPublic: editEventData.event.isPublic ?? false,
              location: editEventData.event.location,
              parentEventId: editEventData.event.parentEventId,
              recurrenceRule: editEventData.event.recurrenceRule as {
                frequency: "weekly" | "biweekly" | "monthly";
                endDate?: string;
              } | null,
              startTime: editEventData.event.startTime,
              whatsappGroupId: editEventData.event.whatsappGroupId,
            }}
            onOpenChange={dialog.onOpenChange}
            open
            teamId={team.id}
          />
        ) : null}

        {/* Delete Team Confirmation */}
        <ConfirmDialog
          confirmLabel="Delete"
          description={`This will permanently delete "${team.name}", remove all members, and delete associated events. This action cannot be undone.`}
          loading={deleteTeam.isLoading}
          loadingLabel="Deleting..."
          onConfirm={deleteTeam.confirm}
          onOpenChange={(open) => {
            if (!open) {
              deleteTeam.cancel();
            }
          }}
          open={deleteTeam.isOpen}
          title="Delete team"
        />

        {/* Remove Member Confirmation */}
        <ConfirmDialog
          confirmLabel="Remove"
          description={`Are you sure you want to remove this member from the team?${team.whatsappGroup ? " They will also be removed from the linked WhatsApp group." : ""}`}
          loading={removeMember.isLoading}
          loadingLabel="Removing..."
          onConfirm={removeMember.confirm}
          onOpenChange={(open) => {
            if (!open) {
              removeMember.cancel();
            }
          }}
          open={removeMember.isOpen}
          title="Remove member"
        />

        {/* Cancel Event Confirmation */}
        <ConfirmDialog
          cancelLabel="Keep Event"
          confirmLabel="Cancel Event"
          description={`Are you sure you want to cancel "${cancelEvent.payload?.name}"? This action cannot be undone and all members will be notified.`}
          loading={cancelEvent.isLoading}
          loadingLabel="Cancelling..."
          onConfirm={cancelEvent.confirm}
          onOpenChange={(open) => {
            if (!open) {
              cancelEvent.cancel();
            }
          }}
          open={cancelEvent.isOpen}
          title="Cancel event"
        />
      </div>
    </AppErrorBoundary>
  );
}
