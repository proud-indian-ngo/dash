import {
  Cancel01Icon,
  ChartBarLineIcon,
  Copy01Icon,
  Edit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BrailleSpinner } from "@pi-dash/design-system/components/braille-spinner";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { env } from "@pi-dash/env/web";
import { sumPaise } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { log } from "evlog";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
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
import type { StatusTone } from "@/components/shared/status-badge";
import { StatusBadge, Tag } from "@/components/shared/status-badge";
import type { TeamDetailData } from "@/components/teams/team-detail";
import {
  type PostEventRsvpPollResult,
  postEventRsvpPoll,
} from "@/functions/event-poll";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useDialogManager } from "@/hooks/use-dialog-manager";
import { DATE_TIME } from "@/lib/date-formats";
import { handleMutationResult } from "@/lib/mutation-result";
import { sumAmounts } from "@/lib/stats";

import { AddEventMemberDialog } from "./add-event-member-dialog";
import type { EditScope } from "./edit-scope-dialog";
import { EditScopeDialog } from "./edit-scope-dialog";
import {
  EventDetailsCard,
  EventLocation,
  formatEventWhen,
  hasEventDetails,
} from "./event-details-card";
import { EventExpenses } from "./event-expenses";
import { EventFeedbackSection } from "./event-feedback";
import { EventFormDialog } from "./event-form-dialog";
import {
  buildEventDuplicateInitialValues,
  buildScopedEditInitialValues,
  deriveSocialFacts,
} from "./event-form-initial-values";
import {
  PastInterestBadge,
  VolunteerInterestSection,
} from "./event-interest-section";
import { shouldRenderInterestRequests } from "./event-interest-visibility";
import { EventMembersSection } from "./event-members-section";
import { EventPhotos } from "./event-photos";
import { deriveSocialRecapMode } from "./event-social-fields";
import { EventSocialRecap } from "./event-social-recap";
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

import { InterestRequests, type InterestWithUser } from "./interest-requests";
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

function getPostEventContentMessage(isPastEvent: boolean) {
  return isPastEvent
    ? "Updates, photos and feedback for this date will appear here soon."
    : "Updates, photos and feedback open after the event.";
}

function InterestSection(props: {
  canManage: boolean;
  canManageInterest: boolean;
  dialog: ReturnType<typeof useDialogManager<EventDialog>>;
  event: EventRow;
  hasStarted: boolean;
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
  canEdit?: boolean;
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
  kalakritiEditionId?: string;
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
    tone: StatusTone;
  }
> = {
  cancelled: { label: "Cancelled", tone: "neutral" },
  completed: { label: "Completed", tone: "success" },
  "in-progress": { label: "In progress", tone: "info" },
  upcoming: { label: "Upcoming", tone: "info" },
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
  canEdit,
  canPostPoll,
  event,
  interestActions,
  onCancel,
  onDuplicate,
  onEdit,
  onPostPoll,
  status,
  teamName,
}: {
  canCancel: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canPostPoll: boolean;
  event: EventRow;
  /** Join, Show interest or Leave, and the viewer's interest status. */
  interestActions: ReactNode;
  onCancel: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onPostPoll: () => void;
  status: EventStatus;
  teamName: string | null;
}) {
  const navigate = useNavigate();
  const { label, tone } = STATUS_CONFIG[status];
  const stableOnClick1 = useEventCallback(() =>
    navigate({ params: { id: event.teamId }, to: "/teams/$id" })
  );

  return (
    <PageHeader
      actions={
        <>
          {interestActions}
          {canEdit ? (
            <Button onClick={onEdit} type="button" variant="outline">
              <HugeiconsIcon className="size-4" icon={Edit02Icon} />
              Edit
            </Button>
          ) : null}
          <PageHeaderMenu
            actions={[
              canCreate && {
                id: "duplicate",
                icon: Copy01Icon,
                label: "Duplicate",
                onSelect: onDuplicate,
              },
              canPostPoll && {
                id: "post-poll",
                icon: ChartBarLineIcon,
                label: "Post poll",
                onSelect: onPostPoll,
              },
              canCancel && {
                destructive: true,
                id: "cancel",
                icon: Cancel01Icon,
                label: "Cancel event",
                onSelect: onCancel,
              },
            ]}
            title={event.name}
          />
        </>
      }
      badge={<StatusBadge tone={tone}>{label}</StatusBadge>}
      meta={[
        teamName ? (
          <button
            className="hover:text-foreground text-left hover:underline"
            key="team"
            onClick={stableOnClick1}
            type="button"
          >
            {teamName}
          </button>
        ) : null,
        event.programme ? (
          <span key="programme">Programme · {event.programme.name}</span>
        ) : null,
        formatEventWhen(event.startTime, event.endTime),
        event.location ? (
          <EventLocation key="location" location={event.location} />
        ) : null,
        <span key="privacy">{event.isPublic ? "Public" : "Private"}</span>,
      ]}
      title={event.name}
    />
  );
}

const EVENT_TABS = [
  "volunteers",
  "updates",
  "photos",
  "feedback",
  "expenses",
] as const;
type EventTab = (typeof EVENT_TABS)[number];

interface EventTabsProps {
  approvedPhotos: Parameters<typeof EventPhotos>[0]["approvedPhotos"];
  approvedUpdates: Parameters<typeof EventUpdates>[0]["approvedUpdates"];
  canAccessPostEventContent: boolean;
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
  /** The Volunteers tab body; null hides the tab. */
  members: ReactNode;
  occDate?: string;
  pendingPhotos: Parameters<typeof EventPhotos>[0]["pendingPhotos"];
  pendingUpdates: Parameters<typeof EventUpdates>[0]["pendingUpdates"];
  showExpenses: boolean;
}

function availableTabs({
  canAccessPostEventContent,
  event,
  isPastEvent,
  members,
  showExpenses,
}: EventTabsProps): EventTab[] {
  return EVENT_TABS.filter((tab) => {
    switch (tab) {
      case "volunteers":
        return members !== null;
      case "updates":
      case "photos":
        return canAccessPostEventContent;
      case "feedback":
        return (
          canAccessPostEventContent && !!event.feedbackEnabled && isPastEvent
        );
      default:
        return showExpenses;
    }
  });
}

/**
 * Volunteers first, then what the event produced. Before the event (or for a
 * series date nobody has opened yet) only Volunteers and any early expenses
 * show; updates, photos and feedback open once it has happened.
 */
function EventTabs(props: EventTabsProps) {
  const {
    approvedPhotos,
    approvedUpdates,
    canApproveUpdates,
    canManageFeedback,
    canManagePhotos,
    canUploadUpdateImages,
    event,
    feedback,
    feedbackDeadlinePassed,
    immichAlbumUrl,
    isMember,
    memberCount,
    members,
    occDate,
    pendingPhotos,
    pendingUpdates,
  } = props;
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(EVENT_TABS));
  const tabs = availableTabs(props);
  const activeTab = tab && tabs.includes(tab) ? tab : tabs[0];
  const handleTabChange = useEventCallback((value: string | null) =>
    setTab(value === tabs[0] ? null : (value as EventTab))
  );

  if (!activeTab) {
    return null;
  }

  return (
    <Tabs onValueChange={handleTabChange} value={activeTab}>
      <TabsList className="max-w-full [scrollbar-width:none] justify-start overflow-x-auto">
        {tabs.includes("volunteers") ? (
          <TabsTrigger value="volunteers">
            Volunteers ({memberCount})
          </TabsTrigger>
        ) : null}
        {tabs.includes("updates") ? (
          <TabsTrigger value="updates">
            Updates
            {approvedUpdates.length > 0 ? ` (${approvedUpdates.length})` : ""}
            {canApproveUpdates && pendingUpdates.length > 0 ? (
              <Tag className="font-mono tabular-nums">
                {pendingUpdates.length}
              </Tag>
            ) : null}
          </TabsTrigger>
        ) : null}
        {tabs.includes("photos") ? (
          <TabsTrigger value="photos">
            Photos &amp; Videos
            {approvedPhotos.length > 0 ? ` (${approvedPhotos.length})` : ""}
            {canManagePhotos && pendingPhotos.length > 0 ? (
              <Tag className="font-mono tabular-nums">
                {pendingPhotos.length}
              </Tag>
            ) : null}
          </TabsTrigger>
        ) : null}
        {tabs.includes("feedback") ? (
          <TabsTrigger value="feedback">
            Feedback
            {feedback.length > 0 ? ` (${feedback.length})` : ""}
          </TabsTrigger>
        ) : null}
        {tabs.includes("expenses") ? (
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        ) : null}
      </TabsList>
      {tabs.includes("volunteers") ? (
        <TabsContent value="volunteers">{members}</TabsContent>
      ) : null}
      {tabs.includes("updates") ? (
        <TabsContent value="updates">
          <EventUpdates
            approvedUpdates={approvedUpdates}
            canApproveUpdates={canApproveUpdates}
            canManage={props.canManage}
            canUploadImages={canUploadUpdateImages}
            eventId={event.id}
            isMember={isMember}
            pendingUpdates={pendingUpdates}
          />
        </TabsContent>
      ) : null}
      {tabs.includes("photos") ? (
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
      ) : null}
      {tabs.includes("feedback") ? (
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
      {tabs.includes("expenses") ? (
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
 * get only their own (via ctx.userId in myPendingByEvent). Query definitions
 * enforce authorization; `enabled` only avoids unnecessary subscriptions.
 */
function useEventDetailQueries(
  eventId: string,
  canApproveUpdates: boolean,
  canManagePhotos: boolean,
  canManageFeedback: boolean
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
  const [feedback] = useQuery(queries.eventFeedback.byEvent({ eventId }), {
    enabled: canManageFeedback,
  });
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

function SocialRecapStart({ onStart }: { onStart: () => void }) {
  return (
    <Card aria-label="Social recap" role="region" size="sm">
      <CardHeader>
        <CardTitle>Social recap</CardTitle>
        <CardDescription>
          Open this session to record children, notes and photo choices.
        </CardDescription>
        <CardAction>
          <Button onClick={onStart} size="sm" type="button" variant="outline">
            Start recap
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  );
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
    | readonly { lineItems: readonly { amountPaise: number }[] }[]
    | null
    | undefined,
  vendorPayments:
    | readonly { lineItems: readonly { amountPaise: number }[] }[]
    | null
    | undefined
): number {
  return sumPaise(
    [...(reimbursements ?? []), ...(vendorPayments ?? [])].map((expense) =>
      sumAmounts(expense.lineItems)
    )
  );
}

function deriveEventMetrics(event: EventDetailProps["event"]) {
  const feedbackDeadlinePassed =
    !!event.feedbackDeadline && new Date(event.feedbackDeadline) < new Date();
  const presentCount = event.members.filter(
    (m) => m.attendance === "present"
  ).length;
  return { feedbackDeadlinePassed, presentCount };
}

export function EventDetail({
  canApproveUpdates,
  canCancelPast,
  canCreate,
  canEdit: canEditProp,
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
  kalakritiEditionId,
  myInterest,
  occDate,
  parentEvent,
  team,
}: EventDetailProps) {
  const zero = useZero();
  const navigate = useNavigate();

  const { isVirtualOccurrence, isRecurring, isOccurrence, scopeOccDate } =
    deriveRecurrenceState(event, occDate);
  // An already-materialized row for this date takes the interest instead.
  const interestSessionId = isVirtualOccurrence
    ? event.exceptions.find((e) => e.originalDate === occDate)?.id
    : undefined;

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
  const canEdit = canEditProp ?? canManage;
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
  } = useEventDetailQueries(
    event.id,
    canApproveUpdates,
    canManagePhotos,
    canManageFeedback
  );

  const totalExpenses = calcTotalExpenses(
    eventReimbursements,
    eventVendorPayments
  );
  const showUpcomingExpenses =
    !canAccessPostEventContent &&
    canManage &&
    (eventReimbursements.length > 0 || eventVendorPayments.length > 0);

  const { feedbackDeadlinePassed, presentCount } = deriveEventMetrics(event);

  const socialFacts = deriveSocialFacts(event, parentEvent);
  const socialRecapMode = deriveSocialRecapMode({
    canManageAttendance,
    // teamEvent.materialize requires events.edit or team lead.
    canMaterialize: canManage,
    event,
    existingOccurrenceId: interestSessionId,
    isPastEvent,
    isVirtualOccurrence,
  });
  const startSocialRecap = () => {
    // Someone already materialised this date: open that row instead.
    if (interestSessionId) {
      navigate({ params: { id: interestSessionId }, to: "/events/$id" });
      return;
    }
    materializeOccurrence();
  };

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

  const showInterestRequests =
    !hasStarted && shouldRenderInterestRequests(canManageInterest, interests);
  const showVolunteers =
    canManageVolunteers || event.members.length > 0 || showInterestRequests;
  const detailsProps = {
    approvedCount: socialFacts.approvedCount,
    canManage,
    event,
    partners: socialFacts.partners,
    totalExpenses,
    volunteersNeeded: socialFacts.volunteersNeeded,
  };
  const showDetails = hasEventDetails(detailsProps);

  return (
    <AppErrorBoundary level="section">
      <div className="flex flex-col gap-6">
        <EventHeader
          canCancel={canCancel}
          canCreate={canCreate}
          canEdit={canEdit}
          canPostPoll={canPostPoll}
          event={event}
          interestActions={
            <InterestSection
              canManage={canManage}
              canManageInterest={canManageInterest}
              dialog={dialog}
              event={event}
              hasStarted={hasStarted}
              isMember={isMember}
              isTeamMember={isTeamMember}
              myInterest={myInterest}
              onJoinAsMember={handleJoinAsMember}
              onLeaveEvent={stableOnLeaveEvent4}
            />
          }
          onCancel={handleCancelClick}
          onDuplicate={stableOnDuplicate3}
          onEdit={handleEditClick}
          onPostPoll={handlePostPollClick}
          status={status}
          teamName={team?.name ?? null}
        />

        <div
          className={cn(
            "grid grid-cols-1 gap-6",
            showDetails && "lg:grid-cols-[minmax(0,1fr)_20rem]"
          )}
        >
          <div className="flex min-w-0 flex-col gap-6">
            {event.description ? (
              <p className="text-muted-foreground text-sm whitespace-pre-line">
                {event.description}
              </p>
            ) : null}

            {socialRecapMode === "form" ? (
              <EventSocialRecap
                approvedPhotos={approvedPhotos}
                event={event}
                presentCount={presentCount}
              />
            ) : null}
            {socialRecapMode === "materialize" ? (
              <SocialRecapStart onStart={startSocialRecap} />
            ) : null}

            {canAccessPostEventContent ? null : (
              <p className="text-muted-foreground text-sm">
                {getPostEventContentMessage(isPastEvent)}
              </p>
            )}

            <EventTabs
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
              members={
                showVolunteers ? (
                  <EventMembersSection
                    canManage={canManageVolunteers}
                    canMarkAttendance={
                      Boolean(canManageAttendance) && hasStarted
                    }
                    eventId={event.id}
                    members={event.members}
                    onAddMember={handleAddMemberClick}
                    onRemoveMember={stableOnRemoveMember5}
                  >
                    {showInterestRequests && interests ? (
                      <InterestRequests interests={interests} />
                    ) : null}
                  </EventMembersSection>
                ) : null
              }
              occDate={occDate}
              pendingPhotos={pendingPhotos}
              pendingUpdates={pendingUpdates}
              showExpenses={
                canAccessPostEventContent ? canManage : showUpcomingExpenses
              }
            />
          </div>

          {showDetails ? (
            <aside aria-label="Event details">
              <EventDetailsCard {...detailsProps} />
            </aside>
          ) : null}
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
        initialValues={buildScopedEditInitialValues(
          event,
          parentEvent,
          editScope
        )}
        kalakritiEditionId={kalakritiEditionId}
        onOpenChange={stableOnOpenChange6}
        open={dialog.isOpen("edit")}
        originalDate={scopeOccDate ?? undefined}
        teamId={event.teamId}
        teamProgrammeId={team?.programmeId}
      />

      <EventFormDialog
        initialValues={buildEventDuplicateInitialValues(event, parentEvent)}
        mode="create"
        onOpenChange={dialog.onOpenChange}
        open={dialog.isOpen("duplicate")}
        teamId={event.teamId}
        teamProgrammeId={team?.programmeId}
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
                "Cancel event"
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
        confirmLabel="Post poll"
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
        eventDate={format(new Date(event.startTime), DATE_TIME)}
        eventId={event.id}
        eventName={event.name}
        occDate={isVirtualOccurrence ? occDate : undefined}
        sessionId={interestSessionId}
        onOpenChange={dialog.onOpenChange}
        open={dialog.isOpen("interest")}
      />
    </AppErrorBoundary>
  );
}
