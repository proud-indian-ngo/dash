import { enqueue } from "@pi-dash/jobs/enqueue";
import { withFireAndForgetLog } from "@pi-dash/observability";

export function enqueueGuardianAccessNotification({
  editionName,
  membershipId,
  reusedIdentity,
  userId,
  year,
}: {
  editionName: string;
  membershipId: string;
  reusedIdentity: boolean;
  userId: string;
  year: number;
}) {
  withFireAndForgetLog(
    {
      editionName,
      handler: "inviteGuardian:notifyAccess",
      membershipId,
      reusedIdentity,
      userId,
      year,
    },
    async () => {
      await enqueue("notify-kalakriti-guardian-access", {
        editionName,
        membershipId,
        reusedIdentity,
        userId,
        year,
      });
    }
  );
}

export function enqueueGuardianReactivationNotification({
  editionId,
  membershipId,
  userId,
}: {
  editionId: string;
  membershipId: string;
  userId: string;
}) {
  withFireAndForgetLog(
    {
      editionId,
      handler: "inviteGuardian:notifyReactivation",
      membershipId,
      userId,
    },
    async () => {
      await enqueue(
        "notify-kalakriti-guardian-reactivated",
        { editionId, membershipId, userId },
        {
          singletonKey: `kalakriti-guardian-reactivated-${editionId}-${membershipId}`,
        }
      );
    }
  );
}
