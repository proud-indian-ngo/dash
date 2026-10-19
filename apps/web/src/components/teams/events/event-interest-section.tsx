import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";

import type { StatusTone } from "@/components/shared/status-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { handleMutationResult } from "@/lib/mutation-result";

import type { InterestWithUser } from "./interest-requests";

const interestStatusMap = {
  approved: { label: "Interest approved", tone: "success" },
  // Closed by the daily job: the event started before anyone reviewed it.
  expired: { label: "Not reviewed", tone: "neutral" },
  pending: { label: "Interest pending", tone: "warning" },
  rejected: { label: "Interest declined", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: StatusTone }>;

export function VolunteerInterestSection({
  canManage,
  canManageInterest,
  isMember,
  isPublic,
  isTeamMember,
  myInterest,
  onJoinAsMember,
  onLeaveEvent,
  onShowInterest,
}: {
  canManage: boolean;
  canManageInterest?: boolean;
  isMember?: boolean;
  isPublic: boolean;
  isTeamMember?: boolean;
  myInterest?: InterestWithUser | null;
  onJoinAsMember?: () => void;
  onLeaveEvent?: () => void;
  onShowInterest: () => void;
}) {
  const zero = useZero();
  const excluded = canManage || canManageInterest || isMember;
  const showJoin = !excluded && isTeamMember && !!onJoinAsMember;
  const showInterest = !(excluded || isTeamMember || myInterest) && isPublic;
  const showLeave = isMember && !canManage && !!onLeaveEvent;

  const handleCancel = useEventCallback(async () => {
    if (!myInterest) {
      return;
    }
    const res = await zero.mutate(
      mutators.eventInterest.cancel({ id: myInterest.id })
    ).server;
    handleMutationResult(res, {
      entityId: myInterest.id,
      errorMsg: "Failed to cancel interest",
      mutation: "eventInterest.cancel",
      successMsg: "Interest cancelled",
    });
  });

  return (
    <>
      {showJoin ? (
        <Button onClick={onJoinAsMember} size="sm" variant="default">
          Join
        </Button>
      ) : null}
      {showInterest ? (
        <Button onClick={onShowInterest} size="sm" variant="default">
          Show interest
        </Button>
      ) : null}
      {showLeave ? (
        <Button onClick={onLeaveEvent} size="sm" variant="outline">
          Leave event
        </Button>
      ) : null}
      {myInterest && !isMember ? (
        <div className="flex items-center gap-2">
          <StatusBadge
            tone={
              interestStatusMap[
                myInterest.status as keyof typeof interestStatusMap
              ]?.tone ?? "neutral"
            }
          >
            {interestStatusMap[
              myInterest.status as keyof typeof interestStatusMap
            ]?.label ?? myInterest.status}
          </StatusBadge>
          {myInterest.status === "pending" ? (
            <Button onClick={handleCancel} size="sm" variant="ghost">
              Cancel interest
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function PastInterestBadge({
  isMember,
  myInterest,
}: {
  isMember?: boolean;
  myInterest?: InterestWithUser | null;
}) {
  if (!myInterest || isMember) {
    return null;
  }
  const status = myInterest.status as keyof typeof interestStatusMap;
  const { label, tone } = interestStatusMap[status] ?? {
    label: myInterest.status,
    tone: "neutral" as const,
  };
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}
