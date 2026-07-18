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
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { handleMutationResult } from "@/lib/mutation-result";

const DATE_TIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function dateTimeParts(timestamp: number, timeZone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    })
      .formatToParts(new Date(timestamp))
      .map((part) => [part.type, part.value])
  );
}

function formatEditionDateTime(timestamp: number, timeZone: string): string {
  const parts = dateTimeParts(timestamp, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function parseEditionDateTime(value: string, timeZone: string): number {
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
  const zonedGuess = dateTimeParts(guess, timeZone);
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
  ageCategoryId: string;
  cancelledAt: number | null;
  capacity: number;
  competitionId: string;
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
  sessions: readonly CompetitionSessionFormValue[]
) {
  return z
    .object({
      ageCategoryId: z.string().min(1, "Select an Age Category"),
      capacity: z.number().int().min(1),
      competitionId: z.string().min(1, "Select a Competition"),
      endAt: z.string().regex(DATE_TIME_LOCAL_PATTERN, "Select an end time"),
      startAt: z.string().regex(DATE_TIME_LOCAL_PATTERN, "Select a start time"),
      venueId: z.string().min(1, "Select a Venue"),
    })
    .superRefine((value, context) => {
      const validation = validateKalakritiSessionSchedule(
        {
          cancelledAt: null,
          endAt: parseEditionDateTime(value.endAt, timeZone),
          id: sessionId,
          startAt: parseEditionDateTime(value.startAt, timeZone),
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
  ageCategories,
  competitions,
  editionId,
  eventDate,
  onOpenChange,
  session,
  sessions,
  structuralLocked,
  timeZone,
  venues,
}: {
  ageCategories: readonly SessionOption[];
  competitions: readonly SessionOption[];
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
  const categoryOptions = availableOptions(
    ageCategories,
    session?.ageCategoryId
  );
  const competitionOptions = availableOptions(
    competitions,
    session?.competitionId
  );
  const venueOptions = availableOptions(venues, session?.venueId);
  const formSchema = createSessionSchema(
    eventDate,
    timeZone,
    sessionId,
    sessions
  );
  const handleCancel = useEventCallback(() => onOpenChange(false));
  const form = useForm({
    defaultValues: {
      ageCategoryId: session?.ageCategoryId || categoryOptions[0]?.id || "",
      capacity: session ? session.capacity : 20,
      competitionId: session?.competitionId || competitionOptions[0]?.id || "",
      endAt: session
        ? formatEditionDateTime(session.endAt, timeZone)
        : `${eventDate}T10:00`,
      startAt: session
        ? formatEditionDateTime(session.startAt, timeZone)
        : `${eventDate}T09:00`,
      venueId: session?.venueId || venueOptions[0]?.id || "",
    },
    onSubmit: async ({ value }) => {
      const common = {
        ...value,
        auditEntryId: uuidv7(),
        endAt: parseEditionDateTime(value.endAt, timeZone),
        now: Date.now(),
        sessionId,
        startAt: parseEditionDateTime(value.startAt, timeZone),
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
        label="Competition"
        name="competitionId"
        options={competitionOptions.map((option) => ({
          label: option.name,
          value: option.id,
        }))}
      />
      <SelectField
        disabled={structuralLocked}
        isRequired
        label="Age Category"
        name="ageCategoryId"
        options={categoryOptions.map((option) => ({
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
      <InputField
        description="Capacity counts Entries; a group Entry uses one place."
        disabled={structuralLocked}
        isRequired
        label="Entry capacity"
        name="capacity"
        type="number"
      />
      <FormActions
        onCancel={handleCancel}
        submitLabel={session ? "Save Session" : "Create Session"}
        submittingLabel={session ? "Saving..." : "Creating..."}
      />
    </FormLayout>
  );
}

export function CompetitionSessionFormDialog({
  ageCategories,
  competitions,
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
  ageCategories: readonly SessionOption[];
  competitions: readonly SessionOption[];
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
              ? "Competition, Age Category, and capacity are locked. Update the Session time or Venue, or cancel the Session."
              : "Schedule one Competition and Age Category in an active Venue."}
          </DialogDescription>
        </DialogHeader>
        <SessionForm
          ageCategories={ageCategories}
          competitions={competitions}
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
