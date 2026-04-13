import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { Switch } from "@pi-dash/design-system/components/ui/switch";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { handleMutationResult } from "@/lib/mutation-result";

const KILL_SWITCH_KEY = "notifications_disabled";

export function GeneralSection() {
  const zero = useZero();
  const [configs, result] = useQuery(queries.appConfig.all());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isLoading = configs.length === 0 && result.type !== "complete";

  const notificationsDisabled =
    configs.find((c) => c.key === KILL_SWITCH_KEY)?.value === "true";

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      setConfirmOpen(true);
      return;
    }
    await applyToggle(false);
  };

  const applyToggle = async (checked: boolean) => {
    try {
      const res = await zero.mutate(
        mutators.appConfig.upsert({
          key: KILL_SWITCH_KEY,
          value: checked ? "true" : "false",
        })
      ).server;
      handleMutationResult(res, {
        mutation: "appConfig.upsert",
        entityId: KILL_SWITCH_KEY,
        successMsg: checked
          ? "All notifications disabled"
          : "Notifications re-enabled",
        errorMsg: "Couldn't update notification setting",
      });
    } catch (error) {
      log.error({
        component: "GeneralSection",
        action: "toggleNotifications",
        checked,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Couldn't update notification setting");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <Skeleton className="h-4 w-48" />
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-72" />
          </div>
          <Skeleton className="h-5 w-9 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <p className="text-muted-foreground text-sm">
        Global application settings.
      </p>

      {notificationsDisabled && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          All notifications are currently disabled. Users will not receive any
          emails, inbox messages, or WhatsApp messages.
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-sm">Disable all notifications</p>
          <p className="text-muted-foreground text-sm">
            When enabled, no notifications are sent across all channels (email,
            inbox, WhatsApp).
          </p>
        </div>
        <Switch
          aria-label="Disable all notifications"
          checked={notificationsDisabled}
          onCheckedChange={handleToggle}
        />
      </div>

      <ConfirmDialog
        confirmLabel="Disable notifications"
        description="This will stop all notifications (email, inbox, and WhatsApp) for every user. Are you sure?"
        onConfirm={() => {
          setConfirmOpen(false);
          applyToggle(true);
        }}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title="Disable all notifications"
      />
    </div>
  );
}
