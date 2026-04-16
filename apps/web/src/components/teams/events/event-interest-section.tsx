import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { handleMutationResult } from "@/lib/mutation-result";
import type { InterestWithUser } from "./interest-requests";
import { InterestRequests } from "./interest-requests";

const interestStatusMap = {
  pending: { label: "Interest Pending", variant: "outline" },
  approved: { label: "Interest Approved", variant: "default" },
  rejected: { label: "Interest Declined", variant: "secondary" },
} as const satisfies Record<string, { label: string; variant: string }>;

export function VolunteerInterestSection({
  canManage,
  canManageInterest,
  interests,
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
  interests?: readonly InterestWithUser[];
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

  const handleCancel = async () => {
    if (!myInterest) {
      return;
    }
    const res = await zero.mutate(
      mutators.eventInterest.cancel({ id: myInterest.id })
    ).server;
    handleMutationResult(res, {
      mutation: "eventInterest.cancel",
      entityId: myInterest.id,
      successMsg: "Interest cancelled",
      errorMsg: "Failed to cancel interest",
    });
  };

  return (
    <>
      {showJoin ? (
        <Button onClick={onJoinAsMember} size="sm" variant="default">
          Join
        </Button>
      ) : null}
      {showInterest ? (
        <Button onClick={onShowInterest} size="sm" variant="default">
          Show Interest
        </Button>
      ) : null}
      {showLeave ? (
        <Button onClick={onLeaveEvent} size="sm" variant="outline">
          Leave Event
        </Button>
      ) : null}
      {myInterest && !isMember ? (
        <div className="flex items-center gap-2">
          <Badge
            variant={
              interestStatusMap[
                myInterest.status as keyof typeof interestStatusMap
              ]?.variant ?? "outline"
            }
          >
            {interestStatusMap[
              myInterest.status as keyof typeof interestStatusMap
            ]?.label ?? myInterest.status}
          </Badge>
          {myInterest.status === "pending" ? (
            <Button onClick={handleCancel} size="sm" variant="ghost">
              Cancel Interest
            </Button>
          ) : null}
        </div>
      ) : null}
      {canManage && interests ? (
        <InterestRequests interests={interests} />
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
  const { label, variant } = interestStatusMap[status] ?? {
    label: myInterest.status,
    variant: "outline" as const,
  };
  return <Badge variant={variant}>{label}</Badge>;
}
