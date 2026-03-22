import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { Switch } from "@pi-dash/design-system/components/ui/switch";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { TopicPreference } from "@/functions/notification-preferences";
import {
  getNotificationPreferencesAdmin,
  getWhatsAppNotificationPrefAdmin,
  updateNotificationPreferenceAdmin,
  updateWhatsAppNotificationPrefAdmin,
} from "@/functions/notification-preferences";

const TOPIC_DESCRIPTIONS: Record<string, string> = {
  "General Notifications":
    "Advance payments, reimbursements, approvals, and rejections.",
  "Account Notifications":
    "Welcome messages, role changes, and account status updates.",
  "Event Notifications":
    "Team event creation, updates, cancellations, and interest responses.",
};

interface UserNotificationsFormProps {
  userId: string;
}

export function UserNotificationsForm({ userId }: UserNotificationsFormProps) {
  const [preferences, setPreferences] = useState<TopicPreference[]>([]);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [inflightTopics, setInflightTopics] = useState<Set<string>>(new Set());
  const [inflightWhatsApp, setInflightWhatsApp] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getNotificationPreferencesAdmin({ data: { userId } }),
      getWhatsAppNotificationPrefAdmin({ data: { userId } }),
    ])
      .then(([prefs, waPref]) => {
        if (cancelled) {
          return;
        }
        setPreferences(prefs);
        setWhatsappEnabled(waPref);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        log.error({
          component: "UserNotificationsForm",
          action: "fetchPreferences",
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error("Failed to load notification preferences");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleToggle = async (topicId: string, enabled: boolean) => {
    setPreferences((prev) =>
      prev.map((p) => (p.topicId === topicId ? { ...p, enabled } : p))
    );
    setInflightTopics((prev) => new Set(prev).add(topicId));

    try {
      await updateNotificationPreferenceAdmin({
        data: { userId, topicId, enabled },
      });
      toast.success(enabled ? "Notification enabled" : "Notification disabled");
    } catch (error) {
      setPreferences((prev) =>
        prev.map((p) =>
          p.topicId === topicId ? { ...p, enabled: !enabled } : p
        )
      );
      log.error({
        component: "UserNotificationsForm",
        action: "updatePreference",
        userId,
        topicId,
        enabled,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to update notification preference");
    } finally {
      setInflightTopics((prev) => {
        const next = new Set(prev);
        next.delete(topicId);
        return next;
      });
    }
  };

  const handleWhatsAppToggle = async (enabled: boolean) => {
    setWhatsappEnabled(enabled);
    setInflightWhatsApp(true);

    try {
      await updateWhatsAppNotificationPrefAdmin({
        data: { userId, enabled },
      });
      toast.success(
        enabled
          ? "WhatsApp notifications enabled"
          : "WhatsApp notifications disabled"
      );
    } catch (error) {
      setWhatsappEnabled(!enabled);
      log.error({
        component: "UserNotificationsForm",
        action: "updateWhatsAppPref",
        userId,
        enabled,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to update WhatsApp preference");
    } finally {
      setInflightWhatsApp(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-4 pt-0">
        <Skeleton className="h-4 w-64" />
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div
              className="flex items-center justify-between border-b pb-4 last:border-b-0 last:pb-0"
              key={i}
            >
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-5 w-9 rounded-full" />
            </div>
          ))}
        </div>
        <Separator />
        <div className="space-y-6">
          <Skeleton className="h-3 w-16" />
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 pt-0">
      <p className="text-muted-foreground text-sm">
        Manage notification preferences for this user.
      </p>
      <div className="space-y-6">
        {preferences.map((pref) => (
          <div
            className="flex items-center justify-between border-b pb-4 last:border-b-0 last:pb-0"
            key={pref.topicId}
          >
            <div className="space-y-0.5">
              <p className="font-medium text-sm">{pref.topicName}</p>
              <p className="text-muted-foreground text-xs">
                {pref.required
                  ? "This notification is required and cannot be disabled."
                  : (TOPIC_DESCRIPTIONS[pref.topicName] ??
                    "Manage this notification preference.")}
              </p>
            </div>
            <Switch
              aria-label={pref.topicName}
              checked={pref.enabled}
              disabled={pref.required || inflightTopics.has(pref.topicId)}
              id={pref.topicId}
              onCheckedChange={(checked) => handleToggle(pref.topicId, checked)}
            />
          </div>
        ))}
      </div>
      <Separator />
      <div className="space-y-6">
        <p className="font-medium text-xs">WhatsApp</p>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="font-medium text-sm">WhatsApp Notifications</p>
            <p className="text-muted-foreground text-xs">
              Receive notifications via WhatsApp messages.
            </p>
          </div>
          <Switch
            aria-label="WhatsApp Notifications"
            checked={whatsappEnabled}
            disabled={inflightWhatsApp}
            id="whatsapp-notifications"
            onCheckedChange={handleWhatsAppToggle}
          />
        </div>
      </div>
    </div>
  );
}
