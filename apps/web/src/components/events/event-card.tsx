import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { cn } from "@pi-dash/design-system/lib/utils";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventInterest } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { uuidv7 } from "uuidv7";
import type { PublicDisplayRow } from "@/components/events/public-events-table";
import { useApp } from "@/context/app-context";
import { handleMutationResult } from "@/lib/mutation-result";

interface EventCardProps {
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
        kind: "interestPending",
        interestId: opts.interest.id,
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

export function EventCard({
  myInterests,
  myTeamIds,
  row,
  userId,
}: EventCardProps) {
  const zero = useZero();
  const navigate = useNavigate();
  const { hasPermission } = useApp();
  const now = Date.now();
  const hasStarted = row.startTime <= now;
  const isOver = (row.endTime ?? row.startTime) <= now;
  const isMember = row.members.some((m) => m.userId === userId);
  const isOwnTeam = Boolean(row.team?.id && myTeamIds.has(row.team.id));
  const canManageInterest = hasPermission("events.manage_interest");
  const canSeeVolunteers = isOver || canManageInterest || isOwnTeam;
  const interest = myInterests.find((i) => i.eventId === row.eventId);

  const handleShowInterest = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const id = uuidv7();
    const res = await zero.mutate(
      mutators.eventInterest.create({
        id,
        eventId: row.eventId,
        now: Date.now(),
      })
    ).server;
    handleMutationResult(res, {
      mutation: "eventInterest.create",
      entityId: id,
      successMsg: "Interest submitted!",
      errorMsg: "Couldn't submit interest",
    });
  };

  const handleJoinAsMember = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const id = uuidv7();
    const res = await zero.mutate(
      mutators.teamEvent.joinAsMember({
        id,
        eventId: row.eventId,
        occDate: row.isVirtualOccurrence
          ? (row.occDate ?? undefined)
          : undefined,
        materializedId: row.isVirtualOccurrence ? uuidv7() : undefined,
        now: Date.now(),
      })
    ).server;
    handleMutationResult(res, {
      mutation: "teamEvent.joinAsMember",
      entityId: id,
      successMsg: "Joined event",
      errorMsg: "Couldn't join event",
    });
  };

  const handleCancelInterest = async (
    e: React.MouseEvent,
    interestId: string
  ) => {
    e.stopPropagation();
    const res = await zero.mutate(
      mutators.eventInterest.cancel({ id: interestId })
    ).server;
    handleMutationResult(res, {
      mutation: "eventInterest.cancel",
      entityId: interestId,
      errorMsg: "Couldn't cancel interest",
    });
  };

  const handleCardClick = () => {
    navigate({
      to: "/events/$id",
      params: { id: row.eventId },
      search: row.occDate ? { occDate: row.occDate } : {},
    });
  };

  const renderAction = () => {
    const action = deriveCardActionState({
      isMember,
      interest,
      hasStarted,
      canManageInterest,
      isOwnTeam,
      isPublic: row.isPublic,
    });
    switch (action.kind) {
      case "joined":
        return <Badge variant="default">Joined</Badge>;
      case "interestPending":
        return action.started ? (
          <Badge variant="secondary">Interest Pending</Badge>
        ) : (
          <Button
            onClick={(e) => handleCancelInterest(e, action.interestId)}
            size="sm"
            variant="outline"
          >
            Cancel Interest
          </Button>
        );
      case "interestApproved":
        return <Badge variant="default">Interest Approved</Badge>;
      case "interestDeclined":
        return <Badge variant="secondary">Interest Declined</Badge>;
      case "join":
        return (
          <Button onClick={handleJoinAsMember} size="sm">
            Join
          </Button>
        );
      case "showInterest":
        return (
          <Button onClick={handleShowInterest} size="sm">
            Show Interest
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors hover:bg-muted/50",
        hasStarted && !isMember && "opacity-60"
      )}
      onClick={handleCardClick}
      size="sm"
    >
      <div className="flex">
        <div className="flex w-20 shrink-0 flex-col items-center justify-center border-r px-2 py-2 text-center">
          <span className="font-medium text-muted-foreground text-xs uppercase">
            {format(row.startTime, "EEE")}
          </span>
          <span className="font-semibold text-sm uppercase">
            {format(row.startTime, "MMM d")}
          </span>
          <span className="text-muted-foreground text-xs">
            {format(row.startTime, "h:mm a")}
          </span>
        </div>
        <CardHeader className="min-w-0 flex-1">
          <CardTitle>
            <Link
              className="hover:underline"
              onClick={(e) => e.stopPropagation()}
              params={{ id: row.eventId }}
              search={row.occDate ? { occDate: row.occDate } : {}}
              to="/events/$id"
            >
              {row.name}
            </Link>
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {row.team && <span>{row.team.name}</span>}
            {row.location && (
              <span className="max-w-48 truncate">{row.location}</span>
            )}
            {canSeeVolunteers && (
              <Badge className="ml-0.5" variant="secondary">
                {row.members.length}{" "}
                {row.members.length === 1 ? "volunteer" : "volunteers"}
              </Badge>
            )}
          </CardDescription>
          <CardAction>{renderAction()}</CardAction>
        </CardHeader>
      </div>
    </Card>
  );
}
