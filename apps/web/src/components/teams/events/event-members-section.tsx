import {
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  PlusSignIcon,
  UserGroupIcon,
  UserRemoveIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { mutators } from "@pi-dash/zero/mutators";
import type { TeamEventMember, User } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { log } from "evlog";
import type { ReactNode } from "react";

import { contactActions } from "@/components/shared/contact-actions";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { UserAvatar } from "@/components/shared/user-avatar";
import { UserHoverCard } from "@/components/shared/user-hover-card";
import { useApp } from "@/context/app-context";
import { getEventMemberContacts } from "@/functions/contacts";
import { type ContactState, useContacts } from "@/hooks/use-contacts";
import { DATE } from "@/lib/date-formats";
import { handleMutationResult } from "@/lib/mutation-result";

import type { EventRow } from "./events-table";

const fetchMemberContacts = (eventId: string) =>
  getEventMemberContacts({ data: { eventId } });

function EventMemberRow({
  canManage,
  canMarkAttendance,
  contact,
  eventId,
  member,
  onRemove,
}: {
  canManage: boolean;
  canMarkAttendance: boolean;
  /** Absent for the viewer's own row and while nothing is known. */
  contact: ContactState;
  eventId: string;
  member: TeamEventMember & { user: User | undefined };
  onRemove: (id: string) => void;
}) {
  const zero = useZero();
  const displayName = member.user?.name ?? "Unknown";

  function toggleAttendance(status: "present" | "absent") {
    const next = member.attendance === status ? null : status;
    const result = zero.mutate(
      mutators.teamEvent.markAttendance({
        attendance: next,
        eventId,
        memberId: member.id,
        now: Date.now(),
      })
    );
    result.server
      .then((res) =>
        handleMutationResult(res, {
          entityId: member.id,
          errorMsg: "Failed to update attendance",
          mutation: "teamEvent.markAttendance",
        })
      )
      .catch((e) =>
        log.error({
          action: "markAttendance",
          component: "EventMembersSection",
          entityId: member.id,
          error: e instanceof Error ? e.message : String(e),
        })
      );
  }

  const markAllPresent = useEventCallback(() => toggleAttendance("present"));
  const stableOnClick1 = useEventCallback(() => toggleAttendance("absent"));
  const stableOnClick2 = useEventCallback(() => onRemove(member.id));

  return (
    <li className="flex min-h-11 items-center gap-3 px-3 py-1.5">
      {member.user ? (
        <UserHoverCard
          triggerClassName="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 [@media(pointer:coarse)]:pointer-events-none"
          user={member.user}
        >
          <UserAvatar
            className="size-6"
            fallbackClassName="text-[10px]"
            user={member.user}
          />
          <span className="truncate text-sm font-medium">{displayName}</span>
        </UserHoverCard>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {displayName}
        </span>
      )}
      <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:block">
        Added {format(new Date(member.addedAt), DATE)}
      </span>
      {canMarkAttendance ? (
        <div className="flex gap-1 pointer-coarse:gap-2">
          <Button
            aria-label={`Mark ${displayName} present`}
            className={cn(
              "pointer-coarse:size-10",
              member.attendance === "present" &&
                "bg-success/10 text-success hover:bg-success/20"
            )}
            onClick={markAllPresent}
            size="icon-sm"
            variant={member.attendance === "present" ? "secondary" : "ghost"}
          >
            <HugeiconsIcon
              className="size-4"
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
            />
          </Button>
          <Button
            aria-label={`Mark ${displayName} absent`}
            className="pointer-coarse:size-10"
            onClick={stableOnClick1}
            size="icon-sm"
            variant={member.attendance === "absent" ? "destructive" : "ghost"}
          >
            <HugeiconsIcon
              className="size-4"
              icon={CancelCircleIcon}
              strokeWidth={2}
            />
          </Button>
        </div>
      ) : null}
      {canManage ? (
        <ResponsiveActionMenu
          actions={[
            ...contactActions(contact),
            {
              destructive: true,
              icon: UserRemoveIcon,
              id: "remove",
              label: "Remove from event",
              onSelect: stableOnClick2,
            },
          ]}
          title={displayName}
          trigger={
            <RowActionsButton aria-label={`Actions for ${displayName}`} />
          }
        />
      ) : null}
    </li>
  );
}

/**
 * The Volunteers tab: attendance and add actions over one framed list.
 * `children` sits above it (pending interest requests).
 */
export function EventMembersSection({
  canManage,
  children,
  canMarkAttendance,
  eventId,
  members,
  onAddMember,
  onOpenSession,
  onRemoveMember,
  openingSession = false,
  sessionLocked = false,
}: {
  canManage: boolean;
  canMarkAttendance: boolean;
  children?: ReactNode;
  eventId: string;
  members: EventRow["members"];
  onAddMember: () => void;
  /** A past session of a series not saved yet: attendance needs its own row. */
  onOpenSession?: () => void;
  /** That session, for someone who can mark attendance but not open it. */
  sessionLocked?: boolean;
  onRemoveMember: (id: string) => void;
  openingSession?: boolean;
}) {
  const zero = useZero();
  const { user } = useApp();
  // Only those who manage the list get its contacts, in the row menu.
  const { contactFor } = useContacts(
    fetchMemberContacts,
    eventId,
    canManage ? members.map((m) => m.userId) : []
  );
  const presentCount = members.filter((m) => m.attendance === "present").length;

  const markAllPresent = useEventCallback(() => {
    const result = zero.mutate(
      mutators.teamEvent.markAllPresent({
        eventId,
        now: Date.now(),
      })
    );
    result.server
      .then((res) =>
        handleMutationResult(res, {
          entityId: eventId,
          errorMsg: "Failed to mark attendance",
          mutation: "teamEvent.markAllPresent",
          successMsg: "All marked present",
        })
      )
      .catch((e) =>
        log.error({
          action: "markAllPresent",
          component: "EventMembersSection",
          entityId: eventId,
          error: e instanceof Error ? e.message : String(e),
        })
      );
  });

  return (
    <div className="flex flex-col gap-3">
      {children}
      {sessionLocked ? (
        <p className="text-muted-foreground text-sm">
          A team lead or someone who can edit events needs to open this session
          before attendance can be marked.
        </p>
      ) : null}
      {canMarkAttendance || canManage || onOpenSession ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm tabular-nums">
            {canMarkAttendance && members.length > 0
              ? `${presentCount} of ${members.length} present`
              : null}
            {onOpenSession ? "Open this session to mark attendance." : null}
          </p>
          <div className="flex gap-2">
            {onOpenSession ? (
              <Button
                disabled={openingSession}
                onClick={onOpenSession}
                size="sm"
                variant="outline"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={UserGroupIcon}
                  strokeWidth={2}
                />
                Mark attendance
              </Button>
            ) : null}
            {canMarkAttendance && members.length > 0 ? (
              <Button onClick={markAllPresent} size="sm" variant="outline">
                <HugeiconsIcon
                  className="size-4"
                  icon={UserGroupIcon}
                  strokeWidth={2}
                />
                Mark all present
              </Button>
            ) : null}
            {canManage ? (
              <Button onClick={onAddMember} size="sm" variant="default">
                <HugeiconsIcon className="size-4" icon={PlusSignIcon} />
                Add volunteer
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {members.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {members.map((member) => (
            <EventMemberRow
              canManage={canManage}
              canMarkAttendance={canMarkAttendance}
              contact={
                member.userId === user.id
                  ? undefined
                  : contactFor(member.userId)
              }
              eventId={eventId}
              key={member.id}
              member={member}
              onRemove={onRemoveMember}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {canMarkAttendance
            ? "No volunteers to mark attendance for."
            : "No volunteers yet."}
        </p>
      )}
    </div>
  );
}
