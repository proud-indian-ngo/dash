import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { validateKalakritiSessionSchedule } from "@pi-dash/shared/kalakriti";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useMemo, useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { handleMutationResult } from "@/lib/mutation-result";

const DATE_TIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function dateTimeParts(timestamp: number, formatter: Intl.DateTimeFormat) {
  return Object.fromEntries(
    formatter
      .formatToParts(new Date(timestamp))
      .map((part) => [part.type, part.value])
  );
}

function formatEditionDateTime(
  timestamp: number,
  formatter: Intl.DateTimeFormat
): string {
  const parts = dateTimeParts(timestamp, formatter);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function parseEditionDateTime(
  value: string,
  formatter: Intl.DateTimeFormat
): number {
  const match = DATE_TIME_LOCAL_PATTERN.exec(value);
  if (!match) {
    return Number.NaN;
  }
  const guess = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  );
  const zonedGuess = dateTimeParts(guess, formatter);
  const offset =
    Date.UTC(
      Number(zonedGuess.year),
      Number(zonedGuess.month) - 1,
      Number(zonedGuess.day),
      Number(zonedGuess.hour),
      Number(zonedGuess.minute)
    ) - guess;
  return guess - offset;
}

export interface CompetitionSessionFormValue {
  cancelledAt: number | null;
  divisionId: string;
  endAt: number;
  id: string;
  startAt: number;
  venueId: string;
}

interface SessionOption {
  id: string;
  name: string;
  unavailable: boolean;
}

function createSessionSchema(
  eventDate: string,
  timeZone: string,
  sessionId: string,
  sessions: readonly CompetitionSessionFormValue[],
  formatter: Intl.DateTimeFormat
) {
  return z
    .object({
      divisionId: z.string().min(1, "Select a Competition Division"),
      endAt: z.string().regex(DATE_TIME_LOCAL_PATTERN, "Select an end time"),
      startAt: z.string().regex(DATE_TIME_LOCAL_PATTERN, "Select a start time"),
      venueId: z.string().min(1, "Select a Venue"),
    })
    .superRefine((value, context) => {
      const validation = validateKalakritiSessionSchedule(
        {
          cancelledAt: null,
          endAt: parseEditionDateTime(value.endAt, formatter),
          id: sessionId,
          startAt: parseEditionDateTime(value.startAt, formatter),
          venueId: value.venueId,
        },
        eventDate,
        timeZone,
        sessions
      );
      if (!validation.valid) {
        let message = "End time must be after start time";
        if (validation.reason === "venue_overlap") {
          message = "Venue already has an overlapping Session";
        } else if (validation.reason === "outside_event_date") {
          message = `Session must fall on ${eventDate}`;
        }
        context.addIssue({
          code: "custom",
          message,
          path: [validation.reason === "venue_overlap" ? "venueId" : "endAt"],
        });
      }
    });
}

function availableOptions(
  options: readonly SessionOption[],
  selectedId: string | undefined
) {
  return options.filter(
    (option) => !option.unavailable || option.id === selectedId
  );
}

function SessionForm({
  divisions,
  editionId,
  eventDate,
  onOpenChange,
  session,
  sessions,
  structuralLocked,
  timeZone,
  venues,
}: {
  divisions: readonly SessionOption[];
  editionId: string;
  eventDate: string;
  onOpenChange: (open: boolean) => void;
  session: CompetitionSessionFormValue | null;
  sessions: readonly CompetitionSessionFormValue[];
  structuralLocked: boolean;
  timeZone: string;
  venues: readonly SessionOption[];
}) {
  const zero = useZero();
  const sessionId = session ? session.id : uuidv7();
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        month: "2-digit",
        timeZone,
        year: "numeric",
      }),
    [timeZone]
  );
  const divisionOptions = availableOptions(divisions, session?.divisionId);
  const venueOptions = availableOptions(venues, session?.venueId);
  const formSchema = createSessionSchema(
    eventDate,
    timeZone,
    sessionId,
    sessions,
    dateTimeFormatter
  );
  const handleCancel = useEventCallback(() => onOpenChange(false));
  const form = useForm({
    defaultValues: {
      divisionId: session?.divisionId || divisionOptions[0]?.id || "",
      endAt: session
        ? formatEditionDateTime(session.endAt, dateTimeFormatter)
        : `${eventDate}T10:00`,
      startAt: session
        ? formatEditionDateTime(session.startAt, dateTimeFormatter)
        : `${eventDate}T09:00`,
      venueId: session?.venueId || venueOptions[0]?.id || "",
    },
    onSubmit: async ({ value }) => {
      const common = {
        ...value,
        auditEntryId: uuidv7(),
        endAt: parseEditionDateTime(value.endAt, dateTimeFormatter),
        now: Date.now(),
        sessionId,
        startAt: parseEditionDateTime(value.startAt, dateTimeFormatter),
      };
      const result = session
        ? await zero.mutate(mutators.kalakritiCompetition.updateSession(common))
            .server
        : await zero.mutate(
            mutators.kalakritiCompetition.createSession({
              ...common,
              editionId,
            })
          ).server;
      handleMutationResult(result, {
        entityId: sessionId,
        errorMsg: session
          ? "Failed to update Competition Session"
          : "Failed to create Competition Session",
        mutation: session
          ? "kalakritiCompetition.updateSession"
          : "kalakritiCompetition.createSession",
        successMsg: session
          ? "Competition Session updated"
          : "Competition Session created",
      });
      if (result.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: { onChange: formSchema, onSubmit: formSchema },
  });
  return (
    <FormLayout form={form}>
      <SelectField
        disabled={structuralLocked}
        isRequired
        label="Competition Division"
        name="divisionId"
        options={divisionOptions.map((option) => ({
          label: option.name,
          value: option.id,
        }))}
      />
      <SelectField
        isRequired
        label="Venue"
        name="venueId"
        options={venueOptions.map((option) => ({
          label: option.name,
          value: option.id,
        }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          isRequired
          label={`Start time (${timeZone})`}
          name="startAt"
          type="datetime-local"
        />
        <InputField
          isRequired
          label={`End time (${timeZone})`}
          name="endAt"
          type="datetime-local"
        />
      </div>
      <FormActions
        onCancel={handleCancel}
        submitLabel={session ? "Save Session" : "Create Session"}
        submittingLabel={session ? "Saving..." : "Creating..."}
      />
    </FormLayout>
  );
}

export function CompetitionSessionFormDialog({
  divisions,
  editionId,
  eventDate,
  onOpenChange,
  open,
  session,
  sessions,
  structuralLocked = false,
  timeZone,
  venues,
}: {
  divisions: readonly SessionOption[];
  editionId: string;
  eventDate: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  session: CompetitionSessionFormValue | null;
  sessions: readonly CompetitionSessionFormValue[];
  structuralLocked?: boolean;
  timeZone: string;
  venues: readonly SessionOption[];
}) {
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = useEventCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((key) => key + 1);
    }
    onOpenChange(nextOpen);
  });
  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {session ? "Edit Competition Session" : "Add Competition Session"}
          </DialogTitle>
          <DialogDescription>
            {structuralLocked
              ? "The Competition Division is locked. Update the Session time or Venue, or cancel the Session."
              : "Schedule one Competition Division in an active Venue."}
          </DialogDescription>
        </DialogHeader>
        <SessionForm
          divisions={divisions}
          editionId={editionId}
          eventDate={eventDate}
          key={formKey}
          onOpenChange={onOpenChange}
          session={session}
          sessions={sessions}
          structuralLocked={structuralLocked}
          timeZone={timeZone}
          venues={venues}
        />
      </DialogContent>
    </Dialog>
  );
}
