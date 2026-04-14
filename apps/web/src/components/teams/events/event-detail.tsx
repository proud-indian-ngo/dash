import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BrailleSpinner } from "@pi-dash/design-system/components/braille-spinner";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { env } from "@pi-dash/env/web";
import { DEFAULT_RSVP_POLL_LEAD_MINUTES } from "@pi-dash/shared/event-reminders";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { log } from "evlog";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shared/responsive-alert-dialog";
import type { TeamDetailData } from "@/components/teams/team-detail";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useDialogManager } from "@/hooks/use-dialog-manager";
import { LONG_DATE_TIME } from "@/lib/date-formats";
import { AddEventMemberDialog } from "./add-event-member-dialog";
import type { EditScope } from "./edit-scope-dialog";
import { EditScopeDialog } from "./edit-scope-dialog";
import { EventAttendanceSection } from "./event-attendance-section";
import { EventDetailsCard } from "./event-details-card";
import { EventExpenses } from "./event-expenses";
import { EventFeedbackSection } from "./event-feedback";
import { EventFormDialog } from "./event-form-dialog";
import {
  PastInterestBadge,
  VolunteerInterestSection,
} from "./event-interest-section";
import { EventMembersSection } from "./event-members-section";
import { EventPhotos } from "./event-photos";
import { EventQuickStats } from "./event-quick-stats";
import { EventUpdates } from "./event-updates";
import type { EventRow } from "./events-table";
import type { InterestWithUser } from "./interest-requests";
import { ShowInterestDialog } from "./show-interest-dialog";

const TRAILING_SLASH = /\/$/;

function buildCancelMutation(
  zero: ReturnType<typeof useZero>,
  event: EventRow,
  cancelScope: EditScope | null,
  isRecurring: boolean,
  scopeOccDate: string | undefined,
  reason?: string
) {
  const mode = cancelScope;
  const trimmedReason = reason?.trim() || undefined;
  if (mode && isRecurring) {
    // For "this": pass event.id — for virtual occurrences this is the series parent ID,
    // and the mutator creates a cancelled exception via originalDate.
    // For "following"/"all": target the series parent directly.
    const targetId = mode === "this" ? event.id : (event.seriesId ?? event.id);
    return zero.mutate(
      mutators.teamEvent.cancelSeries({
        id: targetId,
        mode,
        originalDate: scopeOccDate,
        newExceptionId: mode === "this" ? uuidv7() : undefined,
        reason: trimmedReason,
        now: Date.now(),
      })
    ).server;
  }
  return zero.mutate(
    mutators.teamEvent.cancel({
      id: event.id,
      reason: trimmedReason,
      now: Date.now(),
    })
  ).server;
}

function deriveRecurrenceState(event: EventRow, occDate: string | undefined) {
  const isVirtualOccurrence =
    !!occDate && !!event.recurrenceRule && !event.seriesId;
  const isRecurring = !!event.recurrenceRule || !!event.seriesId;
  const isOccurrence = !!occDate || !!event.seriesId;
  const scopeOccDate = occDate ?? event.originalDate ?? undefined;
  return { isVirtualOccurrence, isRecurring, isOccurrence, scopeOccDate };
}

function deriveImmichUrl(
  albumId: string | undefined | null,
  immichUrl: string | undefined
) {
  if (!(albumId && immichUrl)) {
    return null;
  }
  return `${immichUrl.replace(TRAILING_SLASH, "")}/albums/${albumId}`;
}

function getPostEventContentMessage(
  isPastEvent: boolean,
  startTime: number | Date
) {
  const lead = isPastEvent
    ? "This event took place on"
    : "This event is scheduled for";
  return `${lead} ${format(new Date(startTime), LONG_DATE_TIME)}. Post-event updates, photos, and feedback will appear here soon.`;
}

function InterestSection(props: {
  canManage: boolean;
  dialog: ReturnType<typeof useDialogManager<EventDialog>>;
  event: EventRow;
  hasStarted: boolean;
  interests?: readonly InterestWithUser[];
  isMember?: boolean;
  myInterest?: InterestWithUser | null;
}) {
  if (props.hasStarted) {
    return (
      <PastInterestBadge
        isMember={props.isMember}
        myInterest={props.myInterest}
      />
    );
  }

  return (
    <VolunteerInterestSection
      canManage={props.canManage}
      interests={props.interests}
      isMember={props.isMember}
      isPublic={!!props.event.isPublic}
      myInterest={props.myInterest}
      onShowInterest={() => props.dialog.open({ type: "interest" })}
    />
  );
}

function deriveAddMemberTarget(
  scope: EditScope | null,
  event: EventRow,
  isVirtualOccurrence: boolean,
  materializeOccurrence: () => Promise<string | null>
) {
  if (scope === "all" || scope === "following") {
    return {
      addMemberEventId: event.seriesId ?? event.id,
      addMemberOnBeforeAdd: undefined,
    };
  }
  return {
    addMemberEventId: event.id,
    addMemberOnBeforeAdd: isVirtualOccurrence
      ? materializeOccurrence
      : undefined,
  };
}

interface EventDetailProps {
  canApproveUpdates: boolean;
  canManage: boolean;
  canManageAttendance: boolean;
  canManageFeedback: boolean;
  canManagePhotos: boolean;
  canManageVolunteers: boolean;
  event: EventRow;
  interests?: readonly InterestWithUser[];
  isMember?: boolean;
  myInterest?: InterestWithUser | null;
  /** ISO date (YYYY-MM-DD) when viewing a virtual occurrence of a series. */
  occDate?: string;
  team?: TeamDetailData | null;
}

type EventDialog =
  | { type: "edit" }
  | { type: "addMember" }
  | { type: "interest" };

function useScopeDialogs(
  isOccurrence: boolean,
  isRecurring: boolean,
  scopeOccDate: string | undefined,
  event: EventRow,
  dialog: ReturnType<typeof useDialogManager<EventDialog>>
) {
  const zero = useZero();
  const navigate = useNavigate();

  // --- Edit scope ---
  const [editScope, setEditScope] = useState<EditScope | null>(null);
  const [editScopeDialogOpen, setEditScopeDialogOpen] = useState(false);

  const handleEditClick = isOccurrence
    ? () => setEditScopeDialogOpen(true)
    : () => dialog.open({ type: "edit" });

  const handleEditScopeSelect = useCallback(
    (scope: EditScope) => {
      setEditScopeDialogOpen(false);
      setEditScope(scope);
      dialog.open({ type: "edit" });
    },
    [dialog]
  );

  // --- Cancel scope ---
  const [cancelScopeDialogOpen, setCancelScopeDialogOpen] = useState(false);
  const cancelScopeRef = useRef<EditScope | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const cancelAction = useConfirmAction({
    onConfirm: () =>
      buildCancelMutation(
        zero,
        event,
        cancelScopeRef.current,
        isRecurring,
        scopeOccDate,
        cancelReason
      ),
    onSuccess: () => {
      toast.success("Event cancelled");
      cancelScopeRef.current = null;
      setCancelReason("");
      navigate({ to: "/teams/$id", params: { id: event.teamId } });
    },
    onError: (msg) => {
      log.error({
        component: "EventDetail",
        mutation: "teamEvent.cancel",
        entityId: event.id,
        error: msg ?? "unknown",
      });
      toast.error("Couldn't cancel event");
      cancelScopeRef.current = null;
    },
  });

  const handleCancelClick = isOccurrence
    ? () => setCancelScopeDialogOpen(true)
    : () => cancelAction.trigger();

  const handleCancelScopeSelect = useCallback(
    (scope: EditScope) => {
      setCancelScopeDialogOpen(false);
      cancelScopeRef.current = scope;
      cancelAction.trigger();
    },
    [cancelAction]
  );

  // --- Add member scope ---
  const [addMemberScopeDialogOpen, setAddMemberScopeDialogOpen] =
    useState(false);
  const [addMemberScope, setAddMemberScope] = useState<EditScope | null>(null);

  const handleAddMemberClick = isOccurrence
    ? () => setAddMemberScopeDialogOpen(true)
    : () => dialog.open({ type: "addMember" });

  const handleAddMemberScopeSelect = useCallback(
    (scope: EditScope) => {
      setAddMemberScopeDialogOpen(false);
      setAddMemberScope(scope);
      dialog.open({ type: "addMember" });
    },
    [dialog]
  );

  return {
    editScope,
    setEditScope,
    editScopeDialogOpen,
    setEditScopeDialogOpen,
    handleEditClick,
    handleEditScopeSelect,
    cancelScopeDialogOpen,
    setCancelScopeDialogOpen,
    cancelReason,
    setCancelReason,
    cancelAction,
    handleCancelClick,
    handleCancelScopeSelect,
    addMemberScope,
    setAddMemberScope,
    addMemberScopeDialogOpen,
    setAddMemberScopeDialogOpen,
    handleAddMemberClick,
    handleAddMemberScopeSelect,
  };
}

type EventStatus = "upcoming" | "in-progress" | "completed" | "cancelled";

const STATUS_CONFIG: Record<
  EventStatus,
  {
    label: string;
    variant: "outline" | "secondary" | "default" | "destructive-light";
  }
> = {
  upcoming: { label: "Upcoming", variant: "outline" },
  "in-progress": { label: "In Progress", variant: "secondary" },
  completed: { label: "Completed", variant: "default" },
  cancelled: { label: "Cancelled", variant: "destructive-light" },
};

function deriveEventStatus(event: EventRow): EventStatus {
  if (event.cancelledAt) {
    return "cancelled";
  }
  const now = new Date();
  const eventEnd = event.endTime ?? event.startTime;
  if (new Date(eventEnd) < now) {
    return "completed";
  }
  if (new Date(event.startTime) <= now) {
    return "in-progress";
  }
  return "upcoming";
}

function EventHeader({
  canCancel,
  canManage,
  event,
  onCancel,
  onEdit,
  status,
  teamName,
}: {
  canCancel: boolean;
  canManage: boolean;
  event: EventRow;
  onCancel: () => void;
  onEdit: () => void;
  status: EventStatus;
  teamName: string | null;
}) {
  const navigate = useNavigate();
  const { label, variant } = STATUS_CONFIG[status];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="font-display font-semibold text-2xl tracking-tight">
            {event.name}
          </h1>
          <Badge size="sm" variant={variant}>
            {label}
          </Badge>
        </div>
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
  approvedUpdates: Parameters<typeof EventUpdates>[0]["approvedUpdates"];
  canApproveUpdates: boolean;
  canManage: boolean;
  canManageFeedback: boolean;
  canManagePhotos: boolean;
  event: EventRow;
  feedback: readonly { id: string }[];
  feedbackDeadlinePassed: boolean;
  immichAlbumUrl: string | null;
  isMember: boolean;
  isPastEvent: boolean;
  memberCount: number;
  occDate?: string;
  pendingPhotos: Parameters<typeof EventPhotos>[0]["pendingPhotos"];
  pendingUpdates: Parameters<typeof EventUpdates>[0]["pendingUpdates"];
}

function EventTabs({
  approvedPhotos,
  approvedUpdates,
  canApproveUpdates,
  canManage,
  canManageFeedback,
  canManagePhotos,
  event,
  feedback,
  feedbackDeadlinePassed,
  immichAlbumUrl,
  isMember,
  isPastEvent,
  memberCount,
  occDate,
  pendingPhotos,
  pendingUpdates,
}: EventTabsProps) {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral([
      "updates",
      "photos",
      "feedback",
      "expenses",
    ]).withDefault("updates")
  );

  return (
    <Tabs
      onValueChange={(v) =>
        setTab(v as "updates" | "photos" | "feedback" | "expenses")
      }
      value={tab}
    >
      <TabsList>
        <TabsTrigger value="updates">
          Updates
          {approvedUpdates.length > 0 ? ` (${approvedUpdates.length})` : ""}
          {canApproveUpdates && pendingUpdates.length > 0 ? (
            <Badge size="xs" variant="warning">
              {pendingUpdates.length}
            </Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="photos">
          Photos &amp; Videos
          {approvedPhotos.length > 0 ? ` (${approvedPhotos.length})` : ""}
          {canManagePhotos && pendingPhotos.length > 0 ? (
            <Badge size="xs" variant="warning">
              {pendingPhotos.length}
            </Badge>
          ) : null}
        </TabsTrigger>
        {event.feedbackEnabled && isPastEvent ? (
          <TabsTrigger value="feedback">
            Feedback
            {feedback.length > 0 ? ` (${feedback.length})` : ""}
          </TabsTrigger>
        ) : null}
        {canManage ? (
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="updates">
        <EventUpdates
          approvedUpdates={approvedUpdates}
          canApproveUpdates={canApproveUpdates}
          canManage={canManage}
          eventId={event.id}
          isMember={isMember}
          pendingUpdates={pendingUpdates}
        />
      </TabsContent>
      <TabsContent value="photos">
        <EventPhotos
          approvedPhotos={approvedPhotos}
          canManage={canManagePhotos}
          eventId={event.id}
          immichAlbumUrl={immichAlbumUrl}
          isMember={isMember}
          occDate={occDate}
          pendingPhotos={pendingPhotos}
        />
      </TabsContent>
      {event.feedbackEnabled && isPastEvent ? (
        <TabsContent value="feedback">
          <EventFeedbackSection
            canManageFeedback={canManageFeedback}
            eventId={event.id}
            feedbackDeadline={event.feedbackDeadline}
            feedbackDeadlinePassed={feedbackDeadlinePassed}
            isMember={isMember}
            memberCount={memberCount}
          />
        </TabsContent>
      ) : null}
      {canManage ? (
        <TabsContent value="expenses">
          <EventExpenses eventId={event.id} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

/**
 * Queries for the event detail page. Pending queries use `enabled` flags to
 * control Zero subscriptions: approvers/leads get all pending, regular members
 * get only their own (via ctx.userId in myPendingByEvent).
 *
 * Note: pendingByEvent has no query-level auth because team lead status is
 * per-team and ZQL can't check team membership. The `enabled` flag prevents
 * non-approvers from subscribing. Mutators enforce team-scoped authorization.
 */
function useEventDetailQueries(
  eventId: string,
  canApproveUpdates: boolean,
  canManagePhotos: boolean
) {
  const [approvedUpdates] = useQuery(
    queries.eventUpdate.approvedByEvent({ eventId })
  );
  const [allPendingUpdates] = useQuery(
    queries.eventUpdate.pendingByEvent({ eventId }),
    { enabled: canApproveUpdates }
  );
  const [myPendingUpdates] = useQuery(
    queries.eventUpdate.myPendingByEvent({ eventId }),
    { enabled: !canApproveUpdates }
  );
  const pendingUpdates = canApproveUpdates
    ? allPendingUpdates
    : myPendingUpdates;

  const [approvedPhotos] = useQuery(
    queries.eventPhoto.approvedByEvent({ eventId })
  );
  const [allPendingPhotos] = useQuery(
    queries.eventPhoto.pendingByEvent({ eventId }),
    { enabled: canManagePhotos }
  );
  const [myPendingPhotos] = useQuery(
    queries.eventPhoto.myPendingByEvent({ eventId }),
    { enabled: !canManagePhotos }
  );
  const pendingPhotos = canManagePhotos ? allPendingPhotos : myPendingPhotos;

  const [album] = useQuery(queries.eventImmichAlbum.byEvent({ eventId }));
  const [feedback] = useQuery(queries.eventFeedback.byEvent({ eventId }));
  const [eventReimbursements] = useQuery(
    queries.reimbursement.byEvent({ eventId })
  );
  const [eventVendorPayments] = useQuery(
    queries.vendorPayment.byEvent({ eventId })
  );

  return {
    approvedUpdates,
    pendingUpdates,
    approvedPhotos,
    pendingPhotos,
    album,
    feedback,
    eventReimbursements,
    eventVendorPayments,
  };
}

function calcTotalExpenses(
  reimbursements:
    | readonly { lineItems: readonly { amount: number }[] }[]
    | null
    | undefined,
  vendorPayments:
    | readonly { lineItems: readonly { amount: number }[] }[]
    | null
    | undefined
): number {
  return [...(reimbursements ?? []), ...(vendorPayments ?? [])].reduce(
    (sum, expense) =>
      sum + expense.lineItems.reduce((s, li) => s + li.amount, 0),
    0
  );
}

export function EventDetail({
  canApproveUpdates,
  canManage,
  canManageAttendance,
  canManageFeedback,
  canManagePhotos,
  canManageVolunteers: canManageVolunteersProp,
  event,
  interests,
  isMember,
  myInterest,
  occDate,
  team,
}: EventDetailProps) {
  const zero = useZero();
  const navigate = useNavigate();

  const { isVirtualOccurrence, isRecurring, isOccurrence, scopeOccDate } =
    deriveRecurrenceState(event, occDate);

  /** Materialize a virtual occurrence into an exception row, then navigate to it. */
  const materializeOccurrence = useCallback(async (): Promise<
    string | null
  > => {
    if (!(isVirtualOccurrence && occDate)) {
      return null;
    }
    const newId = uuidv7();
    const res = await zero.mutate(
      mutators.teamEvent.materialize({
        id: newId,
        seriesId: event.id,
        originalDate: occDate,
        now: Date.now(),
      })
    ).server;
    if (res.type === "error") {
      toast.error("Couldn't create occurrence");
      return null;
    }
    navigate({ to: "/events/$id", params: { id: newId } });
    return newId;
  }, [isVirtualOccurrence, occDate, event.id, zero, navigate]);

  const dialog = useDialogManager<EventDialog>();

  const {
    editScope,
    setEditScope,
    editScopeDialogOpen,
    setEditScopeDialogOpen,
    handleEditClick,
    handleEditScopeSelect,
    cancelScopeDialogOpen,
    setCancelScopeDialogOpen,
    cancelReason,
    setCancelReason,
    cancelAction,
    handleCancelClick,
    handleCancelScopeSelect,
    addMemberScope,
    setAddMemberScope,
    addMemberScopeDialogOpen,
    setAddMemberScopeDialogOpen,
    handleAddMemberClick,
    handleAddMemberScopeSelect,
  } = useScopeDialogs(isOccurrence, isRecurring, scopeOccDate, event, dialog);

  const { addMemberEventId, addMemberOnBeforeAdd } = deriveAddMemberTarget(
    addMemberScope,
    event,
    isVirtualOccurrence,
    materializeOccurrence
  );

  const status = deriveEventStatus(event);
  const eventTime = event.endTime ?? event.startTime;
  const isPastEvent = new Date(eventTime) < new Date();
  const hasStarted = new Date(event.startTime) <= new Date();
  const canAccessPostEventContent = isPastEvent && !isVirtualOccurrence;
  const canCancel = hasStarted ? false : canManage;
  const canManageVolunteers = isPastEvent ? canManageVolunteersProp : canManage;

  const {
    approvedUpdates,
    pendingUpdates,
    approvedPhotos,
    pendingPhotos,
    album,
    feedback,
    eventReimbursements,
    eventVendorPayments,
  } = useEventDetailQueries(event.id, canApproveUpdates, canManagePhotos);

  const totalExpenses = calcTotalExpenses(
    eventReimbursements,
    eventVendorPayments
  );

  const feedbackDeadlinePassed =
    !!event.feedbackDeadline && new Date(event.feedbackDeadline) < new Date();

  const immichAlbumUrl = deriveImmichUrl(
    album?.immichAlbumId,
    env.VITE_IMMICH_URL
  );

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
      toast.error("Couldn't remove volunteer");
    },
  });

  const recurrence = event.recurrenceRule as
    | { rrule: string; exdates?: string[] }
    | null
    | undefined;

  const presentCount = event.members.filter(
    (m) => m.attendance === "present"
  ).length;

  return (
    <AppErrorBoundary level="section">
      <div className="flex flex-col gap-6">
        <EventHeader
          canCancel={canCancel}
          canManage={canManage}
          event={event}
          onCancel={handleCancelClick}
          onEdit={handleEditClick}
          status={status}
          teamName={team?.name ?? null}
        />

        {/* Mobile-only details card (above tabs) */}
        <div className="lg:hidden">
          <EventDetailsCard canManage={canManage} event={event} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Main column */}
          <div className="lg:col-span-3">
            {event.description ? (
              <p className="mb-6 whitespace-pre-line text-muted-foreground text-sm">
                {event.description}
              </p>
            ) : null}

            {canAccessPostEventContent ? (
              <EventTabs
                approvedPhotos={approvedPhotos}
                approvedUpdates={approvedUpdates}
                canApproveUpdates={canApproveUpdates}
                canManage={canManage}
                canManageFeedback={canManageFeedback}
                canManagePhotos={canManagePhotos}
                event={event}
                feedback={feedback}
                feedbackDeadlinePassed={feedbackDeadlinePassed}
                immichAlbumUrl={immichAlbumUrl}
                isMember={!!isMember}
                isPastEvent={isPastEvent}
                memberCount={event.members.length}
                occDate={occDate}
                pendingPhotos={pendingPhotos}
                pendingUpdates={pendingUpdates}
              />
            ) : (
              <p className="py-12 text-center text-muted-foreground text-sm">
                {getPostEventContentMessage(isPastEvent, event.startTime)}
              </p>
            )}
          </div>

          {/* Sidebar */}
          <aside className="lg:col-span-2 lg:col-start-4 lg:row-start-1">
            <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-x-hidden lg:overflow-y-clip">
              <div className="hidden -space-y-px lg:flex lg:flex-col">
                <EventDetailsCard canManage={canManage} event={event} />
                {canManage ? (
                  <EventQuickStats
                    feedbackCount={feedback.length}
                    hasStarted={hasStarted}
                    memberCount={event.members.length}
                    photoCount={approvedPhotos.length}
                    presentCount={presentCount}
                    totalExpenses={totalExpenses}
                  />
                ) : null}
              </div>

              <InterestSection
                canManage={canManage}
                dialog={dialog}
                event={event}
                hasStarted={hasStarted}
                interests={interests}
                isMember={isMember}
                myInterest={myInterest}
              />

              {(canManageVolunteersProp || isPastEvent) && (
                <EventMembersSection
                  canManage={canManageVolunteers}
                  members={event.members}
                  onAddMember={handleAddMemberClick}
                  onRemoveMember={(id) => removeMember.trigger(id)}
                />
              )}

              {canManageAttendance && hasStarted ? (
                <EventAttendanceSection
                  eventId={event.id}
                  members={event.members}
                />
              ) : null}
            </div>
          </aside>
        </div>
      </div>

      <EditScopeDialog
        onOpenChange={setEditScopeDialogOpen}
        onSelect={handleEditScopeSelect}
        open={editScopeDialogOpen}
        title="Edit recurring event"
      />

      <EditScopeDialog
        onOpenChange={setCancelScopeDialogOpen}
        onSelect={handleCancelScopeSelect}
        open={cancelScopeDialogOpen}
        title="Cancel recurring event"
      />

      <EventFormDialog
        editScope={editScope ?? undefined}
        initialValues={{
          id: event.id,
          name: event.name,
          description: event.description,
          location: event.location,
          city: event.city,
          startTime: event.startTime,
          endTime: event.endTime,
          isPublic: !!event.isPublic,
          whatsappGroupId: event.whatsappGroupId,
          seriesId: event.seriesId,
          recurrenceRule: recurrence ?? null,
          feedbackEnabled: !!event.feedbackEnabled,
          feedbackDeadline: event.feedbackDeadline,
          postRsvpPoll: !!event.postRsvpPoll,
          rsvpPollLeadMinutes:
            event.rsvpPollLeadMinutes ?? DEFAULT_RSVP_POLL_LEAD_MINUTES,
          reminderIntervals:
            (event.reminderIntervals as number[] | null) ?? null,
        }}
        onOpenChange={(open) => {
          dialog.onOpenChange(open);
          if (!open) {
            setEditScope(null);
          }
        }}
        open={dialog.isOpen("edit")}
        originalDate={scopeOccDate}
        teamId={event.teamId}
      />

      <EditScopeDialog
        onOpenChange={setAddMemberScopeDialogOpen}
        onSelect={handleAddMemberScopeSelect}
        open={addMemberScopeDialogOpen}
        title="Add volunteer to recurring event"
      />

      <AddEventMemberDialog
        eventId={addMemberEventId}
        existingMembers={event.members}
        onBeforeAdd={addMemberOnBeforeAdd}
        onOpenChange={(open) => {
          dialog.onOpenChange(open);
          if (!open) {
            setAddMemberScope(null);
          }
        }}
        open={dialog.isOpen("addMember")}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            cancelAction.cancel();
            setCancelReason("");
          }
        }}
        open={cancelAction.isOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel &ldquo;{event.name}&rdquo;? This
              action cannot be undone and all volunteers will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation (optional)"
            rows={2}
            value={cancelReason}
          />
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={cancelAction.isLoading}
              variant="outline"
            >
              Keep Event
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelAction.isLoading}
              onClick={cancelAction.confirm}
              variant="destructive"
            >
              {cancelAction.isLoading ? (
                <>
                  <BrailleSpinner variant="inline" />
                  Cancelling...
                </>
              ) : (
                "Cancel Event"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
