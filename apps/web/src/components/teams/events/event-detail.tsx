import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { log } from "evlog";
import { toast } from "sonner";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { TeamDetailData } from "@/components/teams/team-detail";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useDialogManager } from "@/hooks/use-dialog-manager";
import { LONG_DATE_TIME } from "@/lib/date-formats";
import { AddEventMemberDialog } from "./add-event-member-dialog";
import { EventAttendanceSection } from "./event-attendance-section";
import { EventFeedbackSection } from "./event-feedback";
import { EventFormDialog } from "./event-form-dialog";
import { EventInfoSection } from "./event-info-section";
import {
  PastInterestBadge,
  VolunteerInterestSection,
} from "./event-interest-section";
import { EventMembersSection } from "./event-members-section";
import { EventPhotos } from "./event-photos";
import { EventUpdates } from "./event-updates";
import type { EventRow } from "./events-table";
import type { InterestWithUser } from "./interest-requests";
import { ShowInterestDialog } from "./show-interest-dialog";

const TRAILING_SLASH = /\/$/;

interface EventDetailProps {
  canManage: boolean;
  canManageAttendance: boolean;
  canManageVolunteers: boolean;
  currentUserId: string;
  event: EventRow;
  interests?: readonly InterestWithUser[];
  isMember?: boolean;
  myInterest?: InterestWithUser | null;
  team?: TeamDetailData | null;
}

type EventDialog =
  | { type: "edit" }
  | { type: "addMember" }
  | { type: "interest" };

function EventHeader({
  canCancel,
  canManage,
  event,
  onCancel,
  onEdit,
  teamName,
}: {
  canCancel: boolean;
  canManage: boolean;
  event: EventRow;
  onCancel: () => void;
  onEdit: () => void;
  teamName: string | null;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display font-semibold text-2xl tracking-tight">
          {event.name}
        </h1>
        <button
          className="text-left text-muted-foreground text-sm hover:underline"
          onClick={() =>
            navigate({ to: "/teams/$id", params: { id: event.teamId } })
          }
          type="button"
        >
          {teamName ?? "Team"}
        </button>
      </div>
      {canManage || canCancel ? (
        <div className="flex gap-2">
          {canManage ? (
            <Button onClick={onEdit} size="sm" variant="outline">
              <HugeiconsIcon className="size-4" icon={Edit02Icon} />
              Edit
            </Button>
          ) : null}
          {canCancel ? (
            <Button onClick={onCancel} size="sm" variant="destructive">
              Cancel Event
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface EventTabsProps {
  approvedPhotos: Parameters<typeof EventPhotos>[0]["approvedPhotos"];
  canManage: boolean;
  currentUserId: string;
  event: EventRow;
  feedback: readonly { id: string }[];
  feedbackDeadlinePassed: boolean;
  immichAlbumUrl: string | null;
  isMember: boolean;
  isPastEvent: boolean;
  pendingPhotos: Parameters<typeof EventPhotos>[0]["pendingPhotos"];
  updates: Parameters<typeof EventUpdates>[0]["updates"];
}

function EventTabs({
  approvedPhotos,
  canManage,
  currentUserId,
  event,
  feedback,
  feedbackDeadlinePassed,
  immichAlbumUrl,
  isMember,
  isPastEvent,
  pendingPhotos,
  updates,
}: EventTabsProps) {
  return (
    <Tabs defaultValue="updates">
      <TabsList>
        <TabsTrigger value="updates">
          Updates
          {updates.length > 0 ? ` (${updates.length})` : ""}
        </TabsTrigger>
        <TabsTrigger value="photos">
          Photos
          {approvedPhotos.length > 0 ? ` (${approvedPhotos.length})` : ""}
        </TabsTrigger>
        {event.feedbackEnabled && isPastEvent ? (
          <TabsTrigger value="feedback">
            Feedback
            {feedback.length > 0 ? ` (${feedback.length})` : ""}
          </TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="updates">
        <EventUpdates
          canManage={canManage}
          eventId={event.id}
          updates={updates}
        />
      </TabsContent>
      <TabsContent value="photos">
        <EventPhotos
          approvedPhotos={approvedPhotos}
          canManage={canManage}
          currentUserId={currentUserId}
          eventId={event.id}
          immichAlbumUrl={immichAlbumUrl}
          isMember={isMember}
          pendingPhotos={pendingPhotos}
        />
      </TabsContent>
      {event.feedbackEnabled && isPastEvent ? (
        <TabsContent value="feedback">
          <EventFeedbackSection
            canManageFeedback={canManage}
            currentUserId={currentUserId}
            eventId={event.id}
            feedbackDeadline={event.feedbackDeadline}
            feedbackDeadlinePassed={feedbackDeadlinePassed}
            isMember={isMember}
          />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

export function EventDetail({
  canManage,
  canManageAttendance,
  currentUserId,
  event,
  interests,
  canManageVolunteers: canManageVolunteersProp,
  isMember,
  myInterest,
  team,
}: EventDetailProps) {
  const zero = useZero();
  const navigate = useNavigate();

  const dialog = useDialogManager<EventDialog>();

  const cancelAction = useConfirmAction({
    onConfirm: () =>
      zero.mutate(mutators.teamEvent.cancel({ id: event.id, now: Date.now() }))
        .server,
    onSuccess: () => {
      toast.success("Event cancelled");
      navigate({ to: "/teams/$id", params: { id: event.teamId } });
    },
    onError: (msg) => {
      log.error({
        component: "EventDetail",
        mutation: "teamEvent.cancel",
        entityId: event.id,
        error: msg ?? "unknown",
      });
      toast.error("Failed to cancel event");
    },
  });

  const eventTime = event.endTime ?? event.startTime;
  const isPastEvent = new Date(eventTime) < new Date();
  const hasStarted = new Date(event.startTime) <= new Date();
  const canCancel = hasStarted ? false : canManage;
  const canManageVolunteers = isPastEvent ? canManageVolunteersProp : canManage;

  const [updates] = useQuery(
    queries.eventUpdate.byEvent({ eventId: event.id })
  );
  const [approvedPhotos] = useQuery(
    queries.eventPhoto.approvedByEvent({ eventId: event.id })
  );
  const [pendingPhotos] = useQuery(
    queries.eventPhoto.pendingByEvent({ eventId: event.id })
  );
  const [album] = useQuery(
    queries.eventImmichAlbum.byEvent({ eventId: event.id })
  );

  const [feedback] = useQuery(
    queries.eventFeedback.byEvent({ eventId: event.id })
  );

  const feedbackDeadlinePassed = event.feedbackDeadline
    ? new Date(event.feedbackDeadline) < new Date()
    : false;

  const immichAlbumUrl =
    album?.immichAlbumId && env.VITE_IMMICH_URL
      ? `${env.VITE_IMMICH_URL.replace(TRAILING_SLASH, "")}/albums/${album.immichAlbumId}`
      : null;

  const removeMember = useConfirmAction<string>({
    onConfirm: (memberId) =>
      zero.mutate(
        mutators.teamEvent.removeMember({
          eventId: event.id,
          memberId,
        })
      ).server,
    onSuccess: () => toast.success("Volunteer removed"),
    onError: (msg) => {
      log.error({
        component: "EventDetail",
        mutation: "teamEvent.removeMember",
        entityId: event.id,
        error: msg ?? "unknown",
      });
      toast.error("Failed to remove volunteer");
    },
  });

  const recurrence = event.recurrenceRule as
    | { frequency: "weekly" | "biweekly" | "monthly"; endDate?: string }
    | null
    | undefined;

  return (
    <AppErrorBoundary level="section">
      <div className="flex flex-col gap-4">
        <EventHeader
          canCancel={canCancel}
          canManage={canManage}
          event={event}
          onCancel={() => cancelAction.trigger()}
          onEdit={() => dialog.open({ type: "edit" })}
          teamName={team?.name ?? null}
        />

        <EventInfoSection event={event} />

        {hasStarted ? (
          <PastInterestBadge isMember={isMember} myInterest={myInterest} />
        ) : (
          <VolunteerInterestSection
            canManage={canManage}
            interests={interests}
            isMember={isMember}
            isPublic={!!event.isPublic}
            myInterest={myInterest}
            onShowInterest={() => dialog.open({ type: "interest" })}
          />
        )}

        <Separator />

        <EventMembersSection
          canManage={canManageVolunteers}
          members={event.members}
          onAddMember={() => dialog.open({ type: "addMember" })}
          onRemoveMember={(id) => removeMember.trigger(id)}
        />

        {canManageAttendance && hasStarted ? (
          <>
            <Separator />
            <EventAttendanceSection
              eventId={event.id}
              members={event.members}
            />
          </>
        ) : null}

        {hasStarted ? (
          <>
            <Separator />
            <EventTabs
              approvedPhotos={approvedPhotos}
              canManage={canManage}
              currentUserId={currentUserId}
              event={event}
              feedback={feedback}
              feedbackDeadlinePassed={feedbackDeadlinePassed}
              immichAlbumUrl={immichAlbumUrl}
              isMember={!!isMember}
              isPastEvent={isPastEvent}
              pendingPhotos={pendingPhotos}
              updates={updates}
            />
          </>
        ) : null}
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
          feedbackEnabled: !!event.feedbackEnabled,
          feedbackDeadline: event.feedbackDeadline,
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

      <ConfirmDialog
        confirmLabel="Remove"
        description="Are you sure you want to remove this volunteer from the event?"
        loading={removeMember.isLoading}
        loadingLabel="Removing..."
        onConfirm={removeMember.confirm}
        onOpenChange={(open) => {
          if (!open) {
            removeMember.cancel();
          }
        }}
        open={removeMember.isOpen}
        title="Remove volunteer"
      />

      <ShowInterestDialog
        eventDate={format(new Date(event.startTime), LONG_DATE_TIME)}
        eventId={event.id}
        eventName={event.name}
        onOpenChange={dialog.onOpenChange}
        open={dialog.isOpen("interest")}
      />
    </AppErrorBoundary>
  );
}
