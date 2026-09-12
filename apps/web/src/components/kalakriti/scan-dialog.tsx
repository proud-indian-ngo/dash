import { Button } from "@pi-dash/design-system/components/ui/button";
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
  createOperationNoteLedger,
  type OperationNoteLedger,
} from "@/lib/kalakriti-operation-note";
import {
  createStationRecordingLedger,
  type StationRecordingLedger,
} from "@/lib/kalakriti-scan-recording";

import { CenterScanPanel } from "./center-scan-dialog";
import { OperationNotePanel } from "./operation-note-panel";
import { OperationScanPanel } from "./operation-scan-panel";
import { ScanCaptureContext } from "./scan-capture-context";

export function ScanDialog({
  editionId,
  year,
  activities,
  onOpenChange,
  ledger: providedLedger,
  canAddNote = false,
  noteLedger: providedNoteLedger,
}: {
  editionId: string;
  year: number;
  activities: readonly ScanActivity[];
  onOpenChange: (open: boolean) => void;
  ledger?: StationRecordingLedger;
  canAddNote?: boolean;
  noteLedger?: OperationNoteLedger;
}) {
  const [mode, setMode] = useState<"scan" | "note">("scan");
  const [localNoteLedger] = useState(createOperationNoteLedger);
  const noteLedger = providedNoteLedger ?? localNoteLedger;
  const [activity, setActivity] = useState<ScanActivity | undefined>(() =>
    activities.includes("transport") ? "transport" : activities[0]
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef({ scan: false, note: false });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [localLedger] = useState(createStationRecordingLedger);
  const ledger = providedLedger ?? localLedger;
  const isBusy = useEventCallback(
    () => busyRef.current.scan || busyRef.current.note
  );
  const updateBusy = useEventCallback(
    (owner: "scan" | "note", value: boolean) => {
      busyRef.current[owner] = value;
      setBusy(isBusy());
    }
  );
  const setRecording = useEventCallback((value: boolean) =>
    updateBusy("scan", value)
  );
  const setNoteRecording = useEventCallback((value: boolean) =>
    updateBusy("note", value)
  );
  const close = useEventCallback((open: boolean) => {
    if (!isBusy()) onOpenChange(open);
  });
  const changeActivity = useEventCallback((value: unknown) => {
    if (!isBusy()) {
      const next = activities.find((item) => item === value);
      if (next) setActivity(next);
    }
  });
  const completeScan = useEventCallback(() => {
    if (mode === "scan") close(false);
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
        {canAddNote || mode === "note" ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (!isBusy()) setMode(mode === "scan" ? "note" : "scan");
            }}
          >
            {mode === "scan" ? "Add correction note" : "Back to scanning"}
          </Button>
        ) : null}
        {mode === "note" ? (
          canAddNote ? (
            <OperationNotePanel
              key={noteLedger.scopeKey}
              editionId={editionId}
              year={year}
              ledger={noteLedger}
              onBusyChange={setNoteRecording}
            />
          ) : (
            <p role="status">Correction access is no longer available.</p>
          )
        ) : null}
        <ScanCaptureContext value={mode === "scan"}>
          <div hidden={mode !== "scan"} inert={mode !== "scan"}>
            <Tabs
              value={activity ?? "unavailable"}
              onValueChange={changeActivity}
            >
              {activities.length > 1 ? (
                <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
                  {activities.map((item) => (
                    <TabsTrigger key={item} value={item} disabled={busy}>
                      {SCAN_ACTIVITY_LABELS[item]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              ) : allowed ? (
                <h3 className="font-medium">
                  {SCAN_ACTIVITY_LABELS[activity]}
                </h3>
              ) : null}
              <TabsContent
                value={activity ?? "unavailable"}
                role={activities.length > 1 ? "tabpanel" : "region"}
                aria-label={
                  allowed
                    ? SCAN_ACTIVITY_LABELS[activity]
                    : "Scanning unavailable"
                }
              >
                {!allowed ? (
                  <p role="status">
                    This scanning activity is no longer available. Close and
                    reopen Scan.
                  </p>
                ) : activity === "transport" ? (
                  <CenterScanPanel
                    editionId={editionId}
                    year={year}
                    onComplete={completeScan}
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
          </div>
        </ScanCaptureContext>
      </DialogContent>
    </Dialog>
  );
}
