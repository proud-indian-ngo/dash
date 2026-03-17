import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { Switch } from "@pi-dash/design-system/components/ui/switch";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { TopicPreference } from "@/functions/notification-preferences";
import {
  getNotificationPreferences,
  getWhatsAppNotificationPref,
  updateNotificationPreference,
  updateWhatsAppNotificationPref,
} from "@/functions/notification-preferences";

const TOPIC_DESCRIPTIONS: Record<string, string> = {
  "General Notifications":
    "Advance payments, reimbursements, approvals, and rejections.",
  "Account Notifications":
    "Welcome messages, role changes, and account status updates.",
  "Event Notifications":
    "Team event creation, updates, cancellations, and interest responses.",
};

export function NotificationsSection() {
  const [preferences, setPreferences] = useState<TopicPreference[]>([]);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getNotificationPreferences(), getWhatsAppNotificationPref()])
      .then(([prefs, waPref]) => {
        setPreferences(prefs);
        setWhatsappEnabled(waPref);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (topicId: string, enabled: boolean) => {
    setPreferences((prev) =>
      prev.map((p) => (p.topicId === topicId ? { ...p, enabled } : p))
    );

    try {
      await updateNotificationPreference({
        data: { topicId, enabled },
      });
      toast.success(enabled ? "Notification enabled" : "Notification disabled");
    } catch (error) {
      setPreferences((prev) =>
        prev.map((p) =>
          p.topicId === topicId ? { ...p, enabled: !enabled } : p
        )
      );
      log.error({
        component: "NotificationsSection",
        action: "updatePreference",
        topicId,
        enabled,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to update notification preference");
    }
  };

  const handleWhatsAppToggle = async (enabled: boolean) => {
    setWhatsappEnabled(enabled);

    try {
      await updateWhatsAppNotificationPref({ data: { enabled } });
      toast.success(
        enabled
          ? "WhatsApp notifications enabled"
          : "WhatsApp notifications disabled"
      );
    } catch (error) {
      setWhatsappEnabled(!enabled);
      log.error({
        component: "NotificationsSection",
        action: "updateWhatsAppPref",
        enabled,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to update WhatsApp preference");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground text-sm">Loading preferences...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 pt-0">
      <p className="text-muted-foreground text-sm">
        Choose which notifications you want to receive.
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
              disabled={pref.required}
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
            id="whatsapp-notifications"
            onCheckedChange={handleWhatsAppToggle}
          />
        </div>
      </div>
    </div>
  );
}
