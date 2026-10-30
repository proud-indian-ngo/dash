import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { Switch } from "@pi-dash/design-system/components/ui/switch";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  isSoleFinanceApprover,
  SOLE_FINANCE_APPROVER_CONFIG_KEY,
} from "@pi-dash/shared/approval-policy";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";

import { SettingsCard, SettingsRow } from "@/components/settings/settings-ui";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { handleMutationResult } from "@/lib/mutation-result";
import { isAwaitingResult } from "@/lib/zero-result";

const KILL_SWITCH_KEY = "notifications_disabled";

export function GeneralSection() {
  const zero = useZero();
  const [configs, result] = useQuery(queries.appConfig.all());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isLoading = configs.length === 0 && isAwaitingResult(result);

  const notificationsDisabled =
    configs.find((c) => c.key === KILL_SWITCH_KEY)?.value === "true";
  const soleFinanceApprover = isSoleFinanceApprover(
    configs.find((c) => c.key === SOLE_FINANCE_APPROVER_CONFIG_KEY)?.value
  );

  const applyToggle = async (checked: boolean) => {
    const value = checked ? "true" : "false";
    const successMsg = checked
      ? "All notifications disabled"
      : "Notifications re-enabled";
    try {
      const res = await zero.mutate(
        mutators.appConfig.upsert({ key: KILL_SWITCH_KEY, value })
      ).server;
      handleMutationResult(res, {
        entityId: KILL_SWITCH_KEY,
        errorMsg: "Couldn't update notification setting",
        mutation: "appConfig.upsert",
        successMsg,
      });
    } catch (caughtError) {
      log.error({
        action: "toggleNotifications",
        caughtError:
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError),
        checked,
        component: "GeneralSection",
      });
      toast.error("Couldn't update notification setting");
    }
  };
  const handleToggle = useEventCallback(async (checked: boolean) => {
    if (checked) {
      setConfirmOpen(true);
      return;
    }
    await applyToggle(false);
  });
  const handleSoleFinanceApproverToggle = useEventCallback(
    async (checked: boolean) => {
      const res = await zero.mutate(
        mutators.appConfig.upsert({
          key: SOLE_FINANCE_APPROVER_CONFIG_KEY,
          value: checked ? "true" : "false",
        })
      ).server;
      handleMutationResult(res, {
        entityId: SOLE_FINANCE_APPROVER_CONFIG_KEY,
        errorMsg: "Couldn't update the finance approval setting",
        mutation: "appConfig.upsert",
        successMsg: checked
          ? "Finance can approve their own requests"
          : "Own requests need another finance approver",
      });
    }
  );
  const stableOnConfirm0 = useEventCallback(() => {
    setConfirmOpen(false);
    applyToggle(true);
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
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
    <div className="flex flex-col gap-4">
      {notificationsDisabled ? (
        <div className="border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10 rounded-md border p-3 text-sm">
          All notifications are off. Nobody gets emails, inbox messages or
          WhatsApp messages until you turn this back on.
        </div>
      ) : null}

      <SettingsCard>
        <SettingsRow
          description="Stops every notification on every channel (email, inbox, WhatsApp) for everyone."
          inline
          title="Turn off all notifications"
        >
          <Switch
            aria-label="Disable all notifications"
            checked={notificationsDisabled}
            onCheckedChange={handleToggle}
          />
        </SettingsRow>
        <SettingsRow
          description="Finance may approve and pay requests they raised, claim or approved as programme lead. Turn this off once someone else in finance can approve."
          inline
          title="One person handles finance"
        >
          <Switch
            aria-label="One person handles finance"
            checked={soleFinanceApprover}
            onCheckedChange={handleSoleFinanceApproverToggle}
          />
        </SettingsRow>
      </SettingsCard>

      <ConfirmDialog
        confirmLabel="Turn off notifications"
        description="Nobody will get emails, inbox messages or WhatsApp messages until you turn this back on."
        onConfirm={stableOnConfirm0}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title="Turn off all notifications?"
      />
    </div>
  );
}
