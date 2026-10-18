import { Checkbox } from "@pi-dash/design-system/components/ui/checkbox";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import type { NotificationChannel } from "@pi-dash/notifications/topics";

import { groupBy, NOTIFICATION_GROUP_ORDER } from "@/lib/notification-helpers";

export type PreferenceChannel = "email" | "whatsapp" | "inbox";

export interface TopicPreference {
  channels: readonly NotificationChannel[];
  description: string;
  emailEnabled: boolean;
  group: string;
  inboxEnabled: boolean;
  required: boolean;
  topicId: string;
  topicName: string;
  whatsappEnabled: boolean;
}

interface TopicPreferenceRowProps {
  /** Phones: the channels sit under the title as labelled checkboxes. */
  stacked: boolean;
  onToggle: (
    topicId: string,
    channel: PreferenceChannel,
    enabled: boolean
  ) => void;
  topic: TopicPreference;
}

function TopicPreferenceRow({
  onToggle,
  stacked,
  topic,
}: TopicPreferenceRowProps) {
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
      title: "Inbox",
      onChange: handleInboxChange,
    },
    {
      channel: "email",
      checked: topic.emailEnabled,
      label: "email",
      title: "Email",
      onChange: handleEmailChange,
    },
    {
      channel: "whatsapp",
      checked: topic.whatsappEnabled,
      label: "WhatsApp",
      title: "WhatsApp",
      onChange: handleWhatsappChange,
    },
  ] as const;
  const description = topic.required
    ? "Required, can't be turned off."
    : topic.description;

  if (stacked) {
    return (
      <div className="grid gap-2 px-4 py-3">
        <div>
          <p className="text-sm font-medium">{topic.topicName}</p>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {cells.map((cell) =>
            topic.channels.includes(cell.channel) ? (
              <label
                className="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-sm has-disabled:cursor-not-allowed pointer-coarse:h-10"
                key={cell.channel}
              >
                <Checkbox
                  aria-label={`${topic.group} ${topic.topicName} ${cell.label}`}
                  checked={cell.checked}
                  disabled={topic.required}
                  id={`${topic.topicId}-${cell.channel}`}
                  onCheckedChange={cell.onChange}
                />
                {cell.title}
              </label>
            ) : null
          )}
        </div>
      </div>
    );
  }

  return (
    <tr className="border-t">
      <th className="py-2.5 pr-2 pl-4 text-left font-normal" scope="row">
        <span className="block text-sm font-medium">{topic.topicName}</span>
        <span className="text-muted-foreground block text-xs">
          {description}
        </span>
      </th>
      {cells.map((cell) => (
        <td
          className="w-14 text-center last:pr-3 sm:w-20 sm:last:pr-0"
          key={cell.channel}
        >
          {topic.channels.includes(cell.channel) ? (
            <Checkbox
              aria-label={`${topic.group} ${topic.topicName} ${cell.label}`}
              checked={cell.checked}
              // Grow the hit area to the whole 56x44 cell, not just the box.
              className="mx-auto after:-inset-x-5 after:-inset-y-3.5"
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

/**
 * Notification topics by group, one checkbox per channel (Inbox, Email,
 * WhatsApp). Used for a person's own settings and by admins on a user.
 */
export function NotificationPreferenceGrid({
  isLoading,
  onToggle,
  topics,
}: {
  isLoading: boolean;
  onToggle: (
    topicId: string,
    channel: PreferenceChannel,
    enabled: boolean
  ) => void;
  topics: readonly TopicPreference[];
}) {
  const groupedTopics = groupBy([...topics], (t) => t.group);
  const handleToggle = onToggle;
  const isMobile = useIsMobile();
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

  if (isMobile) {
    return (
      <div className="divide-y overflow-hidden rounded-lg border">
        {NOTIFICATION_GROUP_ORDER.map((groupName) => {
          const items = groupedTopics.get(groupName);
          if (!items || items.length === 0) {
            return null;
          }
          return (
            <section
              aria-label={groupName}
              className="divide-y"
              key={groupName}
            >
              <h3 className="text-muted-foreground bg-muted/40 px-4 py-1.5 text-xs font-medium">
                {groupName}
              </h3>
              {items.map((topic) => (
                <TopicPreferenceRow
                  key={topic.topicId}
                  onToggle={handleToggle}
                  stacked
                  topic={topic}
                />
              ))}
            </section>
          );
        })}
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
            <th
              className="w-14 py-2 pr-3 text-xs font-medium sm:w-20 sm:pr-0"
              scope="col"
            >
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
                  stacked={false}
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
