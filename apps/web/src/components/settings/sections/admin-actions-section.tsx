import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  triggerR2Cleanup,
  triggerWhatsAppGroupScan,
} from "@/functions/admin-actions";
import { getErrorMessage } from "@/lib/errors";

export function AdminActionsSection() {
  const scanWhatsAppGroups = useServerFn(triggerWhatsAppGroupScan);
  const r2Cleanup = useServerFn(triggerR2Cleanup);

  const [scanningGroups, setScanningGroups] = useState(false);
  const [scanConfirmOpen, setScanConfirmOpen] = useState(false);
  const [r2CleanupConfirmOpen, setR2CleanupConfirmOpen] = useState(false);
  const [r2Cleaning, setR2Cleaning] = useState(false);

  const handleScanGroups = async () => {
    setScanningGroups(true);
    try {
      await scanWhatsAppGroups();
      toast.success(
        "Scan started — results will come through as a notification"
      );
    } catch (error) {
      log.error({
        component: "AdminActionsSection",
        action: "triggerWhatsAppGroupScan",
        error: getErrorMessage(error),
      });
      toast.error("Couldn't trigger scan");
    } finally {
      setScanningGroups(false);
      setScanConfirmOpen(false);
    }
  };

  const handleR2DryRun = async () => {
    setR2Cleaning(true);
    try {
      await r2Cleanup({ data: { dryRun: true } });
      toast.success(
        "Dry run started — check Jobs page for orphan list in output"
      );
    } catch (error) {
      log.error({
        component: "AdminActionsSection",
        action: "triggerR2DryRun",
        error: getErrorMessage(error),
      });
      toast.error("Couldn't trigger dry run");
    } finally {
      setR2Cleaning(false);
    }
  };

  const handleR2Cleanup = async () => {
    setR2Cleaning(true);
    try {
      await r2Cleanup({ data: { dryRun: false } });
      toast.success("Cleanup started — orphaned files will be deleted");
    } catch (error) {
      log.error({
        component: "AdminActionsSection",
        action: "triggerR2Cleanup",
        error: getErrorMessage(error),
      });
      toast.error("Couldn't trigger cleanup");
    } finally {
      setR2Cleaning(false);
      setR2CleanupConfirmOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4">
      <p className="text-muted-foreground text-sm">
        Manually trigger background jobs. Results appear on the Jobs page.
      </p>

      <div className="space-y-1">
        <p className="font-medium text-sm">WhatsApp Group Scan</p>
        <p className="text-muted-foreground text-sm">
          Scan groups and auto-deactivate users not in any group, reactivate
          inactive users found in groups, and report unregistered numbers.
        </p>
        <div className="pt-2">
          <Button
            disabled={scanningGroups}
            onClick={() => setScanConfirmOpen(true)}
            size="sm"
            variant="outline"
          >
            {scanningGroups ? "Triggering..." : "Scan groups"}
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-1">
        <p className="font-medium text-sm">R2 Storage Cleanup</p>
        <p className="text-muted-foreground text-sm">
          Find and delete orphaned files in R2 that are not referenced by any
          database record. Files uploaded in the last 24 hours are skipped.
        </p>
        <div className="flex gap-2 pt-2">
          <Button
            disabled={r2Cleaning}
            onClick={handleR2DryRun}
            size="sm"
            variant="outline"
          >
            {r2Cleaning ? "Running..." : "Dry run"}
          </Button>
          <Button
            disabled={r2Cleaning}
            onClick={() => setR2CleanupConfirmOpen(true)}
            size="sm"
            variant="destructive"
          >
            Clean up
          </Button>
        </div>
      </div>

      <ConfirmDialog
        confirmLabel="Scan now"
        description="This will scan WhatsApp groups and auto-deactivate users not found in any group, reactivate inactive users found in groups, and report unregistered phone numbers."
        loading={scanningGroups}
        loadingLabel="Triggering..."
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
