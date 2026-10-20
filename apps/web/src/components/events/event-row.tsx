import {
  ArrowUpRight01Icon,
  Location01Icon,
  RepeatIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventInterest } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import type { MouseEvent } from "react";
import { uuidv7 } from "uuidv7";

import {
  type PublicDisplayRow,
  rowMapUrl,
  rowPlace,
} from "@/components/events/public-events-table";
import { StatusBadge, Tag } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { DAY_MONTH, TIME } from "@/lib/date-formats";
import { handleMutationResult, joinErrorMessage } from "@/lib/mutation-result";

import {
  deriveCardActionState,
  eventEndLabel,
  recurrenceTag,
} from "./event-row-action";

interface EventRowProps {
  /** Shows the date beside the time (the Kalakriti highlight has no date heading). */
  showDate?: boolean;
  myInterests: readonly EventInterest[];
  myTeamIds: ReadonlySet<string>;
  /** Pending interest requests on this event, for reviewers only. */
  pendingInterestCount?: number;
  row: PublicDisplayRow;
  userId: string;
}

/**
 * One event on the agenda: start and end time, name with its repeat and
 * privacy tags, team and area with a map link, volunteers against the target,
 * and what the viewer can do (join, show interest) or has done. The whole row
 * opens the event; the name is the link for keyboard and screen-reader users.
 */
export function EventRow({
  myInterests,
  myTeamIds,
  pendingInterestCount = 0,
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
  // A virtual session shares its series' id; interest on it lives on the
  // materialized session, so a series-id match belongs to the first session.
  const interest = row.isVirtualOccurrence
    ? undefined
    : myInterests.find((i) => i.eventId === row.eventId);
  const reviewCount =
    row.isVirtualOccurrence || hasStarted ? 0 : pendingInterestCount;

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
      errorMsg: joinErrorMessage(res, "Couldn't submit interest"),
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
      errorMsg: joinErrorMessage(res, "Couldn't join event"),
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
      case "interestNotReviewed":
        return <StatusBadge tone="neutral">Not reviewed</StatusBadge>;
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

  const mapUrl = rowMapUrl(row);
  const place = rowPlace(row);
  const endLabel = eventEndLabel(row.startTime, row.endTime);
  const repeat = recurrenceTag(row.recurrenceRule);
  const volunteers = row.members.length;
  const needed = row.volunteersNeeded;
  const isShort = needed !== null && volunteers < needed && !hasStarted;
  const linkSearch = row.occDate ? { occDate: row.occDate } : {};
  const tags = (
    <>
      {repeat ? (
        <Tag className="shrink-0">
          <HugeiconsIcon aria-hidden="true" icon={RepeatIcon} />
          {repeat}
        </Tag>
      ) : null}
      {row.isPublic ? null : <Tag className="shrink-0">Team only</Tag>}
    </>
  );
  const hasMeta = Boolean(
    row.team || place || mapUrl || canSeeVolunteers || repeat || !row.isPublic
  );

  return (
    <li className="hover:bg-muted/50 active:bg-muted/70 relative flex items-start gap-3 px-3 py-2.5 transition-colors sm:gap-4 sm:px-4">
      <div className="w-16 shrink-0 pt-px text-xs tabular-nums sm:w-20">
        {showDate ? (
          <div className="text-foreground font-medium">
            {format(row.startTime, DAY_MONTH)}
          </div>
        ) : null}
        <div className="text-foreground text-sm font-medium">
          {format(row.startTime, TIME)}
        </div>
        {endLabel ? (
          <div className="text-muted-foreground">{endLabel}</div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            className="min-w-0 text-sm font-medium wrap-break-word after:absolute after:inset-0 hover:underline sm:truncate"
            params={{ id: row.eventId }}
            search={linkSearch}
            to="/events/$id"
          >
            {row.name}
          </Link>
          <span className="hidden items-center gap-2 sm:flex">{tags}</span>
        </div>
        {hasMeta ? (
          <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span className="flex items-center gap-2 empty:hidden sm:hidden">
              {tags}
            </span>
            {row.team ? (
              <span className="max-w-full wrap-break-word sm:truncate">
                {row.team.name}
              </span>
            ) : null}
            {place ? (
              <span className="flex max-w-full min-w-0 items-start gap-1 sm:items-center">
                <HugeiconsIcon
                  aria-hidden="true"
                  className="mt-px size-3.5 shrink-0 sm:mt-0"
                  icon={Location01Icon}
                  strokeWidth={2}
                />
                <span className="min-w-0 wrap-break-word sm:truncate">
                  {place}
                </span>
              </span>
            ) : null}
            {mapUrl ? (
              <a
                aria-label={`Map for ${row.name} (opens in a new tab)`}
                className="hover:text-foreground relative z-10 flex items-center gap-0.5 underline-offset-2 hover:underline"
                href={mapUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Map
                <HugeiconsIcon
                  aria-hidden="true"
                  className="size-3"
                  icon={ArrowUpRight01Icon}
                  strokeWidth={2}
                />
              </a>
            ) : null}
            {canSeeVolunteers ? (
              <span
                className={cn(
                  "flex items-center gap-1 tabular-nums sm:hidden",
                  isShort && "text-warning-foreground"
                )}
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  className="size-3.5"
                  icon={UserGroupIcon}
                  strokeWidth={2}
                />
                <span className="sr-only">
                  {volunteerTitle(volunteers, needed)}
                </span>
                <span aria-hidden="true">
                  {needed === null ? volunteers : `${volunteers}/${needed}`}
                </span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {canSeeVolunteers ? (
        <span
          className={cn(
            "text-muted-foreground hidden shrink-0 items-center gap-1 self-center text-xs tabular-nums sm:flex",
            isShort && "text-warning-foreground"
          )}
          title={volunteerTitle(volunteers, needed)}
        >
          <HugeiconsIcon
            aria-hidden="true"
            className="size-3.5"
            icon={UserGroupIcon}
            strokeWidth={2}
          />
          <span className="sr-only">Volunteers:</span>
          {needed === null ? volunteers : `${volunteers} of ${needed}`}
        </span>
      ) : null}
      <div className="relative z-10 flex shrink-0 items-center justify-end gap-2 self-center empty:hidden">
        {reviewCount > 0 ? (
          <Link
            aria-label={`${reviewCount} interest ${reviewCount === 1 ? "request" : "requests"} to review for ${row.name}`}
            className="inline-flex rounded-[5px] hover:opacity-80"
            params={{ id: row.eventId }}
            search={linkSearch}
            to="/events/$id"
          >
            <StatusBadge tone="warning">{reviewCount} to review</StatusBadge>
          </Link>
        ) : null}
        {renderAction()}
      </div>
    </li>
  );
}

function volunteerTitle(volunteers: number, needed: number | null): string {
  const noun = volunteers === 1 ? "volunteer" : "volunteers";
  return needed === null
    ? `${volunteers} ${noun}`
    : `${volunteers} of ${needed} ${noun} needed`;
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
