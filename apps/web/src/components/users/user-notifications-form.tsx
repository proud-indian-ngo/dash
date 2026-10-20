import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { getTopicChannels, TOPIC_CATALOG } from "@pi-dash/notifications/topics";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { log } from "evlog";
import { toast } from "sonner";

import { NotificationPreferenceGrid } from "@/components/settings/notification-preference-grid";
import { handleMutationResult } from "@/lib/mutation-result";
import { isAwaitingResult } from "@/lib/zero-result";

interface UserNotificationsFormProps {
  userId: string;
}

export function UserNotificationsForm({ userId }: UserNotificationsFormProps) {
  const zero = useZero();
  const [preferences, result] = useQuery(
    queries.notificationPreference.byUser({ userId })
  );

  const isLoading = preferences.length === 0 && isAwaitingResult(result);

  const prefMap = new Map(preferences.map((p) => [p.topicId, p]));

  const topicsWithPrefs = TOPIC_CATALOG.map((meta) => {
    const pref = prefMap.get(meta.id);
    return {
      channels: getTopicChannels(meta.id),
      description: meta.description,
      emailEnabled: pref?.emailEnabled ?? true,
      group: meta.group,
      inboxEnabled: pref?.inboxEnabled ?? true,
      required: meta.required,
      topicId: meta.id,
      topicName: meta.name,
      whatsappEnabled: pref?.whatsappEnabled ?? true,
    };
  });

  const handleToggle = useEventCallback(
    async (
      topicId: string,
      channel: "email" | "whatsapp" | "inbox",
      enabled: boolean
    ) => {
      const successMsg = enabled
        ? "Notification turned on"
        : "Notification turned off";
      try {
        const res = await zero.mutate(
          mutators.notificationPreference.adminUpsert({
            channel,
            enabled,
            topicId,
            userId,
          })
        ).server;
        handleMutationResult(res, {
          entityId: topicId,
          errorMsg: "Couldn't update notification preference",
          mutation: "notificationPreference.adminUpsert",
          successMsg,
        });
      } catch (error) {
        log.error({
          action: "updatePreference",
          channel,
          component: "UserNotificationsForm",
          enabled,
          error: error instanceof Error ? error.message : String(error),
          topicId,
          userId,
        });
        toast.error("Couldn't update notification preference");
      }
    }
  );

  return (
    <div className="p-4">
      <NotificationPreferenceGrid
        isLoading={isLoading}
        onToggle={handleToggle}
        topics={topicsWithPrefs}
      />
    </div>
  );
}
