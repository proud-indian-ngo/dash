import {
  Calendar03Icon,
  Delete02Icon,
  Edit02Icon,
  PlusSignIcon,
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
import { log } from "evlog";
import { toast } from "sonner";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { AddMemberDialog } from "@/components/teams/add-member-dialog";
import { EventFormDialog } from "@/components/teams/events/event-form-dialog";
import type { EventRow } from "@/components/teams/events/events-table";
import { EventsTable } from "@/components/teams/events/events-table";
import { TeamFormDialog } from "@/components/teams/team-form-dialog";
import { TeamMembersSection } from "@/components/teams/team-members-section";
import { useApp } from "@/context/app-context";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useDialogManager } from "@/hooks/use-dialog-manager";
import { handleMutationResult } from "@/lib/mutation-result";
import { isTeamLead } from "@/lib/team-utils";

export type TeamDetailData = Team & {
  members: ReadonlyArray<TeamMember & { user: User | undefined }>;
  whatsappGroup: WhatsappGroup | undefined;
};

interface TeamDetailProps {
  team: TeamDetailData;
  userId: string;
}

type TeamDialog =
  | { type: "edit" }
  | { type: "addMember" }
  | { type: "createEvent" }
  | { type: "editEvent"; event: EventRow };

function TeamHeaderActions({
  canDelete,
  canEdit,
  onDelete,
  onEdit,
}: {
  canDelete: boolean;
  canEdit: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) {
  if (!(canEdit || canDelete)) {
    return null;
  }
  return (
    <div className="flex gap-2">
      {canEdit ? (
        <Button onClick={onEdit} size="sm" type="button" variant="outline">
          <HugeiconsIcon className="size-4" icon={Edit02Icon} strokeWidth={2} />
          Edit
        </Button>
      ) : null}
      {canDelete ? (
        <Button
          onClick={onDelete}
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
      ) : null}
    </div>
  );
}

export function TeamDetail({ team, userId }: TeamDetailProps) {
  const zero = useZero();
  const navigate = useNavigate();
  const { hasPermission } = useApp();
  const canEdit = hasPermission("teams.edit");
  const canDelete = hasPermission("teams.delete");
  const canManageMembers = hasPermission("teams.manage_members");
  const canManage = canManageMembers || isTeamLead(team.members, userId);

  const dialog = useDialogManager<TeamDialog>();

  const deleteTeam = useConfirmAction({
    onConfirm: () => zero.mutate(mutators.team.delete({ id: team.id })).server,
    onSuccess: () => {
      toast.success("Team deleted");
      navigate({ to: "/teams" });
    },
    onError: (msg) => {
      log.error({
        component: "TeamDetail",
        mutation: "team.delete",
        entityId: team.id,
        error: msg ?? "unknown",
      });
      toast.error("Failed to delete team");
    },
  });

  const removeMember = useConfirmAction<string>({
    onConfirm: (memberId) =>
      zero.mutate(mutators.team.removeMember({ teamId: team.id, memberId }))
        .server,
    onSuccess: () => toast.success("Member removed"),
    onError: (msg) => {
      log.error({
        component: "TeamDetail",
        mutation: "team.removeMember",
        entityId: team.id,
        error: msg ?? "unknown",
      });
      toast.error("Failed to remove member");
    },
  });

  const cancelEvent = useConfirmAction<EventRow>({
    onConfirm: (event) =>
      zero.mutate(mutators.teamEvent.cancel({ id: event.id, now: Date.now() }))
        .server,
    onSuccess: () => toast.success("Event cancelled"),
    onError: (msg) => {
      log.error({
        component: "TeamDetail",
        mutation: "teamEvent.cancel",
        error: msg ?? "unknown",
      });
      toast.error("Failed to cancel event");
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

  const handleToggleRole = async (memberId: string, currentRole: string) => {
    const newRole = currentRole === "lead" ? "member" : "lead";
    if (newRole === "member" && leadCount === 1) {
      toast.warning(
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
  };

  const handleSelectEvent = (event: EventRow) => {
    navigate({ to: "/events/$id", params: { id: event.id } });
  };

  const editEventData = dialog.getData("editEvent");

  return (
    <AppErrorBoundary level="section">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-display font-semibold text-2xl tracking-tight">
              {team.name}
            </h1>
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
          <TeamHeaderActions
            canDelete={canDelete}
            canEdit={canEdit}
            onDelete={() => deleteTeam.trigger()}
            onEdit={() => dialog.open({ type: "edit" })}
          />
        </div>

        <Separator />

        {/* Members */}
        <TeamMembersSection
          canManage={canManage}
          canRemoveLeads={canManageMembers}
          leadCount={leadCount}
          members={team.members}
          onAddMember={() => dialog.open({ type: "addMember" })}
          onRemoveMember={(id) => removeMember.trigger(id)}
          onToggleRole={handleToggleRole}
          userId={userId}
        />

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
                  Create Event
                </Button>
              ) : undefined
            }
          />
        </div>

        {/* Edit Team Dialog */}
        {canEdit ? (
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
            canSetRole={canManageMembers}
            existingMembers={team.members}
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
