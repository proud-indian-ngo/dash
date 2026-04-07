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

  const handleJoin = async (e: React.MouseEvent) => {
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
      errorMsg: "Failed to submit interest",
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
      errorMsg: "Failed to cancel interest",
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
    if (isMember) {
      return <Badge variant="default">Joined</Badge>;
    }
    if (interest) {
      if (interest.status === "pending") {
        if (hasStarted) {
          return <Badge variant="secondary">Interest Pending</Badge>;
        }
        return (
          <Button
            onClick={(e) => handleCancelInterest(e, interest.id)}
            size="sm"
            variant="outline"
          >
            Cancel Interest
          </Button>
        );
      }
      if (interest.status === "approved") {
        return <Badge variant="default">Interest Approved</Badge>;
      }
      if (interest.status === "rejected") {
        return <Badge variant="secondary">Interest Declined</Badge>;
      }
    }
    if (!(hasStarted || isOwnTeam || canManageInterest)) {
      return (
        <Button onClick={handleJoin} size="sm">
          Join
        </Button>
      );
    }
    return null;
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
      <CardHeader>
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
          <span>{format(row.startTime, "h:mm a")}</span>
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
    </Card>
  );
}
