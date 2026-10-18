import { Label } from "@pi-dash/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type KalakritiPersonQr,
  parseKalakritiPersonQr,
} from "@pi-dash/shared/kalakriti-person-qr";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useConnectionState, useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { Loader } from "@/components/loader";
import {
  canScanKalakritiPerson,
  type ScanActivity,
} from "@/lib/kalakriti-event-day-policy";
import type {
  StationOperation,
  StationRecordingLedger,
} from "@/lib/kalakriti-scan-recording";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

import { EventDayQrScanner } from "./event-day-qr-scanner";
import { ManualScanEntry, normalizeManualScanId } from "./manual-scan-entry";
import { ScanResultCard, useScanResult } from "./scan-result-card";

const manualSchema = z.object({
  humanId: z.string().trim().min(1, "Enter a person ID").max(64),
});
const MEALS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
];
const RECORDED_LABELS: Record<StationOperation, string> = {
  volunteer_check_in: "Checked in",
  breakfast: "Breakfast recorded",
  lunch: "Lunch recorded",
  competition_attendance: "Attendance recorded",
};
const PERSON_LABELS: Record<KalakritiPersonQr["type"], string> = {
  student: "Student",
  volunteer: "Volunteer",
  guardian: "Guardian",
  guest: "Guest",
  judge: "Judge",
};
const SUBMIT_LABELS: Record<StationOperation, string> = {
  volunteer_check_in: "Record check-in",
  breakfast: "Record meal",
  lunch: "Record meal",
  competition_attendance: "Record attendance",
};
interface PanelProps {
  activity: Exclude<ScanActivity, "transport" | "dispatch" | "return">;
  editionId: string;
  year: number;
  ledger: StationRecordingLedger;
  fixedSessionId?: string;
  onBusyChange: (busy: boolean) => void;
}
export function OperationScanPanel({
  activity,
  editionId,
  year,
  ledger,
  fixedSessionId,
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
  const [sessionId, setSessionId] = useState(fixedSessionId ?? "");
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
  const selectedSession = sessionOptions.find(
    (session) => session.value === sessionId
  );
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
          <p className="text-muted-foreground text-sm">
            Students need pickup; Volunteers, Guests and Judges need check-in;
            Guardians need active registration.
          </p>
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
          {fixedSessionId ? (
            <p className="text-sm font-medium">Competition session</p>
          ) : (
            <Label htmlFor="scan-competition-session">
              Competition session
            </Label>
          )}
          {fixedSessionId ? (
            <p className="text-sm">
              {selectedSession?.label ?? "Checking competition session..."}
            </p>
          ) : (
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
          )}
          {sessionResult.type !== "complete" ? (
            <Loader />
          ) : !sessionOptions.length ? (
            <p>No competition sessions are available for scanning.</p>
          ) : null}
          {sessionId &&
          !sessionAvailable &&
          sessionResult.type === "complete" ? (
            <p role="status">
              This session is no longer available.
              {fixedSessionId
                ? " Close the scanner and choose an active session."
                : " Select a competition session to continue."}
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
async function recordOperation(
  zero: ReturnType<typeof useZero>,
  attempt: Extract<
    ReturnType<StationRecordingLedger["begin"]>,
    { status: "ready" }
  >,
  input:
    | { personQr: string; humanId?: never }
    | { humanId: string; personQr?: never },
  editionId: string,
  onSettled: (error: string | null) => void
) {
  let error: string | null = "The request failed. Try again.";
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
      showErrorToast: false,
    });
    error =
      response.type === "error"
        ? getMutationResultErrorMessage(response.error, "Try again.")
        : null;
  } catch (requestError) {
    attempt.finish(false);
    log.error({
      component: "OperationScanPanel",
      action: "record",
      editionId,
      operationId: attempt.args.operationId,
      error: "Scan request failed",
      errorType: requestError instanceof Error ? requestError.name : "unknown",
    });
  } finally {
    onSettled(error);
  }
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
  const [captureSession] = useState(uuidv7);
  const connection = useConnectionState();
  const activeRef = useRef(true);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const { result, show } = useScanResult();
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
        | { humanId: string; personQr?: never },
      person: string
    ): Promise<boolean> => {
      if (!activeRef.current || !ready || busyRef.current) return false;
      const subjectKey = input.personQr
        ? `qr:${input.personQr}`
        : `manual:${input.humanId}`;
      const source = input.personQr ? "camera" : "manual";
      const attempt = ledger.begin(
        { editionId, type, sessionId, subjectKey },
        captureSession
      );
      if (attempt.status !== "ready") {
        if (attempt.status === "recorded")
          show(
            {
              subject: subjectKey,
              tone: "repeat",
              title: person,
              detail: "Already recorded",
            },
            source
          );
        return false;
      }
      busyRef.current = true;
      setBusy(true);
      onBusyChange(true);
      let recorded = false;
      await recordOperation(zero, attempt, input, editionId, (error) => {
        recorded = error === null;
        busyRef.current = false;
        onBusyChange(false);
        if (!activeRef.current) return;
        setBusy(false);
        show(
          error
            ? {
                subject: subjectKey,
                tone: "error",
                title: `${person} not recorded`,
                detail: error,
              }
            : {
                subject: subjectKey,
                tone: "success",
                title: person,
                detail: RECORDED_LABELS[type],
              },
          source
        );
      });
      return recorded;
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
      show(
        {
          subject: `invalid:${value}`,
          tone: "error",
          title: "Not a person QR code",
          detail: "Scan the QR code on a Kalakriti ID card.",
        },
        "camera"
      );
      return;
    }
    if (!canScanKalakritiPerson(type, person.type)) {
      show(
        {
          subject: `wrong-type:${person.id}`,
          tone: "error",
          title: `${PERSON_LABELS[person.type]} QR code`,
          detail:
            type === "volunteer_check_in"
              ? "Scan a Volunteer, Guardian, Guest or Judge QR code."
              : type === "competition_attendance"
                ? "Scan a Student QR code."
                : "Scan a Student, Volunteer, Guardian, Guest or Judge QR code.",
        },
        "camera"
      );
      return;
    }
    void record(
      { personQr: JSON.stringify(person) },
      PERSON_LABELS[person.type]
    );
  });
  const form = useForm({
    defaultValues: { humanId: "" },
    validators: { onChange: manualSchema, onSubmit: manualSchema },
    onSubmit: async ({ value }) => {
      const humanId = normalizeManualScanId(value.humanId);
      // Clear the field after a record so the next ID can be typed straight away.
      if (await record({ humanId }, humanId)) form.reset();
    },
  });
  const acceptsRecordIds =
    type === "breakfast" || type === "lunch" || type === "volunteer_check_in";
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
      <div className="space-y-3">
        <h3 className="text-sm font-medium max-md:sr-only">Scan person QR</h3>
        {ready ? <EventDayQrScanner onScan={scan} /> : null}
        <ScanResultCard result={result} />
        <ManualScanEntry
          disabled={!ready || busy}
          form={form}
          label={
            acceptsRecordIds ? "Yearly ID or Guardian record ID" : "Yearly ID"
          }
          placeholder={
            acceptsRecordIds ? `KALV-${year}-0001` : `KAL-${year}-0001`
          }
          submitLabel={SUBMIT_LABELS[type]}
          submittingLabel="Recording..."
        />
      </div>
    </div>
  );
}
