import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";

import { SettingsCard, SettingsRow } from "@/components/settings/settings-ui";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  triggerEventInterestExpiry,
  triggerR2Cleanup,
  triggerWhatsAppGroupScan,
} from "@/functions/admin-actions";
import { getErrorMessage } from "@/lib/errors";

export function AdminActionsSection() {
  const navigate = useNavigate();
  const scanWhatsAppGroups = useServerFn(triggerWhatsAppGroupScan);
  const r2Cleanup = useServerFn(triggerR2Cleanup);
  const expireInterests = useServerFn(triggerEventInterestExpiry);

  const [scanningGroups, setScanningGroups] = useState(false);
  const [scanConfirmOpen, setScanConfirmOpen] = useState(false);
  const [r2CleanupConfirmOpen, setR2CleanupConfirmOpen] = useState(false);
  const [r2Cleaning, setR2Cleaning] = useState(false);
  const [expiringInterests, setExpiringInterests] = useState(false);
  const [expiryConfirmOpen, setExpiryConfirmOpen] = useState(false);

  /** A toast action opening Jobs filtered to the queue just triggered. */
  const viewJobAction = (queue: string) => ({
    label: "View job",
    onClick: () =>
      navigate({
        search: {
          filters: createFilterQuery([
            createFilterRule({
              id: "queue",
              operator: "is",
              path: ["queue"],
              value: queue,
            }),
          ]),
        } as never,
        to: "/jobs",
      }),
  });

  const handleScanGroups = useEventCallback(async () => {
    setScanningGroups(true);
    try {
      await scanWhatsAppGroups();
      toast.success("Scan started. Results come through as a notification.");
    } catch (error) {
      log.error({
        action: "triggerWhatsAppGroupScan",
        component: "AdminActionsSection",
        error: getErrorMessage(error),
      });
      toast.error("Couldn't trigger scan");
    }
    setScanningGroups(false);
    setScanConfirmOpen(false);
  });

  const handleR2DryRun = useEventCallback(async () => {
    setR2Cleaning(true);
    try {
      await r2Cleanup({ data: { dryRun: true } });
      toast.success("Dry run started. The job output lists orphaned files.", {
        action: viewJobAction("cleanup-r2-orphans"),
      });
    } catch (error) {
      log.error({
        action: "triggerR2DryRun",
        component: "AdminActionsSection",
        error: getErrorMessage(error),
      });
      toast.error("Couldn't trigger dry run");
    }
    setR2Cleaning(false);
  });

  const handleR2Cleanup = useEventCallback(async () => {
    setR2Cleaning(true);
    try {
      await r2Cleanup({ data: { dryRun: false } });
      toast.success("Cleanup started. Orphaned files will be deleted.", {
        action: viewJobAction("cleanup-r2-orphans"),
      });
    } catch (error) {
      log.error({
        action: "triggerR2Cleanup",
        component: "AdminActionsSection",
        error: getErrorMessage(error),
      });
      toast.error("Couldn't trigger cleanup");
    }
    setR2Cleaning(false);
    setR2CleanupConfirmOpen(false);
  });
  const handleExpireInterests = useEventCallback(async () => {
    setExpiringInterests(true);
    try {
      await expireInterests();
      toast.success("Expiry started. The job output has the count.", {
        action: viewJobAction("expire-event-interests"),
      });
    } catch (error) {
      log.error({
        action: "triggerEventInterestExpiry",
        component: "AdminActionsSection",
        error: getErrorMessage(error),
      });
      toast.error("Couldn't start expiry");
    }
    setExpiringInterests(false);
    setExpiryConfirmOpen(false);
  });
  const openExpiryConfirm = useEventCallback(() => setExpiryConfirmOpen(true));

  const stableOnClick1 = useEventCallback(() => setR2CleanupConfirmOpen(true));

  const openScanConfirm = useEventCallback(() => setScanConfirmOpen(true));

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard>
        <SettingsRow
          description="Deactivate people who aren't in any group, reactivate inactive people found in one, and report numbers that haven't registered."
          title="WhatsApp group scan"
        >
          <Button
            disabled={scanningGroups}
            onClick={openScanConfirm}
            size="sm"
            variant="outline"
          >
            {scanningGroups ? "Starting..." : "Scan groups"}
          </Button>
        </SettingsRow>
        <SettingsRow
          description="Delete files in storage that no record points to. Files uploaded in the last 24 hours are skipped. Do a dry run first to see the list."
          title="Storage cleanup"
        >
          <Button
            disabled={r2Cleaning}
            onClick={handleR2DryRun}
            size="sm"
            variant="outline"
          >
            {r2Cleaning ? "Running..." : "Dry run"}
          </Button>
          <Button
            className="ml-4"
            disabled={r2Cleaning}
            onClick={stableOnClick1}
            size="sm"
            variant="destructive"
          >
            Clean up
          </Button>
        </SettingsRow>
        <SettingsRow
          description="Close interest requests still pending for events that have started. Volunteers see them as not reviewed. Runs every night at midnight."
          title="Expire interest requests"
        >
          <Button
            disabled={expiringInterests}
            onClick={openExpiryConfirm}
            size="sm"
            variant="outline"
          >
            {expiringInterests ? "Starting..." : "Run now"}
          </Button>
        </SettingsRow>
      </SettingsCard>

      <ConfirmDialog
        confirmLabel="Expire requests"
        description="Every interest request still pending for an event that has started will be marked not reviewed. Leads can no longer approve them. No one is notified."
        loading={expiringInterests}
        loadingLabel="Starting..."
        onConfirm={handleExpireInterests}
        onOpenChange={setExpiryConfirmOpen}
        open={expiryConfirmOpen}
        title="Expire pending interest requests?"
      />

      <ConfirmDialog
        confirmLabel="Scan now"
        description="This will scan WhatsApp groups and auto-deactivate users not found in any group, reactivate inactive users found in groups, and report unregistered phone numbers."
        loading={scanningGroups}
        loadingLabel="Starting..."
        onConfirm={handleScanGroups}
        onOpenChange={setScanConfirmOpen}
        open={scanConfirmOpen}
        title="Scan WhatsApp groups?"
      />

      <ConfirmDialog
        confirmLabel="Delete orphaned files"
        description="This will permanently delete all R2 files not referenced by any database record. Run a dry run first to preview what will be deleted."
        loading={r2Cleaning}
        loadingLabel="Triggering..."
        onConfirm={handleR2Cleanup}
        onOpenChange={setR2CleanupConfirmOpen}
        open={r2CleanupConfirmOpen}
        title="Clean up orphaned R2 files?"
        variant="destructive"
      />
    </div>
  );
}
