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
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
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
import {
  type PostEventRsvpPollResult,
  postEventRsvpPoll,
} from "@/functions/event-poll";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useDialogManager } from "@/hooks/use-dialog-manager";
import { LONG_DATE_TIME } from "@/lib/date-formats";
import { handleMutationResult } from "@/lib/mutation-result";
import { AddEventMemberDialog } from "./add-event-member-dialog";
import type { EditScope } from "./edit-scope-dialog";
import { EditScopeDialog } from "./edit-scope-dialog";
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

type PostEventRsvpPollErrorCode = Extract<
  PostEventRsvpPollResult,
  { type: "error" }
>["code"];

const RSVP_POLL_ERROR_MESSAGES = {
  forbidden: "You don't have permission to post polls",
  no_whatsapp_group: "No WhatsApp group linked to this event or team",
  not_eligible: "Event is not eligible for an RSVP poll",
  not_found: "Event not found or was deleted",
  poll_exists: "Poll already posted for this event",
  unauthorized: "You are not signed in",
} satisfies Record<Exclude<PostEventRsvpPollErrorCode, "unknown">, string>;

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
        newExceptionId: mode === "this" ? uuidv7() : undefined,
        now: Date.now(),
        originalDate: scopeOccDate,
        reason: trimmedReason,
      })
    ).server;
  }
  return zero.mutate(
    mutators.teamEvent.cancel({
      id: event.id,
      now: Date.now(),
      reason: trimmedReason,
    })
  ).server;
}

function deriveRecurrenceState(event: EventRow, occDate: string | undefined) {
  const isVirtualOccurrence =
    !!occDate && !!event.recurrenceRule && !event.seriesId;
  const isRecurring = !!event.recurrenceRule || !!event.seriesId;
  const isOccurrence = !!occDate || !!event.seriesId;
  const scopeOccDate = occDate ?? event.originalDate;
  return { isOccurrence, isRecurring, isVirtualOccurrence, scopeOccDate };
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
  canManageInterest: boolean;
  dialog: ReturnType<typeof useDialogManager<EventDialog>>;
  event: EventRow;
  hasStarted: boolean;
  interests?: readonly InterestWithUser[];
  isMember?: boolean;
  isTeamMember: boolean;
  myInterest?: InterestWithUser | null;
  onJoinAsMember: () => void;
  onLeaveEvent: () => void;
}) {
  const stableOnShowInterest0 = useEventCallback(() =>
    props.dialog.open({ type: "interest" })
  );
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
      canManageInterest={props.canManageInterest}
      interests={props.interests}
      isMember={props.isMember}
      isPublic={!!props.event.isPublic}
      isTeamMember={props.isTeamMember}
      myInterest={props.myInterest}
      onJoinAsMember={props.onJoinAsMember}
      onLeaveEvent={props.onLeaveEvent}
      onShowInterest={stableOnShowInterest0}
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
  canCancelPast: boolean;
  canCreate: boolean;
  canManage: boolean;
  canManageAttendance: boolean;
  canManageFeedback: boolean;
  canManageInterest: boolean;
  canManagePhotos: boolean;
  canManageVolunteers: boolean;
  canUploadUpdateImages: boolean;
  event: EventRow;
  interests?: readonly InterestWithUser[];
  isMember?: boolean;
  isTeamMember: boolean;
  myInterest?: InterestWithUser | null;
  /** ISO date (YYYY-MM-DD) when viewing a virtual occurrence of a series. */
  occDate?: string;
  /** Original series parent event (before applyOccurrenceDate), for mode="all" edits. */
  parentEvent?: EventRow;
  team?: TeamDetailData | null;
}

type EventDialog =
  | { type: "edit" }
  | { type: "duplicate" }
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
    onError: (msg) => {
      log.error({
        component: "EventDetail",
        entityId: event.id,
        error: msg,
        mutation: "teamEvent.cancel",
      });
      toast.error("Couldn't cancel event");
      cancelScopeRef.current = null;
    },
    onSuccess: () => {
      toast.success("Event cancelled");
      cancelScopeRef.current = null;
      setCancelReason("");
      navigate({ params: { id: event.teamId }, to: "/teams/$id" });
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
    addMemberScope,
    addMemberScopeDialogOpen,
    cancelAction,
    cancelReason,
    cancelScopeDialogOpen,
    editScope,
    editScopeDialogOpen,
    handleAddMemberClick,
    handleAddMemberScopeSelect,
    handleCancelClick,
    handleCancelScopeSelect,
    handleEditClick,
    handleEditScopeSelect,
    setAddMemberScope,
    setAddMemberScopeDialogOpen,
    setCancelReason,
    setCancelScopeDialogOpen,
    setEditScope,
    setEditScopeDialogOpen,
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
  cancelled: { label: "Cancelled", variant: "destructive-light" },
  completed: { label: "Completed", variant: "default" },
  "in-progress": { label: "In Progress", variant: "secondary" },
  upcoming: { label: "Upcoming", variant: "outline" },
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
  canCreate,
  canManage,
  canPostPoll,
  event,
  onCancel,
  onDuplicate,
  onEdit,
  onPostPoll,
  status,
  teamName,
}: {
  canCancel: boolean;
  canCreate: boolean;
  canManage: boolean;
  canPostPoll: boolean;
  event: EventRow;
  onCancel: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onPostPoll: () => void;
  status: EventStatus;
  teamName: string | null;
}) {
  const navigate = useNavigate();
  const { label, variant } = STATUS_CONFIG[status];
  const stableOnClick1 = useEventCallback(() =>
    navigate({ params: { id: event.teamId }, to: "/teams/$id" })
  );

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
          onClick={stableOnClick1}
          type="button"
        >
          {teamName}
        </button>
      </div>
      {canManage || canCancel || canCreate || canPostPoll ? (
        <div className="flex gap-2">
          {canCreate ? (
            <Button onClick={onDuplicate} size="sm" variant="outline">
              Duplicate
            </Button>
          ) : null}
          {canPostPoll ? (
            <Button onClick={onPostPoll} size="sm" variant="outline">
              Post Poll
            </Button>
          ) : null}
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
  canUploadUpdateImages: boolean;
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
  canUploadUpdateImages,
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
  const stableOnValueChange2 = useEventCallback((v: string | null) =>
    setTab(v as "updates" | "photos" | "feedback" | "expenses")
  );

  return (
    <Tabs onValueChange={stableOnValueChange2} value={tab}>
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
          canUploadImages={canUploadUpdateImages}
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

function EventPostEventPanel({
  canAccessPostEventContent,
  message,
  showUpcomingExpenses,
  ...eventTabsProps
}: EventTabsProps & {
  canAccessPostEventContent: boolean;
  message: string;
  showUpcomingExpenses: boolean;
}) {
  if (canAccessPostEventContent) {
    return <EventTabs {...eventTabsProps} />;
  }

  if (showUpcomingExpenses) {
    return (
      <div className="flex flex-col gap-6">
        <p className="py-8 text-center text-muted-foreground text-sm">
          {message}
        </p>
        <div className="flex flex-col gap-3">
          <h2 className="font-medium text-sm">Expenses</h2>
          <EventExpenses eventId={eventTabsProps.event.id} />
        </div>
      </div>
    );
  }

  return (
    <p className="py-12 text-center text-muted-foreground text-sm">{message}</p>
  );
}

/**
 * Queries for the event detail page. Pending queries use `enabled` flags to
 * control Zero subscriptions: approvers/leads get all pending, regular members
 * get only their own (via ctx.userId in myPendingByEvent). Query definitions
 * enforce authorization; `enabled` only avoids unnecessary subscriptions.
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
    album,
    approvedPhotos,
    approvedUpdates,
    eventReimbursements,
    eventVendorPayments,
    feedback,
    pendingPhotos,
    pendingUpdates,
  };
}

function deriveEventState(event: EventRow, isVirtualOccurrence: boolean) {
  const status = deriveEventStatus(event);
  const eventTime = event.endTime ?? event.startTime;
  const isPastEvent = new Date(eventTime) < new Date();
  const hasStarted = new Date(event.startTime) <= new Date();
  const canAccessPostEventContent = isPastEvent && !isVirtualOccurrence;
  return { canAccessPostEventContent, hasStarted, isPastEvent, status };
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

function deriveEventMetrics(event: EventDetailProps["event"]) {
  const feedbackDeadlinePassed =
    !!event.feedbackDeadline && new Date(event.feedbackDeadline) < new Date();
  const presentCount = event.members.filter(
    (m) => m.attendance === "present"
  ).length;
  const recurrence = event.recurrenceRule as
    | { rrule: string; exdates?: string[] }
    | null
    | undefined;
  return { feedbackDeadlinePassed, presentCount, recurrence };
}

function buildEditInitialValues(
  event: EventRow,
  recurrence: { rrule: string; exdates?: string[] } | null | undefined
) {
  return {
    city: event.city,
    description: event.description,
    endTime: event.endTime,
    feedbackDeadline: event.feedbackDeadline,
    feedbackEnabled: !!event.feedbackEnabled,
    id: event.id,
    inheritVolunteers: !!event.inheritVolunteers,
    isPublic: !!event.isPublic,
    location: event.location,
    name: event.name,
    postEventNudgesEnabled: event.postEventNudgesEnabled,
    postRsvpPoll: !!event.postRsvpPoll,
    recurrenceRule: recurrence,
    reminderIntervals: event.reminderIntervals as number[] | null,
    reminderTarget: event.reminderTarget as string,
    rsvpPollLeadMinutes: event.rsvpPollLeadMinutes,
    seriesId: event.seriesId,
    startTime: event.startTime,
    whatsappGroupId: event.whatsappGroupId,
  };
}

function buildDuplicateInitialValues(event: EventRow) {
  return {
    city: event.city,
    description: event.description,
    endTime: event.endTime,
    feedbackDeadline: event.feedbackDeadline,
    feedbackEnabled: !!event.feedbackEnabled,
    id: event.id,
    inheritVolunteers: !event.seriesId && !!event.inheritVolunteers,
    isPublic: !!event.isPublic,
    location: event.location,
    name: `Copy of ${event.name}`,
    postEventNudgesEnabled: event.postEventNudgesEnabled,
    postRsvpPoll: !!event.postRsvpPoll,
    recurrenceRule: null,
    reminderIntervals: event.reminderIntervals as number[] | null,
    reminderTarget: event.reminderTarget as string,
    rsvpPollLeadMinutes: event.rsvpPollLeadMinutes,
    seriesId: null,
    startTime: event.startTime,
    whatsappGroupId: null,
  };
}

export function EventDetail({
  canApproveUpdates,
  canCancelPast,
  canCreate,
  canManage,
  canManageAttendance,
  canManageFeedback,
  canManageInterest,
  canManagePhotos,
  canUploadUpdateImages,
  canManageVolunteers: canManageVolunteersProp,
  event,
  interests,
  isMember,
  isTeamMember,
  myInterest,
  occDate,
  parentEvent,
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
        now: Date.now(),
        originalDate: occDate,
        seriesId: event.id,
      })
    ).server;
    if (res.type === "error") {
      toast.error("Couldn't create occurrence");
      return null;
    }
    navigate({ params: { id: newId }, to: "/events/$id" });
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
  } = useScopeDialogs(
    isOccurrence,
    isRecurring,
    scopeOccDate ?? undefined,
    event,
    dialog
  );

  const { addMemberEventId, addMemberOnBeforeAdd } = deriveAddMemberTarget(
    addMemberScope,
    event,
    isVirtualOccurrence,
    materializeOccurrence
  );

  const { status, isPastEvent, hasStarted, canAccessPostEventContent } =
    deriveEventState(event, isVirtualOccurrence);
  const canCancel = hasStarted ? canCancelPast : canManage;
  const canManageVolunteers = isPastEvent ? canManageVolunteersProp : canManage;
  const canPostPoll =
    canManage && !!event.postRsvpPoll && !event.cancelledAt && !isPastEvent;
  const [postPollDialogOpen, setPostPollDialogOpen] = useState(false);
  const [isPostingPoll, setIsPostingPoll] = useState(false);

  const handlePostPollClick = useCallback(() => {
    setPostPollDialogOpen(true);
  }, []);

  const handlePostPollConfirm = useCallback(async () => {
    setIsPostingPoll(true);
    let targetId = event.id;
    let materialized = false;
    try {
      if (isVirtualOccurrence && occDate) {
        const newId = uuidv7();
        const mat = await zero.mutate(
          mutators.teamEvent.materialize({
            id: newId,
            now: Date.now(),
            originalDate: occDate,
            seriesId: event.id,
          })
        ).server;
        if (mat.type === "error") {
          toast.error("Couldn't create occurrence");
          return;
        }
        targetId = newId;
        materialized = true;
      }

      const res = await postEventRsvpPoll({ data: { eventId: targetId } });
      if (res.type === "ok") {
        toast.success("Poll queued");
        return;
      }
      if (res.code === "unknown") {
        log.error({
          component: "EventDetail",
          entityId: targetId,
          error: res.code,
          fn: "postEventRsvpPoll",
        });
        toast.error("Couldn't post poll");
        return;
      }
      const message = RSVP_POLL_ERROR_MESSAGES[res.code];
      if (res.code === "poll_exists") {
        toast.info(message);
      } else {
        toast.error(message);
      }
    } catch (caughtError) {
      log.error({
        caughtError:
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError),
        component: "EventDetail",
        entityId: targetId,
        fn: "postEventRsvpPoll",
      });
      toast.error("Couldn't post poll");
    } finally {
      setIsPostingPoll(false);
      setPostPollDialogOpen(false);
      if (materialized) {
        navigate({ params: { id: targetId }, to: "/events/$id" });
      }
    }
  }, [isVirtualOccurrence, occDate, event.id, zero, navigate]);

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
  const showUpcomingExpenses =
    !canAccessPostEventContent &&
    canManage &&
    (eventReimbursements.length > 0 || eventVendorPayments.length > 0);

  const { feedbackDeadlinePassed, presentCount, recurrence } =
    deriveEventMetrics(event);

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
    onError: (msg) => {
      log.error({
        component: "EventDetail",
        entityId: event.id,
        error: msg,
        mutation: "teamEvent.removeMember",
      });
      toast.error("Couldn't remove volunteer");
    },
    onSuccess: () => toast.success("Volunteer removed"),
  });

  const handleJoinAsMember = useCallback(async () => {
    const id = uuidv7();
    const res = await zero.mutate(
      mutators.teamEvent.joinAsMember({
        eventId: event.id,
        id,
        materializedId: isVirtualOccurrence ? uuidv7() : undefined,
        now: Date.now(),
        occDate: isVirtualOccurrence ? occDate : undefined,
      })
    ).server;
    handleMutationResult(res, {
      entityId: id,
      errorMsg: "Couldn't join event",
      mutation: "teamEvent.joinAsMember",
      successMsg: "Joined event",
    });
  }, [isVirtualOccurrence, occDate, event.id, zero]);

  const leaveEventAction = useConfirmAction({
    onConfirm: () =>
      zero.mutate(
        mutators.teamEvent.leaveEvent({
          eventId: event.id,
          now: Date.now(),
        })
      ).server,
    onError: (msg) => {
      log.error({
        component: "EventDetail",
        entityId: event.id,
        error: msg,
        mutation: "teamEvent.leaveEvent",
      });
      toast.error(msg);
    },
    onSuccess: () => toast.success("Left event"),
  });
  const stableOnDuplicate3 = useEventCallback(() =>
    dialog.open({ type: "duplicate" })
  );
  const stableOnLeaveEvent4 = useEventCallback(() =>
    leaveEventAction.trigger()
  );
  const stableOnRemoveMember5 = useEventCallback((id: string) =>
    removeMember.trigger(id)
  );
  const stableOnOpenChange6 = useEventCallback((open: boolean) => {
    dialog.onOpenChange(open);
    if (!open) {
      setEditScope(null);
    }
  });
  const stableOnOpenChange7 = useEventCallback((open: boolean) => {
    dialog.onOpenChange(open);
    if (!open) {
      setAddMemberScope(null);
    }
  });
  const stableOnOpenChange8 = useEventCallback((open: boolean) => {
    if (!open) {
      cancelAction.cancel();
      setCancelReason("");
    }
  });
  const stableOnChange9 = useEventCallback((e: { target: { value: string } }) =>
    setCancelReason(e.target.value)
  );
  const stableOnOpenChange10 = useEventCallback((open: boolean) => {
    if (!open) {
      removeMember.cancel();
    }
  });
  const stableOnOpenChange11 = useEventCallback((open: boolean) => {
    if (!open) {
      leaveEventAction.cancel();
    }
  });
  const stableOnOpenChange12 = useEventCallback((open: boolean) => {
    if (!isPostingPoll) {
      setPostPollDialogOpen(open);
    }
  });

  return (
    <AppErrorBoundary level="section">
      <div className="flex flex-col gap-6">
        <EventHeader
          canCancel={canCancel}
          canCreate={canCreate}
          canManage={canManage}
          canPostPoll={canPostPoll}
          event={event}
          onCancel={handleCancelClick}
          onDuplicate={stableOnDuplicate3}
          onEdit={handleEditClick}
          onPostPoll={handlePostPollClick}
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

            <EventPostEventPanel
              approvedPhotos={approvedPhotos}
              approvedUpdates={approvedUpdates}
              canAccessPostEventContent={canAccessPostEventContent}
              canApproveUpdates={canApproveUpdates}
              canManage={canManage}
              canManageFeedback={canManageFeedback}
              canManagePhotos={canManagePhotos}
              canUploadUpdateImages={canUploadUpdateImages}
              event={event}
              feedback={feedback}
              feedbackDeadlinePassed={feedbackDeadlinePassed}
              immichAlbumUrl={immichAlbumUrl}
              isMember={!!isMember}
              isPastEvent={isPastEvent}
              memberCount={event.members.length}
              message={getPostEventContentMessage(isPastEvent, event.startTime)}
              occDate={occDate}
              pendingPhotos={pendingPhotos}
              pendingUpdates={pendingUpdates}
              showUpcomingExpenses={showUpcomingExpenses}
            />
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
                canManageInterest={canManageInterest}
                dialog={dialog}
                event={event}
                hasStarted={hasStarted}
                interests={interests}
                isMember={isMember}
                isTeamMember={isTeamMember}
                myInterest={myInterest}
                onJoinAsMember={handleJoinAsMember}
                onLeaveEvent={stableOnLeaveEvent4}
              />

              {canManageVolunteers || event.members.length > 0 ? (
                <EventMembersSection
                  canManage={canManageVolunteers}
                  canMarkAttendance={Boolean(canManageAttendance) && hasStarted}
                  eventId={event.id}
                  members={event.members}
                  onAddMember={handleAddMemberClick}
                  onRemoveMember={stableOnRemoveMember5}
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
        initialValues={buildEditInitialValues(
          editScope === "all" && parentEvent ? parentEvent : event,
          recurrence
        )}
        onOpenChange={stableOnOpenChange6}
        open={dialog.isOpen("edit")}
        originalDate={scopeOccDate ?? undefined}
        teamId={event.teamId}
      />

      <EventFormDialog
        initialValues={buildDuplicateInitialValues(event)}
        mode="create"
        onOpenChange={dialog.onOpenChange}
        open={dialog.isOpen("duplicate")}
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
        onOpenChange={stableOnOpenChange7}
        open={dialog.isOpen("addMember")}
        teamMemberIds={
          team ? new Set(team.members.map((m) => m.userId)) : undefined
        }
      />

      <AlertDialog
        onOpenChange={stableOnOpenChange8}
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
            onChange={stableOnChange9}
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
        onOpenChange={stableOnOpenChange10}
        open={removeMember.isOpen}
        title="Remove volunteer"
      />

      <ConfirmDialog
        confirmLabel="Leave"
        description="Are you sure you want to leave this event? Team leads will be notified."
        loading={leaveEventAction.isLoading}
        loadingLabel="Leaving..."
        onConfirm={leaveEventAction.confirm}
        onOpenChange={stableOnOpenChange11}
        open={leaveEventAction.isOpen}
        title="Leave event"
      />

      <ConfirmDialog
        confirmLabel="Post Poll"
        description={
          <>
            Post RSVP poll for <strong>{event.name}</strong> to the WhatsApp
            group now?
          </>
        }
        loading={isPostingPoll}
        loadingLabel="Posting..."
        onConfirm={handlePostPollConfirm}
        onOpenChange={stableOnOpenChange12}
        open={postPollDialogOpen}
        title="Post RSVP poll"
        variant="default"
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
