import { Label } from "@pi-dash/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { parseKalakritiPersonQr } from "@pi-dash/shared/kalakriti-person-qr";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useConnectionState, useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { Loader } from "@/components/loader";
import type { ScanActivity } from "@/lib/kalakriti-event-day-policy";
import type {
  StationOperation,
  StationRecordingLedger,
} from "@/lib/kalakriti-scan-recording";
import { handleMutationResult } from "@/lib/mutation-result";

import { EventDayQrScanner } from "./event-day-qr-scanner";

const manualSchema = z.object({
  humanId: z.string().trim().min(1, "Enter a yearly ID").max(64),
});
const MEALS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
];
const SUBMIT_LABELS: Record<StationOperation, string> = {
  volunteer_check_in: "Record check-in",
  breakfast: "Record meal",
  lunch: "Record meal",
  competition_attendance: "Record attendance",
};
interface PanelProps {
  activity: Exclude<ScanActivity, "transport">;
  editionId: string;
  year: number;
  ledger: StationRecordingLedger;
  onBusyChange: (busy: boolean) => void;
}
export function OperationScanPanel({
  activity,
  editionId,
  year,
  ledger,
  onBusyChange,
}: PanelProps) {
  const [edition, editionResult] = useQuery(
    queries.kalakritiEdition.byYear({ year })
  );
  const [sessions, sessionResult] = useQuery(
    queries.kalakritiCompetition.sessions({ editionId }),
    { enabled: activity === "attendance" }
  );
  const [meal, setMeal] = useState<"breakfast" | "lunch">("breakfast");
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const setRecording = useEventCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value);
    onBusyChange(value);
  });
  const sessionOptions = sessions
    .filter(
      (session) =>
        session.cancelledAt === null &&
        session.division?.competition?.cancelledAt === null
    )
    .map((session) => ({
      value: session.id,
      label: `${session.division?.competition?.name ?? "Competition"} · ${session.division?.ageCategory?.name ?? "Division"} · ${new Date(session.startAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}`,
    }));
  const sessionAvailable =
    activity !== "attendance" ||
    (sessionResult.type === "complete" &&
      sessionOptions.some((session) => session.value === sessionId));
  const queryReady =
    editionResult.type === "complete" &&
    edition?.id === editionId &&
    sessionAvailable;
  const type =
    activity === "check_in"
      ? "volunteer_check_in"
      : activity === "meals"
        ? meal
        : "competition_attendance";
  return (
    <div className="space-y-4">
      {activity === "meals" ? (
        <div className="space-y-2">
          <Label htmlFor="scan-meal">Meal</Label>
          <Select
            items={MEALS}
            value={meal}
            disabled={busy}
            onValueChange={(value) => {
              if (
                !busyRef.current &&
                (value === "breakfast" || value === "lunch")
              )
                setMeal(value);
            }}
          >
            <SelectTrigger id="scan-meal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEALS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {activity === "attendance" ? (
        <div className="space-y-2">
          <Label htmlFor="scan-competition-session">Competition session</Label>
          <Select
            items={sessionOptions}
            value={sessionId || null}
            disabled={busy || sessionResult.type !== "complete"}
            onValueChange={(value) => {
              if (!busyRef.current) setSessionId(value ?? "");
            }}
          >
            <SelectTrigger id="scan-competition-session">
              <SelectValue placeholder="Select competition session" />
            </SelectTrigger>
            <SelectContent>
              {sessionOptions.map((session) => (
                <SelectItem key={session.value} value={session.value}>
                  {session.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {sessionResult.type !== "complete" ? (
            <Loader />
          ) : !sessionOptions.length ? (
            <p>No competition sessions are available for scanning.</p>
          ) : null}
          {sessionId &&
          !sessionAvailable &&
          sessionResult.type === "complete" ? (
            <p role="status">
              This session is no longer available. Select a competition session
              to continue.
            </p>
          ) : null}
        </div>
      ) : null}
      <OperationCapture
        key={`${type}:${sessionId}`}
        editionId={editionId}
        year={year}
        type={type}
        sessionId={activity === "attendance" ? sessionId : undefined}
        ledger={ledger}
        onBusyChange={setRecording}
        canRecord={queryReady && edition?.lifecycle === "live"}
      />
    </div>
  );
}
function OperationCapture({
  editionId,
  year,
  type,
  sessionId,
  ledger,
  onBusyChange,
  canRecord,
}: {
  editionId: string;
  year: number;
  type: StationOperation;
  sessionId?: string;
  ledger: StationRecordingLedger;
  onBusyChange: (busy: boolean) => void;
  canRecord: boolean;
}) {
  const zero = useZero();
  const connection = useConnectionState();
  const activeRef = useRef(true);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const ready = canRecord && connection.name === "connected";
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);
  const record = useEventCallback(
    async (
      input:
        | { personQr: string; humanId?: never }
        | { humanId: string; personQr?: never }
    ) => {
      if (!activeRef.current || !ready || busyRef.current) return;
      const attempt = ledger.begin({
        editionId,
        type,
        sessionId,
        subjectKey: input.personQr
          ? `qr:${input.personQr}`
          : `manual:${input.humanId}`,
      });
      if (attempt.status !== "ready") {
        if (input.humanId && attempt.status === "recorded")
          toast.message("Already recorded");
        return;
      }
      busyRef.current = true;
      setBusy(true);
      onBusyChange(true);
      try {
        const response =
          input.personQr !== undefined
            ? await zero.mutate(
                mutators.kalakritiOperation.record({
                  ...attempt.args,
                  personQr: input.personQr,
                })
              ).server
            : await zero.mutate(
                mutators.kalakritiOperation.recordManual({
                  ...attempt.args,
                  humanId: input.humanId,
                })
              ).server;
        attempt.finish(response.type !== "error");
        handleMutationResult(response, {
          entityId: attempt.args.operationId,
          mutation: input.personQr
            ? "kalakritiOperation.record"
            : "kalakritiOperation.recordManual",
          errorMsg: "Operation could not be recorded",
          successMsg: "Operation recorded",
        });
      } catch (error) {
        attempt.finish(false);
        log.error({
          component: "OperationScanPanel",
          action: "record",
          editionId,
          operationId: attempt.args.operationId,
          error: "Scan request failed",
          errorType: error instanceof Error ? error.name : "unknown",
        });
        toast.error("Operation could not be recorded. Try again.");
      } finally {
        busyRef.current = false;
        if (activeRef.current) setBusy(false);
        onBusyChange(false);
      }
    }
  );
  const scan = useEventCallback((value: string) => {
    if (!activeRef.current || !ready || busyRef.current) return;
    let person: ReturnType<typeof parseKalakritiPersonQr>;
    try {
      person = parseKalakritiPersonQr(value.trim());
    } catch {
      log.error({
        component: "OperationScanPanel",
        action: "parsePersonQr",
        editionId,
        error: "Invalid person QR",
      });
      toast.error("Scan a valid person QR code", { id: "station-invalid-qr" });
      return;
    }
    if (
      person.type === "guardian" ||
      (type === "volunteer_check_in" && person.type !== "volunteer") ||
      (type === "competition_attendance" && person.type !== "student")
    ) {
      toast.error(
        type === "volunteer_check_in"
          ? "Scan a Volunteer QR code"
          : type === "competition_attendance"
            ? "Scan a Student QR code"
            : "Scan a Student or Volunteer QR code",
        { id: "station-invalid-qr" }
      );
      return;
    }
    void record({ personQr: JSON.stringify(person) });
  });
  const form = useForm({
    defaultValues: { humanId: "" },
    validators: { onChange: manualSchema, onSubmit: manualSchema },
    onSubmit: async ({ value }) => {
      await record({ humanId: value.humanId.trim() });
    },
  });
  return (
    <div className="space-y-4">
      {!canRecord ? (
        <p role="status">
          Scanning requires a live Edition and a ready, authorized scanning
          activity.
        </p>
      ) : null}
      {connection.name !== "connected" ? (
        <p role="status">Scanning requires an online connection.</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium">Scan person QR</h3>
          {ready ? <EventDayQrScanner onScan={scan} /> : null}
        </div>
        <FormLayout form={form}>
          <fieldset className="space-y-3" disabled={!ready || busy}>
            <InputField
              autoComplete="off"
              isRequired
              label="Yearly ID"
              name="humanId"
              placeholder={`KAL-${year}-0001`}
            />
            <FormActions
              submitLabel={SUBMIT_LABELS[type]}
              submittingLabel="Recording..."
              disabled={!ready || busy}
            />
          </fieldset>
        </FormLayout>
      </div>
    </div>
  );
}
