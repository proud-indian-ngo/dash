import { UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventInterest } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import type { MouseEvent } from "react";
import { uuidv7 } from "uuidv7";

import type { PublicDisplayRow } from "@/components/events/public-events-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { DAY_MONTH, TIME } from "@/lib/date-formats";
import { handleMutationResult } from "@/lib/mutation-result";

interface EventRowProps {
  /** Shows the date beside the time (the Kalakriti highlight has no date heading). */
  showDate?: boolean;
  myInterests: readonly EventInterest[];
  myTeamIds: ReadonlySet<string>;
  row: PublicDisplayRow;
  userId: string;
}

type CardActionState =
  | { kind: "joined" }
  | { kind: "interestPending"; interestId: string; started: boolean }
  | { kind: "interestApproved" }
  | { kind: "interestDeclined" }
  | { kind: "join" }
  | { kind: "showInterest" }
  | { kind: "none" };

function deriveCardActionState(opts: {
  isMember: boolean;
  interest: EventInterest | undefined;
  hasStarted: boolean;
  canManageInterest: boolean;
  isOwnTeam: boolean;
  isPublic: boolean | null;
}): CardActionState {
  if (opts.isMember) {
    return { kind: "joined" };
  }
  if (opts.interest) {
    if (opts.interest.status === "pending") {
      return {
        interestId: opts.interest.id,
        kind: "interestPending",
        started: opts.hasStarted,
      };
    }
    if (opts.interest.status === "approved") {
      return { kind: "interestApproved" };
    }
    if (opts.interest.status === "rejected") {
      return { kind: "interestDeclined" };
    }
  }
  if (opts.hasStarted || opts.canManageInterest) {
    return { kind: "none" };
  }
  if (opts.isOwnTeam) {
    return { kind: "join" };
  }
  if (opts.isPublic) {
    return { kind: "showInterest" };
  }
  return { kind: "none" };
}

/**
 * One event on the agenda: time, name, team and place, volunteers, and what
 * the viewer can do (join, show interest) or has done. The whole row opens
 * the event; the name is the link for keyboard and screen-reader users.
 */
export function EventRow({
  myInterests,
  myTeamIds,
  row,
  showDate = false,
  userId,
}: EventRowProps) {
  const zero = useZero();
  const { hasPermission } = useApp();
  const now = Date.now();
  const hasStarted = row.startTime <= now;
  const isOver = row.endTime !== null && row.endTime <= now;
  const isMember = row.members.some((m) => m.userId === userId);
  const isOwnTeam = Boolean(row.team?.id && myTeamIds.has(row.team.id));
  const canManageInterest = hasPermission("events.manage_interest");
  const canSeeVolunteers = isOver || canManageInterest || isOwnTeam;
  const interest = myInterests.find((i) => i.eventId === row.eventId);

  const handleShowInterest = useEventCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (row.isVirtualOccurrence && !row.occDate) {
      return;
    }
    const id = uuidv7();
    // Interest is per session: a virtual occurrence is materialized first.
    const res = await zero.mutate(
      mutators.eventInterest.create({
        eventId: row.eventId,
        id,
        ...(row.isVirtualOccurrence && row.occDate
          ? { materializedId: uuidv7(), occDate: row.occDate }
          : {}),
        now: Date.now(),
      })
    ).server;
    handleMutationResult(res, {
      entityId: id,
      errorMsg: "Couldn't submit interest",
      mutation: "eventInterest.create",
      successMsg: "Interest submitted!",
    });
  });

  const handleJoinAsMember = useEventCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (row.isVirtualOccurrence && !row.occDate) {
      return;
    }
    const id = uuidv7();
    const occDate = row.isVirtualOccurrence
      ? (row.occDate ?? undefined)
      : undefined;
    const res = await zero.mutate(
      mutators.teamEvent.joinAsMember({
        eventId: row.eventId,
        id,
        materializedId: row.isVirtualOccurrence ? uuidv7() : undefined,
        now: Date.now(),
        occDate,
      })
    ).server;
    handleMutationResult(res, {
      entityId: id,
      errorMsg: "Couldn't join event",
      mutation: "teamEvent.joinAsMember",
      successMsg: "Joined event",
    });
  });

  const handleCancelInterest = useEventCallback(
    async (e: MouseEvent, interestId: string) => {
      e.stopPropagation();
      const res = await zero.mutate(
        mutators.eventInterest.cancel({ id: interestId })
      ).server;
      handleMutationResult(res, {
        entityId: interestId,
        errorMsg: "Couldn't cancel interest",
        mutation: "eventInterest.cancel",
      });
    }
  );

  const renderAction = () => {
    const action = deriveCardActionState({
      canManageInterest,
      hasStarted,
      interest,
      isMember,
      isOwnTeam,
      isPublic: row.isPublic,
    });
    switch (action.kind) {
      case "joined":
        return <StatusBadge tone="success">Joined</StatusBadge>;
      case "interestPending":
        return action.started ? (
          <StatusBadge tone="warning">Interest pending</StatusBadge>
        ) : (
          <CancelInterestButton
            interestId={action.interestId}
            onCancel={handleCancelInterest}
          />
        );
      case "interestApproved":
        return <StatusBadge tone="success">Interest approved</StatusBadge>;
      case "interestDeclined":
        return <StatusBadge tone="danger">Interest declined</StatusBadge>;
      case "join":
        return (
          <Button onClick={handleJoinAsMember} size="sm" variant="outline">
            Join
          </Button>
        );
      case "showInterest":
        return (
          <Button onClick={handleShowInterest} size="sm" variant="outline">
            Show interest
          </Button>
        );
      default:
        return null;
    }
  };

  const meta = [row.team?.name, row.location].filter(Boolean).join(" · ");

  return (
    <li className="hover:bg-muted/50 relative flex min-h-11 items-center gap-3 px-3 py-1.5 transition-colors">
      <span className="text-muted-foreground w-16 shrink-0 text-xs tabular-nums">
        {showDate ? (
          <span className="text-foreground block">
            {format(row.startTime, DAY_MONTH)}
          </span>
        ) : null}
        {format(row.startTime, TIME)}
      </span>
      <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
        <Link
          className="block truncate text-sm font-medium after:absolute after:inset-0 hover:underline sm:shrink-0"
          params={{ id: row.eventId }}
          search={row.occDate ? { occDate: row.occDate } : {}}
          to="/events/$id"
        >
          {row.name}
        </Link>
        {meta ? (
          <span className="text-muted-foreground block truncate text-xs sm:text-sm">
            {meta}
          </span>
        ) : null}
      </div>
      {canSeeVolunteers ? (
        <span
          className="text-muted-foreground hidden shrink-0 items-center gap-1 text-xs tabular-nums sm:flex"
          title={`${row.members.length} ${row.members.length === 1 ? "volunteer" : "volunteers"}`}
        >
          <HugeiconsIcon
            aria-hidden="true"
            className="size-3.5"
            icon={UserGroupIcon}
            strokeWidth={2}
          />
          <span className="sr-only">Volunteers:</span>
          {row.members.length}
        </span>
      ) : null}
      <div className="relative z-10 flex shrink-0 justify-end empty:hidden">
        {renderAction()}
      </div>
    </li>
  );
}

function CancelInterestButton({
  interestId,
  onCancel,
}: {
  interestId: string;
  onCancel: (event: MouseEvent, interestId: string) => void;
}) {
  const handleClick = useEventCallback((event: MouseEvent) =>
    onCancel(event, interestId)
  );

  return (
    <Button onClick={handleClick} size="sm" variant="outline">
      Cancel interest
    </Button>
  );
}
