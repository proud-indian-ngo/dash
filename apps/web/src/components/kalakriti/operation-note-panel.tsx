import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useConnectionState, useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import { Loader } from "@/components/loader";
import { useApp } from "@/context/app-context";
import {
  getOperationNoteTypes,
  isOperationNoteTargetCurrent,
  makeOperationNoteAttempt,
  type OperationNoteLedger,
} from "@/lib/kalakriti-operation-note";
import { handleMutationResult } from "@/lib/mutation-result";

const lookupSchema = z.object({
  humanId: z.string().trim().min(1, "Enter a yearly ID").max(64),
});
const noteSchema = z.object({
  targetOperationId: z.string().min(1, "Select an operation"),
  reason: z.string().trim().min(1, "A reason is required").max(500),
});

function PersonLookup({ onLookup }: { onLookup: (humanId: string) => void }) {
  const form = useForm({
    defaultValues: { humanId: "" },
    validators: { onChange: lookupSchema, onSubmit: lookupSchema },
    onSubmit: ({ value }) => onLookup(value.humanId.trim()),
  });
  return (
    <FormLayout form={form}>
      <InputField
        name="humanId"
        label="Yearly ID"
        description="Enter a yearly ID or person UUID."
        isRequired
      />
      <FormActions submitLabel="Look up" />
    </FormLayout>
  );
}

function NoteForm({
  ledger,
  options,
  ready,
  onSubmit,
}: {
  ledger: OperationNoteLedger;
  options: { label: string; value: string }[];
  ready: boolean;
  onSubmit: (value: z.infer<typeof noteSchema>) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: {
      targetOperationId: ledger.attempt?.args.targetOperationId ?? "",
      reason: ledger.attempt?.args.reason ?? "",
    },
    validators: { onChange: noteSchema, onSubmit: noteSchema },
    onSubmit: ({ value }) => onSubmit(value),
  });
  return (
    <FormLayout form={form}>
      <SelectField
        name="targetOperationId"
        label="Operation"
        options={options}
        placeholder="Select the exact operation"
        isRequired
        disabled={!ready || Boolean(ledger.attempt)}
      />
      <TextareaField
        name="reason"
        label="Reason"
        isRequired
        disabled={Boolean(ledger.attempt)}
      />
      <FormActions
        disabled={!ready}
        submitLabel={
          ledger.attempt ? "Retry correction note" : "Add correction note"
        }
        submittingLabel="Adding correction note..."
      />
    </FormLayout>
  );
}

export function OperationNotePanel({
  editionId,
  year,
  ledger,
  onBusyChange,
}: {
  editionId: string;
  year: number;
  ledger: OperationNoteLedger;
  onBusyChange: (busy: boolean) => void;
}) {
  const zero = useZero();
  const connection = useConnectionState();
  const { hasPermission } = useApp();
  const isGlobalAdmin = hasPermission("kalakriti.admin");
  const [edition, editionResult] = useQuery(
    queries.kalakritiEdition.byYear({ year })
  );
  const [membership, membershipResult] = useQuery(
    queries.kalakritiAssignment.myAccess({ editionId }),
    { enabled: !isGlobalAdmin }
  );
  const [humanId, setHumanId] = useState(ledger.attempt?.humanId ?? "");
  const [student, studentResult] = useQuery(
    queries.kalakritiOperation.studentByHumanId({
      editionId,
      humanId: humanId || "_",
    }),
    { enabled: Boolean(humanId) }
  );
  const [person, personResult] = useQuery(
    queries.kalakritiOperation.membershipByHumanId({
      editionId,
      humanId: humanId || "_",
    }),
    {
      enabled:
        Boolean(humanId) && studentResult.type === "complete" && !student,
    }
  );
  const subject =
    humanId && student
      ? { studentId: student.id }
      : humanId && person
        ? { membershipId: person.id }
        : null;
  const lookupComplete =
    studentResult.type === "complete" &&
    (Boolean(student) || personResult.type === "complete");
  const [operations = [], operationsResult] = useQuery(
    subject
      ? queries.kalakritiOperation.bySubject({ editionId, ...subject })
      : null
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [formKey, setFormKey] = useState(0);
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      onBusyChange(false);
    };
  }, [onBusyChange]);
  const allowedTypes = getOperationNoteTypes({
    isGlobalAdmin,
    lifecycle: edition?.lifecycle ?? "",
    membership: membershipResult.type === "complete" ? membership : null,
  });
  const options = operations.flatMap((operation) => {
    const type = allowedTypes.find((item) => item.value === operation.type);
    if (!type || !isOperationNoteTargetCurrent(operation, ledger.attempt))
      return [];
    const session = operation.session;
    const sessionLabel = session
      ? ` · ${session.division?.competition?.name ?? "Competition"} · session ${new Date(session.startAt).toLocaleString("en-IN", { timeZone: edition?.timezone || "Asia/Kolkata" })}`
      : "";
    return [
      {
        value: operation.id,
        label: `${type.label}${sessionLabel} · ${new Date(operation.occurredAt).toLocaleString("en-IN", { timeZone: edition?.timezone || "Asia/Kolkata" })}`,
      },
    ];
  });
  const ready =
    connection.name === "connected" &&
    editionResult.type === "complete" &&
    edition?.id === editionId &&
    allowedTypes.length > 0 &&
    lookupComplete &&
    operationsResult.type === "complete" &&
    Boolean(subject);
  const submit = useEventCallback(async (value: z.infer<typeof noteSchema>) => {
    if (
      !active.current ||
      pending.current ||
      !ready ||
      !subject ||
      !options.some((option) => option.value === value.targetOperationId)
    )
      return;
    const attempt =
      ledger.attempt ??
      makeOperationNoteAttempt({
        editionId,
        targetOperationId: value.targetOperationId,
        reason: value.reason,
        humanId,
        subject,
      });
    ledger.setAttempt(attempt);
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    setFeedback("");
    try {
      const result = await zero.mutate(
        mutators.kalakritiOperation.correct(attempt.args)
      ).server;
      ledger.setAttempt(null);
      if (!active.current) return;
      handleMutationResult(result, {
        mutation: "kalakritiOperation.correct",
        entityId: attempt.args.targetOperationId,
        successMsg: "Correction note added",
        errorMsg: "Correction note could not be added",
      });
      if (result.type !== "error") setFormKey((key) => key + 1);
    } catch (error) {
      log.error({
        component: "OperationNotePanel",
        action: "correct",
        editionId,
        targetOperationId: attempt.args.targetOperationId,
        error: "Correction note response uncertain",
        errorType: error instanceof Error ? error.name : "unknown",
      });
      if (active.current)
        setFeedback(
          "Response uncertain. Retry to confirm the same correction note. Its target and reason are locked."
        );
    } finally {
      pending.current = false;
      if (active.current) {
        setBusy(false);
      }
    }
  });
  const queryError =
    studentResult.type === "error" ||
    personResult.type === "error" ||
    operationsResult.type === "error";
  const lookupPending =
    connection.name === "connected" &&
    !queryError &&
    (!lookupComplete ||
      (Boolean(subject) && operationsResult.type !== "complete"));
  useEffect(() => {
    onBusyChange(busy || (Boolean(humanId) && lookupPending));
  }, [busy, humanId, lookupPending, onBusyChange]);
  const lookup = useEventCallback((value: string) => {
    onBusyChange(true);
    setHumanId(value);
  });
  return (
    <section className="space-y-4" aria-label="Add correction note">
      <h3 className="font-medium">Add correction note</h3>
      <p className="text-muted-foreground text-sm">
        Add a reason to a replacement history record. The scan remains
        effective; this does not undo it. Meal undo remains a separate action in
        Food.
      </p>
      {!humanId ? (
        <PersonLookup onLookup={lookup} />
      ) : (
        <>
          <p>Yearly ID: {humanId}</p>
          {queryError ? (
            <p role="alert">
              Correction records could not be loaded. Close and reopen Scan to
              try again.
            </p>
          ) : (!lookupComplete && !subject) ||
            (subject &&
              operations.length === 0 &&
              operationsResult.type !== "complete") ? (
            <Loader />
          ) : !subject ? (
            <p role="status">No authorized person found for this ID.</p>
          ) : (
            <>
              <NoteForm
                key={`${humanId}:${formKey}`}
                ledger={ledger}
                options={options}
                ready={ready && !busy}
                onSubmit={submit}
              />
              {operationsResult.type === "complete" && options.length === 0 ? (
                <p role="status">
                  No current operation is available for a correction note.
                </p>
              ) : null}
            </>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy || Boolean(ledger.attempt)}
            onClick={() => {
              setHumanId("");
              setFeedback("");
            }}
          >
            Look up another person
          </Button>
        </>
      )}
      {!ready && subject ? (
        <p role="status">
          Wait for an online, authoritative live record and current correction
          access.
        </p>
      ) : null}
      {feedback ? (
        <p role="alert">{feedback}</p>
      ) : ledger.attempt && !busy ? (
        <p role="status">
          An earlier response is uncertain. Retry the same correction note.
        </p>
      ) : null}
    </section>
  );
}
