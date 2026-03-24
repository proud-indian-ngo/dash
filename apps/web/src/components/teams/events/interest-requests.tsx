import { Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventInterest, User } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { useCallback, useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { LOCALE_DATE } from "@/lib/date-formats";
import { handleMutationResult } from "@/lib/mutation-result";

export type InterestWithUser = EventInterest & { user: User | undefined };

interface InterestRequestsProps {
  interests: readonly InterestWithUser[];
}

function InterestRow({ interest }: { interest: InterestWithUser }) {
  const zero = useZero();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApprove = useCallback(async () => {
    setIsSubmitting(true);
    const res = await zero.mutate(
      mutators.eventInterest.approve({ id: interest.id, now: Date.now() })
    ).server;
    setIsSubmitting(false);
    handleMutationResult(res, {
      mutation: "eventInterest.approve",
      entityId: interest.id,
      successMsg: "Interest approved",
      errorMsg: "Failed to approve interest",
    });
  }, [zero, interest.id]);

  const handleReject = useCallback(async () => {
    setIsSubmitting(true);
    const res = await zero.mutate(
      mutators.eventInterest.reject({ id: interest.id, now: Date.now() })
    ).server;
    setIsSubmitting(false);
    handleMutationResult(res, {
      mutation: "eventInterest.reject",
      entityId: interest.id,
      successMsg: "Interest rejected",
      errorMsg: "Failed to reject interest",
    });
  }, [zero, interest.id]);

  return (
    <div className="flex items-center gap-3 rounded-md border p-2">
      {interest.user ? (
        <UserAvatar
          className="size-8"
          fallbackClassName="text-xs"
          user={interest.user}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-sm">
          {interest.user?.name ?? "Unknown"}
        </div>
        <div className="text-muted-foreground text-xs">
          {format(new Date(interest.createdAt), LOCALE_DATE)}
        </div>
        {interest.message ? (
          <div className="mt-1 text-muted-foreground text-xs italic">
            "{interest.message}"
          </div>
        ) : null}
      </div>
      {interest.status === "pending" ? (
        <div className="flex gap-1">
          <Button
            aria-label={`Approve ${interest.user?.name ?? "request"}`}
            disabled={isSubmitting}
            onClick={handleApprove}
            size="icon"
            variant="ghost"
          >
            <HugeiconsIcon
              aria-hidden="true"
              className="size-4 text-green-600"
              icon={Tick02Icon}
            />
          </Button>
          <Button
            aria-label={`Reject ${interest.user?.name ?? "request"}`}
            disabled={isSubmitting}
            onClick={handleReject}
            size="icon"
            variant="ghost"
          >
            <HugeiconsIcon
              aria-hidden="true"
              className="size-4 text-destructive"
              icon={Cancel01Icon}
            />
          </Button>
        </div>
      ) : (
        <Badge
          variant={interest.status === "approved" ? "default" : "secondary"}
        >
          {interest.status === "approved" ? "Approved" : "Rejected"}
        </Badge>
      )}
    </div>
  );
}

export function InterestRequests({ interests }: InterestRequestsProps) {
  const pendingInterests = interests.filter((i) => i.status === "pending");

  if (pendingInterests.length === 0) {
    return null;
  }

  return (
    <>
      <Separator />
      <div className="flex flex-col gap-2">
        <h2 className="font-medium text-sm">
          Interest Requests ({pendingInterests.length})
        </h2>
        {pendingInterests.map((interest) => (
          <InterestRow interest={interest} key={interest.id} />
        ))}
      </div>
    </>
  );
}
