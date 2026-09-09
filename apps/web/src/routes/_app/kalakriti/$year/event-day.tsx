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
import { useConnectionState, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { log } from "evlog";
import { useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { EventDayQrScanner } from "@/components/kalakriti/event-day-qr-scanner";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { canAccessKalakritiEventDay } from "@/lib/kalakriti-event-day-policy";
import {
  createEventDayRecordingLedger,
  type StudentTransportCheckpoint,
} from "@/lib/kalakriti-event-day-recording";
import { handleMutationResult } from "@/lib/mutation-result";

const TRANSPORT_OPERATION_TYPES = [
  { label: "Pickup", value: "pickup" },
  { label: "Venue departure", value: "venue_departure" },
  { label: "Drop-off", value: "drop_off" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: StudentTransportCheckpoint;
}>;
const manualSchema = z.object({
  humanId: z.string().trim().min(1, "Enter a yearly ID").max(64),
});

export const Route = createFileRoute("/_app/kalakriti/$year/event-day")({
  beforeLoad: ({ context }) => {
    if (!canAccessKalakritiEventDay(context.kalakritiEditionAccess))
      throw notFound();
  },
  component: KalakritiEventDayPage,
});

function KalakritiEventDayPage() {
  const zero = useZero();
  const connection = useConnectionState();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const isLive = edition.lifecycle === "live";
  const canRecord = isLive && connection.name === "connected";
  const [operationType, setOperationType] =
    useState<StudentTransportCheckpoint>("pickup");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const busy = useRef(false);
  const [ledger] = useState(createEventDayRecordingLedger);

  const recordTransport = useEventCallback(
    async (subject: {
      subjectKey: string;
      personQr?: string;
      humanId?: string;
    }) => {
      if (!canRecord || busy.current) return;
      const attempt = ledger.begin({
        editionId: edition.id,
        type: operationType,
        subjectKey: subject.subjectKey,
      });
      if (attempt.status !== "ready") {
        if (attempt.status === "recorded" && subject.humanId)
          toast.message("Already recorded");
        return;
      }
      busy.current = true;
      setIsSubmitting(true);
      try {
        const result = subject.personQr
          ? await zero.mutate(
              mutators.kalakritiOperation.record({
                ...attempt.args,
                personQr: subject.personQr,
              })
            ).server
          : await zero.mutate(
              mutators.kalakritiOperation.recordManual({
                ...attempt.args,
                humanId: subject.humanId ?? "",
              })
            ).server;
        handleMutationResult(result, {
          entityId: attempt.args.operationId,
          mutation: subject.personQr
            ? "kalakritiOperation.record"
            : "kalakritiOperation.recordManual",
          errorMsg: "Transport operation could not be recorded",
          successMsg: "Transport recorded",
        });
        attempt.finish(result.type !== "error");
      } catch (error) {
        attempt.finish(false);
        log.error({
          component: "KalakritiEventDayPage",
          action: "recordTransport",
          editionId: edition.id,
          operationId: attempt.args.operationId,
          error: "Transport request failed",
          errorType: error instanceof Error ? error.name : "unknown",
        });
        toast.error("Transport could not be recorded. Try again.");
      }
      busy.current = false;
      setIsSubmitting(false);
    }
  );

  const form = useForm({
    defaultValues: { humanId: "" },
    validators: { onChange: manualSchema, onSubmit: manualSchema },
    onSubmit: async ({ value }) => {
      const humanId = value.humanId.trim();
      await recordTransport({ subjectKey: `manual:${humanId}`, humanId });
    },
  });
  const handleOperationTypeChange = useEventCallback((value: string | null) => {
    const checkpoint = TRANSPORT_OPERATION_TYPES.find(
      (option) => option.value === value
    );
    if (checkpoint && !busy.current) setOperationType(checkpoint.value);
  });
  const handleQrScan = useEventCallback(async (value: string) => {
    if (!canRecord || busy.current) return;
    let person: ReturnType<typeof parseKalakritiPersonQr>;
    try {
      person = parseKalakritiPersonQr(value.trim());
    } catch {
      // Invalid QR contents are untrusted; never include them in diagnostics.
      log.error({
        component: "KalakritiEventDayPage",
        action: "parseStudentQr",
        editionId: edition.id,
        error: "Invalid person QR",
      });
      toast.error("Scan a valid Student QR code", { id: "student-qr-invalid" });
      return;
    }
    if (person.type !== "student") {
      toast.error("Scan a Student QR code", { id: "student-qr-invalid" });
      return;
    }
    await recordTransport({
      subjectKey: `student:${person.id}`,
      personQr: JSON.stringify(person),
    });
  });

  return (
    <div className="space-y-8">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        meta="Online-only transport station. Scan a Student QR or enter a yearly ID."
        title="Event day"
      />
      {!isLive ? (
        <p role="status">
          Transport recording is available only while this Edition is live.
        </p>
      ) : null}
      {isLive && !canRecord ? (
        <p role="status">
          Connect to record transport. This station requires an online
          connection.
        </p>
      ) : null}
      <section className="space-y-4 rounded-xl border p-4 sm:p-6">
        <div className="space-y-2">
          <Label htmlFor="transport-operation-type">Transport checkpoint</Label>
          <Select
            disabled={!canRecord || isSubmitting}
            onValueChange={handleOperationTypeChange}
            value={operationType}
          >
            <SelectTrigger id="transport-operation-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSPORT_OPERATION_TYPES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-sm font-medium">Scan Student QR</h2>
            <p className="text-muted-foreground text-sm">
              Use the device camera while online. Duplicate scans at the same
              checkpoint are ignored.
            </p>
            {canRecord ? <EventDayQrScanner onScan={handleQrScan} /> : null}
          </div>
          <FormLayout form={form}>
            <h2 className="text-sm font-medium">Enter yearly ID</h2>
            <p className="text-muted-foreground text-sm">
              Record transport when a Student QR cannot be scanned.
            </p>
            <fieldset
              className="space-y-3"
              disabled={!canRecord || isSubmitting}
            >
              <InputField
                autoComplete="off"
                isRequired
                label="Yearly ID"
                name="humanId"
                placeholder={`KAL-${edition.year}-0001`}
              />
              <FormActions
                submitLabel="Record transport"
                submittingLabel="Recording..."
                disabled={!canRecord || isSubmitting}
              />
            </fieldset>
          </FormLayout>
        </div>
      </section>
    </div>
  );
}
