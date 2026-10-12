import { Checkbox } from "@pi-dash/design-system/components/ui/checkbox";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  getTopicChannels,
  type NotificationChannel,
  TOPIC_CATALOG,
} from "@pi-dash/notifications/topics";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { log } from "evlog";
import { toast } from "sonner";

import { useApp } from "@/context/app-context";
import { handleMutationResult } from "@/lib/mutation-result";
import { groupBy, NOTIFICATION_GROUP_ORDER } from "@/lib/notification-helpers";

interface TopicPreferenceRowProps {
  onToggle: (
    topicId: string,
    channel: "email" | "whatsapp" | "inbox",
    enabled: boolean
  ) => void;
  topic: {
    channels: readonly NotificationChannel[];
    description: string;
    emailEnabled: boolean;
    group: string;
    inboxEnabled: boolean;
    required: boolean;
    topicId: string;
    topicName: string;
    whatsappEnabled: boolean;
  };
}

function TopicPreferenceRow({ onToggle, topic }: TopicPreferenceRowProps) {
  const handleInboxChange = useEventCallback((checked: boolean) =>
    onToggle(topic.topicId, "inbox", checked)
  );
  const handleEmailChange = useEventCallback((checked: boolean) =>
    onToggle(topic.topicId, "email", checked)
  );
  const handleWhatsappChange = useEventCallback((checked: boolean) =>
    onToggle(topic.topicId, "whatsapp", checked)
  );

  const cells = [
    {
      channel: "inbox",
      checked: topic.inboxEnabled,
      label: "in-app",
      onChange: handleInboxChange,
    },
    {
      channel: "email",
      checked: topic.emailEnabled,
      label: "email",
      onChange: handleEmailChange,
    },
    {
      channel: "whatsapp",
      checked: topic.whatsappEnabled,
      label: "WhatsApp",
      onChange: handleWhatsappChange,
    },
  ] as const;

  return (
    <tr className="border-t">
      <th className="py-2.5 pr-2 pl-4 text-left font-normal" scope="row">
        <span className="block text-sm font-medium">{topic.topicName}</span>
        <span className="text-muted-foreground block text-xs">
          {topic.required
            ? "Required, can't be turned off."
            : topic.description}
        </span>
      </th>
      {cells.map((cell) => (
        <td className="w-14 text-center sm:w-20" key={cell.channel}>
          {topic.channels.includes(cell.channel) ? (
            <Checkbox
              aria-label={`${topic.group} ${topic.topicName} ${cell.label}`}
              checked={cell.checked}
              className="align-middle"
              disabled={topic.required}
              id={`${topic.topicId}-${cell.channel}`}
              onCheckedChange={cell.onChange}
            />
          ) : (
            <span aria-label="Not available" className="text-muted-foreground">
              –
            </span>
          )}
        </td>
      ))}
    </tr>
  );
}

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

  const groupedTopics = groupBy(topicsWithPrefs, (t) => t.group);

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

  if (isLoading) {
    return (
      <div className="divide-y rounded-lg border">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div className="flex items-center justify-between px-4 py-3" key={i}>
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
            <div className="flex gap-14 pr-6">
              <Skeleton className="size-4" />
              <Skeleton className="size-4" />
              <Skeleton className="size-4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium" scope="col">
              Notification
            </th>
            <th className="w-14 py-2 text-xs font-medium sm:w-20" scope="col">
              Inbox
            </th>
            <th className="w-14 py-2 text-xs font-medium sm:w-20" scope="col">
              Email
            </th>
            <th className="w-14 py-2 text-xs font-medium sm:w-20" scope="col">
              WhatsApp
            </th>
          </tr>
        </thead>
        {NOTIFICATION_GROUP_ORDER.map((groupName) => {
          const items = groupedTopics.get(groupName);
          if (!items || items.length === 0) {
            return null;
          }
          return (
            <tbody key={groupName}>
              <tr className="border-t">
                <th
                  className="text-muted-foreground bg-muted/20 px-4 py-1.5 text-left text-xs font-medium"
                  colSpan={4}
                  scope="rowgroup"
                >
                  {groupName}
                </th>
              </tr>
              {items.map((topic) => (
                <TopicPreferenceRow
                  key={topic.topicId}
                  onToggle={handleToggle}
                  topic={topic}
                />
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
