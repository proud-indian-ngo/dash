import {
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  PlusSignIcon,
  UserGroupIcon,
  UserRemoveIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { mutators } from "@pi-dash/zero/mutators";
import type { TeamEventMember, User } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { log } from "evlog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { UserHoverCard } from "@/components/shared/user-hover-card";
import { LOCALE_DATE } from "@/lib/date-formats";
import { handleMutationResult } from "@/lib/mutation-result";
import type { EventRow } from "./events-table";

function EventMemberRow({
  canManage,
  canMarkAttendance,
  eventId,
  member,
  onRemove,
}: {
  canManage: boolean;
  canMarkAttendance: boolean;
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
        eventId,
        memberId: member.id,
        attendance: next,
        now: Date.now(),
      })
    );
    result.server
      .then((res) =>
        handleMutationResult(res, {
          mutation: "teamEvent.markAttendance",
          entityId: member.id,
          errorMsg: "Failed to update attendance",
        })
      )
      .catch((e) =>
        log.error({
          component: "EventMembersSection",
          action: "markAttendance",
          entityId: member.id,
          error: e instanceof Error ? e.message : String(e),
        })
      );
  }

  return (
    <div className="flex items-center gap-3 rounded-md border p-2">
      {member.user ? (
        <UserHoverCard
          triggerClassName="flex min-w-0 flex-1 cursor-pointer items-center gap-3 [@media(pointer:coarse)]:pointer-events-none"
          user={member.user}
        >
          <UserAvatar
            className="size-8"
            fallbackClassName="text-xs"
            user={member.user}
          />
          <div className="min-w-0">
            <div className="truncate font-medium text-sm">{displayName}</div>
            <div className="text-muted-foreground text-xs">
              Added {format(new Date(member.addedAt), LOCALE_DATE)}
            </div>
          </div>
        </UserHoverCard>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">{displayName}</div>
          <div className="text-muted-foreground text-xs">
            Added {format(new Date(member.addedAt), LOCALE_DATE)}
          </div>
        </div>
      )}
      {canMarkAttendance ? (
        <div className="flex gap-1">
          <Button
            aria-label={`Mark ${displayName} present`}
            className={
              member.attendance === "present"
                ? "bg-success/10 text-success hover:bg-success/20"
                : ""
            }
            onClick={() => toggleAttendance("present")}
            size="icon"
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
            onClick={() => toggleAttendance("absent")}
            size="icon"
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
        <Button
          aria-label={`Remove ${displayName}`}
          onClick={() => onRemove(member.id)}
          size="icon"
          variant="ghost"
        >
          <HugeiconsIcon className="size-4" icon={UserRemoveIcon} />
        </Button>
      ) : null}
    </div>
  );
}

export function EventMembersSection({
  canManage,
  canMarkAttendance,
  eventId,
  members,
  onAddMember,
  onRemoveMember,
}: {
  canManage: boolean;
  canMarkAttendance: boolean;
  eventId: string;
  members: EventRow["members"];
  onAddMember: () => void;
  onRemoveMember: (id: string) => void;
}) {
  const zero = useZero();
  const presentCount = members.filter((m) => m.attendance === "present").length;

  function markAllPresent() {
    const result = zero.mutate(
      mutators.teamEvent.markAllPresent({
        eventId,
        now: Date.now(),
      })
    );
    result.server
      .then((res) =>
        handleMutationResult(res, {
          mutation: "teamEvent.markAllPresent",
          entityId: eventId,
          successMsg: "All marked present",
          errorMsg: "Failed to mark attendance",
        })
      )
      .catch((e) =>
        log.error({
          component: "EventMembersSection",
          action: "markAllPresent",
          entityId: eventId,
          error: e instanceof Error ? e.message : String(e),
        })
      );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-sm">
          Volunteers ({members.length})
          {canMarkAttendance && members.length > 0 ? (
            <span className="text-muted-foreground">
              {" "}
              · {presentCount}/{members.length} present
            </span>
          ) : null}
        </h2>
        <div className="flex gap-2">
          {canMarkAttendance && members.length > 0 ? (
            <Button onClick={markAllPresent} size="sm" variant="outline">
              <HugeiconsIcon
                className="size-4"
                icon={UserGroupIcon}
                strokeWidth={2}
              />
              Mark All Present
            </Button>
          ) : null}
          {canManage ? (
            <Button onClick={onAddMember} size="sm" variant="default">
              <HugeiconsIcon className="size-4" icon={PlusSignIcon} />
              Add Volunteer
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {members.map((member) => (
          <EventMemberRow
            canManage={canManage}
            canMarkAttendance={canMarkAttendance}
            eventId={eventId}
            key={member.id}
            member={member}
            onRemove={onRemoveMember}
          />
        ))}
        {members.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm">
            {canMarkAttendance
              ? "No volunteers to mark attendance for."
              : "No volunteers yet."}
          </p>
        ) : null}
      </div>
    </>
  );
}
