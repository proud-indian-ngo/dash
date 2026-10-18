import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import { useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import {
  SCAN_ACTIVITY_LABELS,
  type ScanActivity,
} from "@/lib/kalakriti-event-day-policy";
import {
  createStationRecordingLedger,
  type StationRecordingLedger,
} from "@/lib/kalakriti-scan-recording";

import { CenterScanPanel } from "./center-scan-dialog";
import { InventoryScanPanel } from "./inventory-scan-panel";
import { OperationScanPanel } from "./operation-scan-panel";

// Most operators work one station all day; reopen Scan on the activity they
// used last on this device.
const LAST_ACTIVITY_KEY = "kalakriti.scan.activity";

function readLastActivity() {
  try {
    return window.localStorage.getItem(LAST_ACTIVITY_KEY);
  } catch {
    return null;
  }
}

function rememberActivity(activity: ScanActivity) {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, activity);
  } catch {
    // Private mode or full storage: the default activity is fine.
  }
}

const SCAN_ACTIVITY_DESCRIPTIONS: Record<ScanActivity, string> = {
  attendance: "Record Student attendance for a Competition session.",
  check_in: "Check in Volunteers, Guardians, Guests and Judges.",
  dispatch: "Scan a Volunteer, then record dispatched inventory.",
  meals: "Record breakfast or lunch service.",
  return: "Scan a Volunteer, then record returned inventory.",
  transport: "Mark Students at each transport stage.",
};

export function ScanDialog({
  editionId,
  year,
  activities,
  onOpenChange,
  ledger: providedLedger,
  initialActivity,
  fixedSessionId,
}: {
  editionId: string;
  year: number;
  activities: readonly ScanActivity[];
  onOpenChange: (open: boolean) => void;
  ledger?: StationRecordingLedger;
  initialActivity?: ScanActivity;
  fixedSessionId?: string;
}) {
  const isMobile = useIsMobile();
  const [activity, setActivity] = useState<ScanActivity | undefined>(() => {
    if (initialActivity && activities.includes(initialActivity))
      return initialActivity;
    const last = activities.find((item) => item === readLastActivity());
    if (last) return last;
    return activities.includes("transport") ? "transport" : activities[0];
  });
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
      if (next) {
        setActivity(next);
        rememberActivity(next);
      }
    }
  });
  const allowed = activity !== undefined && activities.includes(activity);
  return (
    <Dialog open={true} onOpenChange={close}>
      <DialogContent
        // Phones get a full-height sheet that leads with the camera, so its
        // height holds steady as results and activities change.
        aria-label="Scan"
        // A full-height sheet keeps its rows at the top instead of spreading them.
        bodyClassName="content-start"
        className="data-[swipe-direction=down]:h-[94dvh] data-[swipe-direction=down]:max-h-[94dvh] sm:max-w-6xl md:max-h-[90dvh] md:overflow-y-auto"
        initialFocus={headingRef}
        showCloseButton={!busy}
      >
        <DialogHeader className="relative">
          <DialogTitle ref={headingRef} tabIndex={-1}>
            Scan
          </DialogTitle>
          {/* The phone sheet is nearly full height, so it needs a visible way out. */}
          {isMobile && !busy ? (
            <Button
              className="absolute top-1/2 right-0 -translate-y-1/2"
              onClick={() => close(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Close
            </Button>
          ) : null}
          <DialogDescription className="max-md:sr-only">
            {allowed && activity
              ? SCAN_ACTIVITY_DESCRIPTIONS[activity]
              : "Choose an available scanning activity."}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={activity ?? "unavailable"} onValueChange={changeActivity}>
          {activities.length > 1 && isMobile ? (
            <Select
              items={activities.map((item) => ({
                value: item,
                label: SCAN_ACTIVITY_LABELS[item],
              }))}
              value={activity ?? null}
              disabled={busy}
              onValueChange={changeActivity}
            >
              <SelectTrigger aria-label="Scanning activity" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {activities.map((item) => (
                  <SelectItem key={item} value={item}>
                    {SCAN_ACTIVITY_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : activities.length > 1 ? (
            <TabsList className="flex w-full flex-wrap gap-1 group-data-horizontal/tabs:h-auto">
              {activities.map((item) => (
                <TabsTrigger
                  key={item}
                  value={item}
                  disabled={busy}
                  className="h-auto min-h-8 min-w-0 basis-36 px-3 py-2 whitespace-normal"
                >
                  {SCAN_ACTIVITY_LABELS[item]}
                </TabsTrigger>
              ))}
            </TabsList>
          ) : allowed ? (
            <h3 className="font-medium">{SCAN_ACTIVITY_LABELS[activity]}</h3>
          ) : null}
          <TabsContent
            value={activity ?? "unavailable"}
            className="max-md:mt-3"
            role={activities.length > 1 && !isMobile ? "tabpanel" : "region"}
            aria-label={
              allowed ? SCAN_ACTIVITY_LABELS[activity] : "Scanning unavailable"
            }
          >
            <ScanActivityPanel
              activity={allowed ? activity : undefined}
              editionId={editionId}
              year={year}
              ledger={ledger}
              fixedSessionId={fixedSessionId}
              onBusyChange={setRecording}
              onComplete={() => onOpenChange(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ScanActivityPanel({
  activity,
  editionId,
  year,
  ledger,
  fixedSessionId,
  onBusyChange,
  onComplete,
}: {
  activity: ScanActivity | undefined;
  editionId: string;
  year: number;
  ledger: StationRecordingLedger;
  fixedSessionId?: string;
  onBusyChange: (busy: boolean) => void;
  onComplete: () => void;
}) {
  switch (activity) {
    case undefined:
      return (
        <p role="status">
          This scanning activity is no longer available. Close and reopen Scan.
        </p>
      );
    case "transport":
      return (
        <CenterScanPanel
          editionId={editionId}
          year={year}
          onComplete={onComplete}
          onBusyChange={onBusyChange}
        />
      );
    case "dispatch":
    case "return":
      return (
        <InventoryScanPanel
          key={activity}
          action={activity}
          editionId={editionId}
          year={year}
          onBusyChange={onBusyChange}
        />
      );
    default:
      return (
        <OperationScanPanel
          key={activity}
          activity={activity}
          editionId={editionId}
          year={year}
          ledger={ledger}
          fixedSessionId={fixedSessionId}
          onBusyChange={onBusyChange}
        />
      );
  }
}
