import {
  Edit02Icon,
  PlusSignIcon,
  UserRemoveIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import type { TeamEventMember, User } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { useCallback } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { TeamDetailData } from "@/components/teams/team-detail";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useDialogManager } from "@/hooks/use-dialog-manager";
import { AddEventMemberDialog } from "./add-event-member-dialog";
import { EventFormDialog } from "./event-form-dialog";
import type { EventRow } from "./events-table";
import type { InterestWithUser } from "./interest-requests";
import { InterestRequests } from "./interest-requests";
import { ShowInterestDialog } from "./show-interest-dialog";

interface EventDetailProps {
  canManage: boolean;
  event: EventRow;
  interests?: readonly InterestWithUser[];
  isAdmin: boolean;
  isMember?: boolean;
  myInterest?: InterestWithUser | null;
  team: TeamDetailData;
}

type EventDialog =
  | { type: "edit" }
  | { type: "addMember" }
  | { type: "interest" };

function EventMemberRow({
  canManage,
  member,
  onRemove,
}: {
  canManage: boolean;
  member: TeamEventMember & { user: User | undefined };
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-2">
      {member.user ? (
        <UserAvatar
          className="size-8"
          fallbackClassName="text-xs"
          user={member.user}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-sm">
          {member.user?.name ?? "Unknown"}
        </div>
        <div className="text-muted-foreground text-xs">
          Added {format(new Date(member.addedAt), "PP")}
        </div>
      </div>
      {canManage ? (
        <Button onClick={() => onRemove(member.id)} size="icon" variant="ghost">
          <HugeiconsIcon className="size-4" icon={UserRemoveIcon} />
        </Button>
      ) : null}
    </div>
  );
}

function EventInfoSection({ event }: { event: EventRow }) {
  const recurrence = event.recurrenceRule as
    | { frequency: string; endDate?: string }
    | null
    | undefined;

  return (
    <>
      {event.description ? (
        <p className="text-muted-foreground text-sm">{event.description}</p>
      ) : null}

      <div className="text-sm">
        {format(new Date(event.startTime), "PPP p")}
        {event.endTime
          ? ` - ${format(new Date(event.endTime), "PPP p")}`
          : null}
      </div>

      {event.location ? (
        <div className="text-muted-foreground text-sm">{event.location}</div>
      ) : null}

      <Badge variant={event.isPublic ? "default" : "secondary"}>
        {event.isPublic ? "Public" : "Private"}
      </Badge>

      {recurrence?.frequency ? (
        <div className="text-muted-foreground text-sm">
          Recurring {recurrence.frequency}
        </div>
      ) : null}

      {event.parentEventId ? (
        <div className="text-muted-foreground text-sm">
          Part of recurring event
        </div>
      ) : null}

      {event.whatsappGroup ? (
        <div className="text-muted-foreground text-sm">
          WhatsApp: {event.whatsappGroup.name}
        </div>
      ) : null}
    </>
  );
}

const interestStatusMap = {
  pending: { label: "Interest Pending", variant: "outline" as const },
  approved: { label: "Interest Approved", variant: "default" as const },
  rejected: { label: "Interest Declined", variant: "secondary" as const },
};

function VolunteerInterestSection({
  canManage,
  interests,
  isMember,
  isPublic,
  myInterest,
  onShowInterest,
}: {
  canManage: boolean;
  interests?: readonly InterestWithUser[];
  isMember?: boolean;
  isPublic: boolean;
  myInterest?: InterestWithUser | null;
  onShowInterest: () => void;
}) {
  const zero = useZero();
  const showButton = !(canManage || isMember || myInterest) && isPublic;

  const handleCancel = useCallback(async () => {
    if (!myInterest) {
      return;
    }
    const res = await zero.mutate(
      mutators.eventInterest.cancel({ id: myInterest.id })
    ).server;
    if (res.type === "error") {
      toast.error("Failed to cancel interest");
    } else {
      toast.success("Interest cancelled");
    }
  }, [zero, myInterest]);

  return (
    <>
      {showButton ? (
        <Button onClick={onShowInterest} size="sm" variant="outline">
          Show Interest
        </Button>
      ) : null}
      {myInterest && !isMember ? (
        <div className="flex items-center gap-2">
          <Badge
            variant={
              interestStatusMap[
                myInterest.status as keyof typeof interestStatusMap
              ]?.variant ?? "outline"
            }
          >
            {interestStatusMap[
              myInterest.status as keyof typeof interestStatusMap
            ]?.label ?? myInterest.status}
          </Badge>
          {myInterest.status === "pending" ? (
            <Button onClick={handleCancel} size="sm" variant="ghost">
              Cancel Interest
            </Button>
          ) : null}
        </div>
      ) : null}
      {canManage && interests ? (
        <InterestRequests interests={interests} />
      ) : null}
    </>
  );
}

export function EventDetail({
  canManage,
  event,
  interests,
  isAdmin,
  isMember,
  myInterest,
  team,
}: EventDetailProps) {
  const zero = useZero();
  const navigate = useNavigate();

  const dialog = useDialogManager<EventDialog>();

  const cancelAction = useConfirmAction({
    onConfirm: () =>
      zero.mutate(mutators.teamEvent.cancel({ id: event.id })).server,
    onSuccess: () => {
      toast.success("Event cancelled");
      navigate({ to: "/teams/$id", params: { id: event.teamId } });
    },
    onError: () => toast.error("Failed to cancel event"),
  });

  const eventTime = event.endTime ?? event.startTime;
  const isPastEvent = new Date(eventTime) < new Date();
  const canCancel = isPastEvent ? isAdmin : canManage;
  const canManageVolunteers = isPastEvent ? isAdmin : canManage;

  const handleRemoveMember = useCallback(
    async (memberId: string) => {
      const res = await zero.mutate(
        mutators.teamEvent.removeMember({
          eventId: event.id,
          memberId,
        })
      ).server;
      if (res.type === "error") {
        toast.error("Failed to remove volunteer");
      } else {
        toast.success("Volunteer removed");
      }
    },
    [event.id, zero]
  );

  const recurrence = event.recurrenceRule as
    | { frequency: "weekly" | "biweekly" | "monthly"; endDate?: string }
    | null
    | undefined;

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-semibold text-2xl">{event.name}</h1>
            <button
              className="text-left text-muted-foreground text-sm hover:underline"
              onClick={() =>
                navigate({ to: "/teams/$id", params: { id: event.teamId } })
              }
              type="button"
            >
              {team.name}
            </button>
          </div>
          {canManage || canCancel ? (
            <div className="flex gap-2">
              {canManage ? (
                <Button
                  onClick={() => dialog.open({ type: "edit" })}
                  size="sm"
                  variant="outline"
                >
                  <HugeiconsIcon className="size-4" icon={Edit02Icon} />
                  Edit
                </Button>
              ) : null}
              {canCancel ? (
                <Button
                  onClick={() => cancelAction.trigger()}
                  size="sm"
                  variant="destructive"
                >
                  Cancel Event
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <EventInfoSection event={event} />

        <VolunteerInterestSection
          canManage={canManage}
          interests={interests}
          isMember={isMember}
          isPublic={!!event.isPublic}
          myInterest={myInterest}
          onShowInterest={() => dialog.open({ type: "interest" })}
        />

        <Separator />

        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">
            Volunteers ({event.members.length})
          </h3>
          {canManageVolunteers ? (
            <Button
              onClick={() => dialog.open({ type: "addMember" })}
              size="sm"
              variant="outline"
            >
              <HugeiconsIcon className="size-4" icon={PlusSignIcon} />
              Add Volunteer
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          {event.members.map((member) => (
            <EventMemberRow
              canManage={canManageVolunteers}
              key={member.id}
              member={member}
              onRemove={handleRemoveMember}
            />
          ))}
          {event.members.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm">
              No volunteers yet.
            </p>
          ) : null}
        </div>
      </div>

      <EventFormDialog
        initialValues={{
          id: event.id,
          name: event.name,
          description: event.description,
          location: event.location,
          startTime: event.startTime,
          endTime: event.endTime,
          isPublic: !!event.isPublic,
          whatsappGroupId: event.whatsappGroupId,
          parentEventId: event.parentEventId,
          recurrenceRule: recurrence ?? null,
        }}
        onOpenChange={dialog.onOpenChange}
        open={dialog.isOpen("edit")}
        teamId={event.teamId}
      />

      <AddEventMemberDialog
        eventId={event.id}
        existingMembers={event.members}
        onOpenChange={dialog.onOpenChange}
        open={dialog.isOpen("addMember")}
      />

      <ConfirmDialog
        cancelLabel="Keep Event"
        confirmLabel="Cancel Event"
        description={`Are you sure you want to cancel "${event.name}"? This action cannot be undone and all volunteers will be notified.`}
        loading={cancelAction.isLoading}
        loadingLabel="Cancelling..."
        onConfirm={cancelAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            cancelAction.cancel();
          }
        }}
        open={cancelAction.isOpen}
        title="Cancel event"
      />

      <ShowInterestDialog
        eventId={event.id}
        onOpenChange={dialog.onOpenChange}
        open={dialog.isOpen("interest")}
      />
    </>
  );
}
