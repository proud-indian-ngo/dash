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
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { TableFilterSelect } from "@/components/data-table/table-filter-select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { AddMemberDialog } from "@/components/teams/add-member-dialog";
import type { EditScope } from "@/components/teams/events/edit-scope-dialog";
import { EditScopeDialog } from "@/components/teams/events/edit-scope-dialog";
import { EventFormDialog } from "@/components/teams/events/event-form-dialog";
import type {
  EventDisplayRow,
  EventRow,
} from "@/components/teams/events/events-table";
import { EventsTable } from "@/components/teams/events/events-table";
import { getEventStatusKey } from "@/components/teams/events/events-table-helpers";
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
  | { type: "editEvent"; event: EventDisplayRow };

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

const EVENT_STATUS_OPTIONS = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Past", value: "past" },
  { label: "Cancelled", value: "cancelled" },
];
const EVENT_VISIBILITY_OPTIONS = [
  { label: "Public", value: "public" },
  { label: "Private", value: "private" },
];
const EVENT_RECURRENCE_OPTIONS = [
  { label: "One-time", value: "one-time" },
  { label: "Recurring", value: "recurring" },
];

function matchesEventFilters(
  row: EventDisplayRow,
  statusFilter: string,
  visFilter: string,
  recFilter: string
): boolean {
  if (statusFilter && getEventStatusKey(row) !== statusFilter) {
    return false;
  }
  if (visFilter) {
    if (visFilter === "public" && !row.event.isPublic) {
      return false;
    }
    if (visFilter === "private" && row.event.isPublic) {
      return false;
    }
  }
  if (recFilter) {
    const hasRule = !!row.event.recurrenceRule;
    if (recFilter === "recurring" && !hasRule) {
      return false;
    }
    if (recFilter === "one-time" && hasRule) {
      return false;
    }
  }
  return true;
}

export function TeamDetail({ team, userId }: TeamDetailProps) {
  const zero = useZero();
  const navigate = useNavigate();
  const { hasPermission } = useApp();
  const canEdit = hasPermission("teams.edit");
  const canDelete = hasPermission("teams.delete");
  const canManageMembers = hasPermission("teams.manage_members");
  const canManage = canManageMembers || isTeamLead(team.members, userId);

  const [evStatusFilter, setEvStatusFilter] = useQueryState(
    "evStatus",
    parseAsString.withDefault("")
  );
  const [evVisFilter, setEvVisFilter] = useQueryState(
    "evVis",
    parseAsString.withDefault("")
  );
  const [evRecFilter, setEvRecFilter] = useQueryState(
    "evRec",
    parseAsString.withDefault("")
  );

  const eventDisplayRowFilter = useCallback(
    (row: EventDisplayRow) =>
      matchesEventFilters(row, evStatusFilter, evVisFilter, evRecFilter),
    [evStatusFilter, evVisFilter, evRecFilter]
  );

  const dialog = useDialogManager<TeamDialog>();

  const deleteTeam = useConfirmAction({
    onConfirm: () => zero.mutate(mutators.team.delete({ id: team.id })).server,
    onSuccess: () => {
      toast.success("Team removed");
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

  // --- Edit scope state ---
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
        dialog.open({ type: "editEvent", event: row });
      }
    },
    [dialog]
  );

  const handleEditScopeSelect = useCallback(
    (scope: EditScope) => {
      setEditScopeDialogOpen(false);
      setEditScope(scope);
      if (editScopeRow) {
        dialog.open({ type: "editEvent", event: editScopeRow });
      }
    },
    [dialog, editScopeRow]
  );

  // --- Cancel scope state ---
  const cancelScopeRef = useRef<EditScope | null>(null);
  const [cancelScopeDialogOpen, setCancelScopeDialogOpen] = useState(false);
  const [cancelScopeRow, setCancelScopeRow] = useState<EventDisplayRow | null>(
    null
  );

  const cancelEvent = useConfirmAction<EventDisplayRow>({
    onConfirm: (row) => {
      const mode = cancelScopeRef.current;
      if (mode && row.seriesId) {
        // "this" targets the event itself; "following"/"all" target the series parent
        const targetId = mode === "this" ? row.eventId : row.seriesId;
        return zero.mutate(
          mutators.teamEvent.cancelSeries({
            id: targetId,
            mode,
            originalDate: row.originalDate ?? undefined,
            newExceptionId: mode === "this" ? uuidv7() : undefined,
            now: Date.now(),
          })
        ).server;
      }
      return zero.mutate(
        mutators.teamEvent.cancel({ id: row.event.id, now: Date.now() })
      ).server;
    },
    onSuccess: () => {
      toast.success("Event cancelled");
      cancelScopeRef.current = null;
      setCancelScopeRow(null);
    },
    onError: (msg) => {
      log.error({
        component: "TeamDetail",
        mutation: "teamEvent.cancel",
        error: msg ?? "unknown",
      });
      toast.error("Failed to cancel event");
      cancelScopeRef.current = null;
      setCancelScopeRow(null);
    },
  });

  const handleCancelEvent = useCallback(
    (row: EventDisplayRow) => {
      if (row.seriesId) {
        setCancelScopeRow(row);
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

  const handleSelectEvent = (row: EventDisplayRow) => {
    navigate({
      to: "/events/$id",
      params: { id: row.eventId },
      search:
        row.isVirtual && row.originalDate ? { occDate: row.originalDate } : {},
    });
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
            displayRowFilter={eventDisplayRowFilter}
            events={(events as EventRow[]) ?? []}
            hasActiveFilters={!!(evStatusFilter || evVisFilter || evRecFilter)}
            onCancelEvent={handleCancelEvent}
            onClearFilters={() => {
              setEvStatusFilter("");
              setEvVisFilter("");
              setEvRecFilter("");
            }}
            onEditEvent={handleEditEvent}
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
            toolbarFilters={
              <>
                <TableFilterSelect
                  label="Status"
                  onChange={setEvStatusFilter}
                  options={EVENT_STATUS_OPTIONS}
                  value={evStatusFilter}
                />
                <TableFilterSelect
                  label="Visibility"
                  onChange={setEvVisFilter}
                  options={EVENT_VISIBILITY_OPTIONS}
                  value={evVisFilter}
                />
                <TableFilterSelect
                  label="Recurrence"
                  onChange={setEvRecFilter}
                  options={EVENT_RECURRENCE_OPTIONS}
                  value={evRecFilter}
                />
              </>
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

        {/* Edit Scope Dialog */}
        <EditScopeDialog
          onOpenChange={setEditScopeDialogOpen}
          onSelect={handleEditScopeSelect}
          open={editScopeDialogOpen}
          title="Edit recurring event"
        />

        {/* Cancel Scope Dialog */}
        <EditScopeDialog
          onOpenChange={setCancelScopeDialogOpen}
          onSelect={handleCancelScopeSelect}
          open={cancelScopeDialogOpen}
          title="Cancel recurring event"
        />

        {/* Edit Event Dialog */}
        {editEventData ? (
          <EventFormDialog
            editScope={editScope ?? undefined}
            initialValues={{
              id: editEventData.event.eventId,
              name: editEventData.event.event.name,
              description: editEventData.event.event.description,
              endTime: editEventData.event.endTime,
              isPublic: editEventData.event.event.isPublic ?? false,
              location: editEventData.event.event.location,
              seriesId: editEventData.event.seriesId,
              recurrenceRule: editEventData.event.event.recurrenceRule as {
                rrule: string;
                exdates?: string[];
              } | null,
              startTime: editEventData.event.startTime,
              whatsappGroupId: editEventData.event.event.whatsappGroupId,
              feedbackEnabled: !!editEventData.event.event.feedbackEnabled,
              feedbackDeadline: editEventData.event.event.feedbackDeadline,
              postRsvpPoll: !!editEventData.event.event.postRsvpPoll,
              reminderIntervals:
                (editEventData.event.event.reminderIntervals as
                  | number[]
                  | null) ?? null,
            }}
            onOpenChange={(open) => {
              dialog.onOpenChange(open);
              if (!open) {
                setEditScope(null);
                setEditScopeRow(null);
              }
            }}
            open
            originalDate={editEventData.event.originalDate ?? undefined}
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
          description={`Are you sure you want to cancel "${cancelEvent.payload?.event.name}"? This action cannot be undone and all members will be notified.`}
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
