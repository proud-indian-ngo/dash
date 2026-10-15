import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { getTopicChannels, TOPIC_CATALOG } from "@pi-dash/notifications/topics";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { log } from "evlog";
import { toast } from "sonner";

import { NotificationPreferenceGrid } from "@/components/settings/notification-preference-grid";
import { useApp } from "@/context/app-context";
import { handleMutationResult } from "@/lib/mutation-result";

export function NotificationsSection() {
  const { hasPermission } = useApp();
  const zero = useZero();
  const [preferences, result] = useQuery(
    queries.notificationPreference.byCurrentUser()
  );

  const isLoading = preferences.length === 0 && result.type !== "complete";

  const prefMap = new Map(preferences.map((p) => [p.topicId, p]));

  const visibleTopics = TOPIC_CATALOG.filter(
    (meta) => !meta.requiredPermission || hasPermission(meta.requiredPermission)
  );

  const topicsWithPrefs = visibleTopics.map((meta) => {
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
      try {
        const res = await zero.mutate(
          mutators.notificationPreference.upsert({
            channel,
            enabled,
            topicId,
          })
        ).server;
        handleMutationResult(res, {
          entityId: topicId,
          errorMsg: "Couldn't update notification preference",
          mutation: "notificationPreference.upsert",
          successMsg: enabled
            ? "Notification turned on"
            : "Notification turned off",
        });
      } catch (error) {
        log.error({
          action: "updatePreference",
          channel,
          component: "NotificationsSection",
          enabled,
          error: error instanceof Error ? error.message : String(error),
          topicId,
        });
        toast.error("Couldn't update notification preference");
      }
    }
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Your inbox updates right away. Email and WhatsApp can take a few
        minutes, and several updates on one topic arrive together as one
        message.
      </p>
      <NotificationPreferenceGrid
        isLoading={isLoading}
        onToggle={handleToggle}
        topics={topicsWithPrefs}
      />
    </div>
  );
}
