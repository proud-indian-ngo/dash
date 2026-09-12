import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useRef, useState } from "react";

import {
  SCAN_ACTIVITY_LABELS,
  type ScanActivity,
} from "@/lib/kalakriti-event-day-policy";
import {
  createStationRecordingLedger,
  type StationRecordingLedger,
} from "@/lib/kalakriti-scan-recording";

import { CenterScanPanel } from "./center-scan-dialog";
import { OperationScanPanel } from "./operation-scan-panel";

export function ScanDialog({
  editionId,
  year,
  activities,
  onOpenChange,
  ledger: providedLedger,
}: {
  editionId: string;
  year: number;
  activities: readonly ScanActivity[];
  onOpenChange: (open: boolean) => void;
  ledger?: StationRecordingLedger;
}) {
  const [activity, setActivity] = useState<ScanActivity | undefined>(() =>
    activities.includes("transport") ? "transport" : activities[0]
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [localLedger] = useState(createStationRecordingLedger);
  const ledger = providedLedger ?? localLedger;
  const setRecording = useEventCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  });
  const close = useEventCallback((open: boolean) => {
    if (!busyRef.current) onOpenChange(open);
  });
  const changeActivity = useEventCallback((value: unknown) => {
    if (!busyRef.current) {
      const next = activities.find((item) => item === value);
      if (next) setActivity(next);
    }
  });
  const allowed = activity !== undefined && activities.includes(activity);
  return (
    <Dialog open={true} onOpenChange={close}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
        initialFocus={headingRef}
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle ref={headingRef} tabIndex={-1}>
            Scan
          </DialogTitle>
          <DialogDescription>
            Scan a person QR or enter a yearly ID. Recording requires a live
            Edition and an online connection.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={activity ?? "unavailable"} onValueChange={changeActivity}>
          {activities.length > 1 ? (
            <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
              {activities.map((item) => (
                <TabsTrigger key={item} value={item} disabled={busy}>
                  {SCAN_ACTIVITY_LABELS[item]}
                </TabsTrigger>
              ))}
            </TabsList>
          ) : allowed ? (
            <h3 className="font-medium">{SCAN_ACTIVITY_LABELS[activity]}</h3>
          ) : null}
          <TabsContent
            value={activity ?? "unavailable"}
            role={activities.length > 1 ? "tabpanel" : "region"}
            aria-label={
              allowed ? SCAN_ACTIVITY_LABELS[activity] : "Scanning unavailable"
            }
          >
            {!allowed ? (
              <p role="status">
                This scanning activity is no longer available. Close and reopen
                Scan.
              </p>
            ) : activity === "transport" ? (
              <CenterScanPanel
                editionId={editionId}
                year={year}
                onComplete={() => onOpenChange(false)}
                onBusyChange={setRecording}
              />
            ) : (
              <OperationScanPanel
                key={activity}
                activity={activity}
                editionId={editionId}
                year={year}
                ledger={ledger}
                onBusyChange={setRecording}
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
