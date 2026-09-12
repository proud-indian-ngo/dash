import { Button } from "@pi-dash/design-system/components/ui/button";
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
import { getKalakritiCenterScanProgress } from "@pi-dash/zero/kalakriti-center-scan-rules";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useConnectionState, useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { log } from "evlog";
import { useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { EventDayQrScanner } from "@/components/kalakriti/event-day-qr-scanner";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import {
  createEventDayRecordingLedger,
  type StudentTransportCheckpoint,
} from "@/lib/kalakriti-event-day-recording";
import { handleMutationResult } from "@/lib/mutation-result";

const STAGE_LABELS: Record<StudentTransportCheckpoint, string> = {
  pickup: "Pickup",
  venue_arrival: "Venue arrival",
  venue_departure: "Venue departure",
  drop_off: "Drop-off",
};
const manualSchema = z.object({
  humanId: z.string().trim().min(1, "Enter a yearly ID").max(64),
});

interface CenterScanPanelProps {
  editionId: string;
  year: number;
  onComplete: () => void;
  onBusyChange: (busy: boolean) => void;
}

export function CenterScanPanel({
  editionId,
  year,
  onComplete,
  onBusyChange,
}: CenterScanPanelProps) {
  const [centers, centersResult] = useQuery(
    queries.kalakritiCenter.visible({ editionId })
  );
  const availableCenters = centers.filter(
    (center) => center.retiredAt === null
  );
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(() =>
    centersResult.type === "complete" && availableCenters.length === 1
      ? availableCenters[0]!.id
      : null
  );
  if (
    selectedCenterId === null &&
    centersResult.type === "complete" &&
    availableCenters.length === 1
  ) {
    setSelectedCenterId(availableCenters[0]!.id);
  }
  const centerId = availableCenters.some(
    (center) => center.id === selectedCenterId
  )
    ? selectedCenterId
    : "";
  const loading = centers.length === 0 && centersResult.type !== "complete";
  const [busy, setBusy] = useState(false);
  const handleBusyChange = useEventCallback((value: boolean) => {
    setBusy(value);
    onBusyChange(value);
  });
  return (
    <div className="space-y-4">
      {availableCenters.length === 1 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Center</p>
          <p>{availableCenters[0]!.name}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="scan-center">Center</Label>
          <Select
            items={availableCenters.map((center) => ({
              value: center.id,
              label: center.name,
            }))}
            disabled={busy || loading}
            value={centerId || null}
            onValueChange={(value) => {
              if (!busy) setSelectedCenterId(value ?? "");
            }}
          >
            <SelectTrigger id="scan-center">
              <SelectValue placeholder="Select Center" />
            </SelectTrigger>
            <SelectContent>
              {availableCenters.map((center) => (
                <SelectItem key={center.id} value={center.id}>
                  {center.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {selectedCenterId && !centerId ? (
        <p role="status">
          The selected Center is no longer available. Close and reopen Scan or
          select a Center.
        </p>
      ) : null}
      {loading ? <Loader /> : null}
      {!loading && availableCenters.length === 0 ? (
        <p>No Centers are available for scanning.</p>
      ) : null}
      {centerId ? (
        <CenterScanStation
          key={centerId}
          centerId={centerId}
          editionId={editionId}
          onBusyChange={handleBusyChange}
          onComplete={onComplete}
          year={year}
        />
      ) : null}
    </div>
  );
}

function CenterScanStation({
  centerId,
  editionId,
  onBusyChange,
  onComplete,
  year,
}: {
  centerId: string;
  editionId: string;
  onBusyChange: (busy: boolean) => void;
  onComplete: () => void;
  year: number;
}) {
  const [center, result] = useQuery(
    queries.kalakritiCenterScan.byCenter({ editionId, centerId })
  );
  const queryReady = result.type === "complete";
  const [initialProgress, setInitialProgress] = useState<ReturnType<
    typeof getKalakritiCenterScanProgress
  > | null>(null);
  // Pin only a complete roster/stage snapshot, never a partial cached Center.
  if (!initialProgress && queryReady && center) {
    setInitialProgress(getKalakritiCenterScanProgress(center));
  }
  if (queryReady && !center)
    return <p>Center scanning is not available to your account.</p>;
  if (!initialProgress) return <Loader />;
  return (
    <ActiveCenterScanSession
      centerId={centerId}
      editionId={editionId}
      lifecycle={center?.edition?.lifecycle ?? "unknown"}
      queryReady={queryReady}
      sessionStage={initialProgress.stage}
      onBusyChange={onBusyChange}
      onComplete={onComplete}
      year={year}
      progress={
        center ? getKalakritiCenterScanProgress(center) : initialProgress
      }
    />
  );
}

function ActiveCenterScanSession({
  centerId,
  editionId,
  lifecycle,
  onBusyChange,
  onComplete,
  year,
  progress,
  queryReady,
  sessionStage,
}: {
  centerId: string;
  editionId: string;
  lifecycle: string;
  onBusyChange: (busy: boolean) => void;
  onComplete: () => void;
  year: number;
  progress: ReturnType<typeof getKalakritiCenterScanProgress>;
  queryReady: boolean;
  sessionStage: StudentTransportCheckpoint | null;
}) {
  const zero = useZero();
  const connection = useConnectionState();
  const endedRef = useRef(false);
  const sessionChanged = queryReady && progress.stage !== sessionStage;
  const isLive = lifecycle === "live";
  const online = connection.name === "connected";
  const canRecord =
    queryReady && isLive && online && sessionStage !== null && !sessionChanged;
  const [ledger] = useState(createEventDayRecordingLedger);
  const busyRef = useRef(false);
  const [recording, setRecording] = useState(false);

  const record = useEventCallback(
    async ({ personId, humanId }: { personId?: string; humanId?: string }) => {
      if (!canRecord || !sessionStage || busyRef.current || endedRef.current)
        return;
      const student = progress.roster.find((candidate) =>
        personId ? candidate.id === personId : candidate.humanId === humanId
      );
      if (!student) {
        toast.error("Student is not registered at this Center", {
          id: "center-scan-student",
        });
        return;
      }
      if (
        progress.scannedStudents.some(
          (candidate) => candidate.id === student.id
        )
      ) {
        if (humanId) toast.message(`${student.name} is already marked`);
        return;
      }
      const attempt = ledger.begin({
        editionId,
        centerId,
        expectedStage: sessionStage,
        subjectKey: `student:${student.id}`,
      });
      if (attempt.status !== "ready") {
        if (humanId && attempt.status === "recorded")
          toast.message(`${student.name} is already marked`);
        return;
      }
      busyRef.current = true;
      setRecording(true);
      onBusyChange(true);
      try {
        const response = humanId
          ? await zero.mutate(
              mutators.kalakritiCenterScan.recordManual({
                ...attempt.args,
                humanId,
              })
            ).server
          : await zero.mutate(
              mutators.kalakritiCenterScan.record({
                ...attempt.args,
                personQr: JSON.stringify({ id: student.id, type: "student" }),
              })
            ).server;
        handleMutationResult(response, {
          entityId: attempt.args.operationId,
          mutation: humanId
            ? "kalakritiCenterScan.recordManual"
            : "kalakritiCenterScan.record",
          errorMsg: "Student could not be marked",
          successMsg: `${student.name} marked`,
        });
        attempt.finish(response.type !== "error");
      } catch (error) {
        attempt.finish(false);
        log.error({
          component: "CenterScanDialog",
          action: "markStudent",
          editionId,
          centerId,
          operationId: attempt.args.operationId,
          error: "Student scan request failed",
          errorType: error instanceof Error ? error.name : "unknown",
        });
        toast.error("Student could not be marked. Try again.");
      }
      busyRef.current = false;
      setRecording(false);
      onBusyChange(false);
    }
  );
  const handleScan = useEventCallback(async (value: string) => {
    if (!canRecord || busyRef.current || endedRef.current) return;
    let person: ReturnType<typeof parseKalakritiPersonQr>;
    try {
      person = parseKalakritiPersonQr(value.trim());
    } catch {
      log.error({
        component: "CenterScanDialog",
        action: "parseStudentQr",
        editionId,
        centerId,
        error: "Invalid person QR",
      });
      toast.error("Scan a valid Student QR code", {
        id: "center-scan-invalid",
      });
      return;
    }
    if (person.type !== "student") {
      toast.error("Scan a Student QR code", { id: "center-scan-invalid" });
      return;
    }
    await record({ personId: person.id });
  });
  const form = useForm({
    defaultValues: { humanId: "" },
    validators: { onChange: manualSchema, onSubmit: manualSchema },
    onSubmit: async ({ value }) => {
      await record({ humanId: value.humanId.trim() });
    },
  });
  const finishAction = useConfirmAction<{ stage: StudentTransportCheckpoint }>({
    mutationMeta: {
      entityId: centerId,
      mutation: "kalakritiCenterScan.finalize",
      errorMsg: "Stage could not be finished",
      successMsg: "Stage finished",
    },
    onSuccess: onComplete,
    onConfirm: async ({ stage: expectedStage }) => {
      if (
        !canRecord ||
        busyRef.current ||
        !progress?.canFinalize ||
        progress.stage !== expectedStage
      )
        return {
          type: "error",
          error: {
            message: "Complete the current roster before finishing this stage",
          },
        };
      const attempt = ledger.begin({
        editionId,
        centerId,
        expectedStage,
        subjectKey: "finalize",
      });
      if (attempt.status !== "ready") return { type: "error" };
      busyRef.current = true;
      onBusyChange(true);
      let response;
      try {
        const { id, auditEntryId, now } = attempt.args;
        response = await zero.mutate(
          mutators.kalakritiCenterScan.finalize({
            editionId,
            centerId,
            expectedStage,
            id,
            auditEntryId,
            now,
          })
        ).server;
        attempt.finish(response.type !== "error");
        if (response.type !== "error") endedRef.current = true;
      } catch (error) {
        attempt.finish(false);
        log.error({
          component: "CenterScanDialog",
          action: "finishStage",
          editionId,
          centerId,
          error: "Stage finish request failed",
          errorType: error instanceof Error ? error.name : "unknown",
        });
        response = {
          type: "error",
          error: { message: "Stage could not be finished. Try again." },
        };
      }
      busyRef.current = false;
      onBusyChange(false);
      return response;
    },
  });
  const disabled = !canRecord || recording || finishAction.isLoading;
  return (
    <div className="space-y-4">
      {!isLive ? (
        <p role="status">Scanning will be available when the event starts.</p>
      ) : null}
      {isLive && !online ? (
        <p role="status">You're offline. Reconnect to keep scanning.</p>
      ) : null}
      {progress ? (
        <>
          <h3 className="font-medium">
            Current stage:{" "}
            {sessionStage ? STAGE_LABELS[sessionStage] : "All stages finished"}
          </h3>
          {sessionChanged ? (
            <p role="status">
              Someone has already finished this step. Close this window and open
              Scan again when you're ready for the next part of the trip.
            </p>
          ) : null}
          {sessionStage === "pickup" && !sessionChanged ? (
            <p className="text-muted-foreground text-sm">
              Finish pickup once everyone traveling is marked. Unmarked students
              will be left out of the remaining three stages.
            </p>
          ) : null}
          {progress.stage && !sessionChanged ? (
            <div aria-live="polite">
              <p>
                {progress.scannedStudents.length} of {progress.roster.length}{" "}
                Students marked
              </p>
              <progress
                aria-label="Stage progress"
                className="w-full"
                max={Math.max(progress.roster.length, 1)}
                value={progress.scannedStudents.length}
              />
            </div>
          ) : null}
          {progress.stage && !sessionChanged && progress.roster.length === 0 ? (
            <p>No Students are registered at this Center.</p>
          ) : null}
          <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
            <div>
              <h3 className="mb-2 text-sm font-medium">Scan Student QR</h3>
              {canRecord ? <EventDayQrScanner onScan={handleScan} /> : null}
            </div>
            <FormLayout form={form}>
              <h3 className="text-sm font-medium">
                Can't scan? Enter yearly ID
              </h3>
              <fieldset className="space-y-3" disabled={disabled}>
                <InputField
                  autoComplete="off"
                  isRequired
                  label="Yearly ID"
                  name="humanId"
                  placeholder={`KAL-${year}-0001`}
                />
                <FormActions
                  submitLabel="Mark Student"
                  submittingLabel="Marking..."
                  disabled={disabled}
                />
              </fieldset>
            </FormLayout>
          </div>
          {progress.stage && !sessionChanged ? (
            <>
              <h3 className="text-sm font-medium">Missing Students</h3>
              {progress.missingStudents.length ? (
                <ul className="max-h-44 overflow-y-auto">
                  {progress.missingStudents.map((student) => (
                    <li key={student.id}>
                      {student.name} · {student.humanId}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>All Students are marked.</p>
              )}
              <Button
                disabled={disabled || !progress.canFinalize}
                onClick={() => {
                  if (progress.stage)
                    finishAction.trigger({ stage: progress.stage });
                }}
                type="button"
              >
                Finish stage
              </Button>
            </>
          ) : null}
        </>
      ) : null}
      <ConfirmDialog
        title={`Finish ${finishAction.payload ? STAGE_LABELS[finishAction.payload.stage] : "stage"}?`}
        description={
          finishAction.payload?.stage === "pickup" &&
          progress.missingStudents.length > 0
            ? `Finish pickup? ${progress.scannedStudents.length} marked, ${progress.missingStudents.length} absent. Only the marked students will be included in the rest of the trip.`
            : "Everyone is marked. Finish this step and close the scanner? Open Scan again for the next part of the trip."
        }
        confirmLabel="Finish stage"
        loadingLabel="Finishing..."
        loading={finishAction.isLoading}
        confirmDisabled={!canRecord || !progress.canFinalize || recording}
        open={finishAction.isOpen}
        onConfirm={finishAction.confirm}
        onOpenChange={(open) => {
          if (!open) finishAction.cancel();
        }}
        variant="default"
      />
    </div>
  );
}
