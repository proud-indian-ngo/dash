import { Mail01Icon, WhatsappIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { Switch } from "@pi-dash/design-system/components/ui/switch";
import { TOPIC_CATALOG } from "@pi-dash/notifications/topics";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { log } from "evlog";
import { toast } from "sonner";
import { useApp } from "@/context/app-context";
import { handleMutationResult } from "@/lib/mutation-result";
import { groupBy, NOTIFICATION_GROUP_ORDER } from "@/lib/notification-helpers";

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
      topicId: meta.id,
      topicName: meta.name,
      description: meta.description,
      group: meta.group,
      required: meta.required,
      emailEnabled: pref?.emailEnabled ?? true,
      whatsappEnabled: pref?.whatsappEnabled ?? true,
    };
  });

  const groupedTopics = groupBy(topicsWithPrefs, (t) => t.group);

  const handleToggle = async (
    topicId: string,
    channel: "email" | "whatsapp",
    enabled: boolean
  ) => {
    try {
      const res = await zero.mutate(
        mutators.notificationPreference.upsert({
          topicId,
          channel,
          enabled,
        })
      ).server;
      handleMutationResult(res, {
        mutation: "notificationPreference.upsert",
        entityId: topicId,
        successMsg: enabled ? "Notification enabled" : "Notification disabled",
        errorMsg: "Failed to update notification preference",
      });
    } catch (error) {
      log.error({
        component: "NotificationsSection",
        action: "updatePreference",
        topicId,
        channel,
        enabled,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to update notification preference");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <Skeleton className="h-4 w-64" />
        <div className="space-y-6">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              className="flex items-center justify-between border-b pb-4 last:border-b-0 last:pb-0"
              key={i}
            >
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
              <div className="flex gap-6">
                <Skeleton className="h-5 w-9 rounded-full" />
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <p className="text-muted-foreground text-sm">
        Choose which notifications you want to receive.
      </p>

      {NOTIFICATION_GROUP_ORDER.flatMap((groupName, groupIndex) => {
        const items = groupedTopics.get(groupName);
        if (!items || items.length === 0) {
          return [];
        }
        const elements = [
          groupIndex > 0 && <Separator key={`sep-${groupName}`} />,
          <div className="space-y-5" key={groupName}>
            <div className="flex items-center justify-between">
              <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {groupName}
              </p>
              {groupIndex === 0 && (
                <div className="flex items-center gap-6">
                  <div className="flex w-9 items-center justify-center">
                    <HugeiconsIcon
                      className="text-muted-foreground"
                      icon={Mail01Icon}
                      size={14}
                      strokeWidth={2}
                    />
                  </div>
                  <div className="flex w-9 items-center justify-center">
                    <HugeiconsIcon
                      className="text-muted-foreground"
                      icon={WhatsappIcon}
                      size={14}
                      strokeWidth={2}
                    />
                  </div>
                </div>
              )}
            </div>
            {items.map((topic) => (
              <div
                className="flex items-center justify-between gap-4"
                key={topic.topicId}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-sm">{topic.topicName}</p>
                  <p className="text-muted-foreground text-sm">
                    {topic.required
                      ? "This notification is required and cannot be disabled."
                      : topic.description}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-6">
                  <Switch
                    aria-label={`${topic.topicName} email`}
                    checked={topic.emailEnabled}
                    disabled={topic.required}
                    id={`${topic.topicId}-email`}
                    onCheckedChange={(checked) =>
                      handleToggle(topic.topicId, "email", checked)
                    }
                  />
                  <Switch
                    aria-label={`${topic.topicName} WhatsApp`}
                    checked={topic.whatsappEnabled}
                    disabled={topic.required}
                    id={`${topic.topicId}-whatsapp`}
                    onCheckedChange={(checked) =>
                      handleToggle(topic.topicId, "whatsapp", checked)
                    }
                  />
                </div>
              </div>
            ))}
          </div>,
        ];
        return elements.filter(Boolean);
      })}
    </div>
  );
}
