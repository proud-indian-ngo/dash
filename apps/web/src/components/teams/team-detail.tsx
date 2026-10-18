import {
  Delete02Icon,
  Edit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { getRefCurrent } from "@pi-dash/design-system/hooks/get-ref-current";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { seriesStartDate } from "@pi-dash/shared/rrule-expand";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type {
  Programme,
  Team,
  TeamMember,
  User,
  WhatsappGroup,
} from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { log } from "evlog";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { TipStrip } from "@/components/shared/tip-strip";
import { AddMemberDialog } from "@/components/teams/add-member-dialog";
import type { EditScope } from "@/components/teams/events/edit-scope-dialog";
import {
  EditScopeDialog,
  seriesEditScopes,
} from "@/components/teams/events/edit-scope-dialog";
import { EventFormDialog } from "@/components/teams/events/event-form-dialog";
import {
  buildRowDuplicateInitialValues,
  buildRowEditInitialValues,
} from "@/components/teams/events/event-form-initial-values";
import type {
  EventDisplayRow,
  EventRow,
} from "@/components/teams/events/events-table";
import { EventsTable } from "@/components/teams/events/events-table";
import { getRowDetails } from "@/components/teams/events/events-table-helpers";
import { TeamFormDialog } from "@/components/teams/team-form-dialog";
import { TeamMembersSection } from "@/components/teams/team-members-section";
import { useApp } from "@/context/app-context";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useDialogManager } from "@/hooks/use-dialog-manager";
import { handleMutationResult } from "@/lib/mutation-result";
import { isTeamLead } from "@/lib/team-utils";

export type TeamDetailData = Team & {
  members: ReadonlyArray<TeamMember & { user: User | undefined }>;
  programme?: Programme | undefined;
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
  | { type: "duplicateEvent"; event: EventDisplayRow }
  | { type: "editEvent"; event: EventDisplayRow };

function useEditEventScope(
  dialog: ReturnType<typeof useDialogManager<TeamDialog>>
) {
  const [editScope, setEditScope] = useState<EditScope | null>(null);
  const [editScopeDialogOpen, setEditScopeDialogOpen] = useState(false);
  const [editScopeRow, setEditScopeRow] = useState<EventDisplayRow | null>(
    null
  );

  const handleEditEvent = useCallback(
    (row: EventDisplayRow) => {
      if (row.seriesId) {
        setEditScopeRow(row);
        setEditScopeDialogOpen(true);
      } else {
        dialog.open({ event: row, type: "editEvent" });
      }
    },
    [dialog]
  );

  const handleDuplicateEvent = useCallback(
    (row: EventDisplayRow) => {
      dialog.open({ event: row, type: "duplicateEvent" });
    },
    [dialog]
  );

  const handleEditScopeSelect = useCallback(
    (scope: EditScope) => {
      setEditScopeDialogOpen(false);
      setEditScope(scope);
      if (editScopeRow) {
        dialog.open({ event: editScopeRow, type: "editEvent" });
      }
    },
    [dialog, editScopeRow]
  );

  return {
    editScope,
    editScopeDialogOpen,
    editScopeRow,
    handleDuplicateEvent,
    handleEditEvent,
    handleEditScopeSelect,
    setEditScope,
    setEditScopeDialogOpen,
    setEditScopeRow,
  };
}

function useCancelEventScope(zero: ReturnType<typeof useZero>) {
  const cancelScopeRef = useRef<EditScope | null>(null);
  const [cancelScopeDialogOpen, setCancelScopeDialogOpen] = useState(false);
  const [cancelScopeRow, setCancelScopeRow] = useState<EventDisplayRow | null>(
    null
  );

  const cancelEvent = useConfirmAction<EventDisplayRow>({
    onConfirm: (row) => {
      const mode = getRefCurrent(cancelScopeRef);
      if (mode && row.seriesId) {
        const targetId = mode === "this" ? row.eventId : row.seriesId;
        return zero.mutate(
          mutators.teamEvent.cancelSeries({
            id: targetId,
            mode,
            newExceptionId: mode === "this" ? uuidv7() : undefined,
            now: Date.now(),
            originalDate: row.originalDate ?? undefined,
          })
        ).server;
      }
      return zero.mutate(
        mutators.teamEvent.cancel({ id: row.event.id, now: Date.now() })
      ).server;
    },
    onError: (msg) => {
      log.error({
        component: "TeamDetail",
        error: msg,
        mutation: "teamEvent.cancel",
      });
      toast.error(msg ?? "Failed to cancel event");
      cancelScopeRef.current = null;
      setCancelScopeRow(null);
    },
    onSuccess: () => {
      toast.success("Event cancelled");
      cancelScopeRef.current = null;
      setCancelScopeRow(null);
    },
  });

  const handleCancelEvent = useCallback(
    (row: EventDisplayRow) => {
      if (row.seriesId) {
        setCancelScopeRow(row);
        setCancelScopeDialogOpen(true);
      } else if (row.event.recurrenceRule) {
        // The series' own line is its first session; cancelling the row
        // itself would hide every session, held ones too.
        setCancelScopeRow({
          ...row,
          originalDate: seriesStartDate(row.event.startTime),
          seriesId: row.event.id,
        });
        setCancelScopeDialogOpen(true);
      } else {
        cancelEvent.trigger(row);
      }
    },
    [cancelEvent]
  );

  const handleCancelScopeSelect = useCallback(
    (scope: EditScope) => {
      setCancelScopeDialogOpen(false);
      cancelScopeRef.current = scope;
      if (cancelScopeRow) {
        cancelEvent.trigger(cancelScopeRow);
      }
    },
    [cancelEvent, cancelScopeRow]
  );

  return {
    cancelEvent,
    cancelScopeDialogOpen,
    cancelScopeRow,
    handleCancelEvent,
    handleCancelScopeSelect,
    setCancelScopeDialogOpen,
  };
}

export function TeamDetail({ team, userId }: TeamDetailProps) {
  const zero = useZero();
  const navigate = useNavigate();
  const { hasPermission } = useApp();
  const canEdit = hasPermission("teams.edit");
  const canDelete = hasPermission("teams.delete");
  const canManageMembers = hasPermission("teams.manage_members");
  const canManage = canManageMembers || isTeamLead(team.members, userId);
  const canCancelPast = hasPermission("events.cancel");
  const canCreate = hasPermission("events.create") || canManage;

  const dialog = useDialogManager<TeamDialog>();

  const deleteTeam = useConfirmAction({
    onConfirm: () => zero.mutate(mutators.team.delete({ id: team.id })).server,
    onError: (msg) => {
      log.error({
        component: "TeamDetail",
        entityId: team.id,
        error: msg,
        mutation: "team.delete",
      });
      toast.error("Failed to delete team");
    },
    onSuccess: () => {
      toast.success("Team removed");
      navigate({ to: "/teams" });
    },
  });

  const removeMember = useConfirmAction<string>({
    onConfirm: (memberId) =>
      zero.mutate(mutators.team.removeMember({ memberId, teamId: team.id }))
        .server,
    onError: (msg) => {
      log.error({
        component: "TeamDetail",
        entityId: team.id,
        error: msg,
        mutation: "team.removeMember",
      });
      toast.error("Failed to remove member");
    },
    onSuccess: () => toast.success("Member removed"),
  });

  const {
    editScope,
    setEditScope,
    editScopeDialogOpen,
    editScopeRow,
    setEditScopeDialogOpen,
    setEditScopeRow,
    handleEditEvent,
    handleDuplicateEvent,
    handleEditScopeSelect,
  } = useEditEventScope(dialog);

  const {
    cancelEvent,
    cancelScopeDialogOpen,
    cancelScopeRow,
    setCancelScopeDialogOpen,
    handleCancelEvent,
    handleCancelScopeSelect,
  } = useCancelEventScope(zero);

  const [events] = useQuery(queries.teamEvent.byTeam({ teamId: team.id }));

  const pendingInterestCount = canManage
    ? events.reduce(
        (acc, e) =>
          acc + e.interests?.filter((i) => i.status === "pending").length,
        0
      )
    : 0;

  const leadCount = team.members.filter((m) => m.role === "lead").length;

  const handleToggleRole = useEventCallback(
    async (memberId: string, currentRole: string) => {
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
        entityId: memberId,
        errorMsg: "Failed to update role",
        mutation: "team.setMemberRole",
        successMsg: `Role updated to ${newRole}`,
      });
    }
  );

  const handleSelectEvent = useEventCallback((row: EventDisplayRow) => {
    navigate({
      params: { id: row.eventId },
      search:
        row.isVirtual && row.originalDate ? { occDate: row.originalDate } : {},
      to: "/events/$id",
    });
  });

  const editEventData = dialog.getData("editEvent");
  const duplicateEventData = dialog.getData("duplicateEvent");
  const stableOnDelete0 = useEventCallback(() => deleteTeam.trigger());
  const stableOnEdit1 = useEventCallback(() => dialog.open({ type: "edit" }));
  const stableOnAddMember2 = useEventCallback(() =>
    dialog.open({ type: "addMember" })
  );
  const stableOnRemoveMember3 = useEventCallback((id: string) =>
    removeMember.trigger(id)
  );
  const stableOnClick5 = useEventCallback(() =>
    dialog.open({ type: "createEvent" })
  );
  const stableOnOpenChange6 = useEventCallback((open: boolean) => {
    dialog.onOpenChange(open);
    if (!open) {
      setEditScope(null);
      setEditScopeRow(null);
    }
  });
  const stableOnOpenChange7 = useEventCallback((open: boolean) => {
    if (!open) {
      deleteTeam.cancel();
    }
  });
  const stableOnOpenChange8 = useEventCallback((open: boolean) => {
    if (!open) {
      removeMember.cancel();
    }
  });
  const stableOnOpenChange9 = useEventCallback((open: boolean) => {
    if (!open) {
      cancelEvent.cancel();
    }
  });

  return (
    <AppErrorBoundary level="section">
      <div className="flex flex-col gap-6">
        <PageHeader
          actions={
            <>
              {canManage ? (
                <Button onClick={stableOnClick5} type="button">
                  <HugeiconsIcon
                    className="size-4"
                    icon={PlusSignIcon}
                    strokeWidth={2}
                  />
                  Create event
                </Button>
              ) : null}
              {canEdit ? (
                <Button onClick={stableOnEdit1} type="button" variant="outline">
                  <HugeiconsIcon
                    className="size-4"
                    icon={Edit02Icon}
                    strokeWidth={2}
                  />
                  Edit
                </Button>
              ) : null}
              <PageHeaderMenu
                actions={[
                  canDelete && {
                    destructive: true,
                    id: "delete",
                    icon: Delete02Icon,
                    label: "Delete team",
                    onSelect: stableOnDelete0,
                  },
                ]}
                title={team.name}
              />
            </>
          }
          description={team.description}
          meta={[
            team.programme ? (
              <span key="programme">Programme · {team.programme.name}</span>
            ) : null,
            `${team.members.length} ${team.members.length === 1 ? "member" : "members"}`,
            team.whatsappGroup ? (
              <span key="whatsapp">WhatsApp · {team.whatsappGroup.name}</span>
            ) : null,
          ]}
          title={team.name}
        />
        {isTeamLead(team.members, userId) ? (
          <TipStrip className="-mt-2" id="team-lead-tools">
            As a team lead, you can add members and create events right here.
          </TipStrip>
        ) : null}

        {/* Members */}
        <TeamMembersSection
          canManage={canManage}
          canRemoveLeads={canManageMembers}
          leadCount={leadCount}
          members={team.members}
          onAddMember={stableOnAddMember2}
          onRemoveMember={stableOnRemoveMember3}
          onToggleRole={handleToggleRole}
          userId={userId}
        />

        <section aria-label="Events" className="flex flex-col gap-2">
          <h2 className="flex min-h-7 items-center gap-2 text-sm font-medium">
            Events
            {pendingInterestCount > 0 ? (
              <StatusBadge tone="warning">
                {pendingInterestCount} pending interest
                {pendingInterestCount === 1 ? "" : "s"}
              </StatusBadge>
            ) : null}
          </h2>

          <EventsTable
            canCancelPast={canCancelPast}
            canCreate={canCreate}
            canManage={canManage}
            events={events as EventRow[]}
            onCancelEvent={handleCancelEvent}
            onDuplicateEvent={handleDuplicateEvent}
            onEditEvent={handleEditEvent}
            onSelectEvent={handleSelectEvent}
          />
        </section>

        {/* Edit Team Dialog */}
        {canEdit ? (
          <TeamFormDialog
            initialValues={{
              description: team.description,
              id: team.id,
              name: team.name,
              programmeId: team.programmeId,
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

        {/* Create event Dialog */}
        {canManage ? (
          <EventFormDialog
            onOpenChange={dialog.onOpenChange}
            open={dialog.isOpen("createEvent")}
            teamId={team.id}
            teamProgrammeId={team.programmeId}
          />
        ) : null}

        {/* Duplicate Event Dialog */}
        {duplicateEventData ? (
          <EventFormDialog
            initialValues={buildRowDuplicateInitialValues(
              duplicateEventData.event
            )}
            mode="create"
            onOpenChange={dialog.onOpenChange}
            open
            teamId={team.id}
            teamProgrammeId={team.programmeId}
          />
        ) : null}

        {/* Edit Scope Dialog */}
        <EditScopeDialog
          onOpenChange={setEditScopeDialogOpen}
          onSelect={handleEditScopeSelect}
          open={editScopeDialogOpen}
          scopes={seriesEditScopes(
            editScopeRow?.event.startTime,
            editScopeRow?.originalDate
          )}
          title="Edit recurring event"
        />

        {/* Cancel Scope Dialog */}
        <EditScopeDialog
          allLabel="All upcoming events"
          onOpenChange={setCancelScopeDialogOpen}
          onSelect={handleCancelScopeSelect}
          open={cancelScopeDialogOpen}
          scopes={seriesEditScopes(
            cancelScopeRow?.event.startTime,
            cancelScopeRow?.originalDate
          )}
          title="Cancel recurring event"
        />

        {/* Edit Event Dialog */}
        {editEventData ? (
          <EventFormDialog
            editScope={editScope ?? undefined}
            initialValues={buildRowEditInitialValues(
              editEventData.event,
              editScope
            )}
            onOpenChange={stableOnOpenChange6}
            open
            originalDate={editEventData.event.originalDate ?? undefined}
            teamId={team.id}
            teamProgrammeId={team.programmeId}
          />
        ) : null}

        {/* Delete Team Confirmation */}
        <ConfirmDialog
          confirmLabel="Delete team"
          description={`This will permanently delete "${team.name}", remove all members, and delete associated events. This action cannot be undone.`}
          loading={deleteTeam.isLoading}
          loadingLabel="Deleting..."
          onConfirm={deleteTeam.confirm}
          onOpenChange={stableOnOpenChange7}
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
          onOpenChange={stableOnOpenChange8}
          open={removeMember.isOpen}
          title="Remove member"
        />

        {/* Cancel Event Confirmation */}
        <ConfirmDialog
          cancelLabel="Keep event"
          confirmLabel="Cancel event"
          description={`Are you sure you want to cancel "${cancelEvent.payload ? getRowDetails(cancelEvent.payload).name : ""}"? This action cannot be undone and all members will be notified.`}
          loading={cancelEvent.isLoading}
          loadingLabel="Cancelling..."
          onConfirm={cancelEvent.confirm}
          onOpenChange={stableOnOpenChange9}
          open={cancelEvent.isOpen}
          title="Cancel event"
        />
      </div>
    </AppErrorBoundary>
  );
}
