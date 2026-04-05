import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { WhatsappGroup } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { CheckboxField } from "@/components/form/checkbox-field";
import { DateTimeField } from "@/components/form/date-time-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import { useApp } from "@/context/app-context";
import { handleMutationResult } from "@/lib/mutation-result";
import type { EditScope } from "./edit-scope-dialog";
import { RecurrenceBuilder } from "./recurrence-builder";
import { ReminderIntervalsField } from "./reminder-intervals-field";

const eventFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  location: z.string().optional(),
  startTime: z
    .date()
    .optional()
    .refine((d): d is Date => d != null, "Start time is required"),
  endTime: z.date().optional(),
  isPublic: z.boolean(),
  rrule: z.string().optional(),
  whatsappGroupId: z.string().optional(),
  createWaGroup: z.boolean(),
  feedbackEnabled: z.boolean(),
  feedbackDeadline: z.date().optional(),
  reminderIntervals: z.array(z.number()),
});

const endTimeAfterStartTime = (data: EventFormValues) =>
  !(data.endTime && data.startTime) || data.endTime > data.startTime;

function createEventFormSchema(isEdit: boolean, canBackdate: boolean) {
  const withEndTimeCheck = eventFormSchema.refine(endTimeAfterStartTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  });
  if (isEdit || canBackdate) {
    return withEndTimeCheck;
  }
  return withEndTimeCheck.refine(
    (data) => data.startTime == null || data.startTime > new Date(),
    { message: "Start time must be in the future", path: ["startTime"] }
  );
}

type EventFormValues = z.infer<typeof eventFormSchema>;

interface InitialValues {
  description: string | null;
  endTime: number | null;
  feedbackDeadline: number | null;
  feedbackEnabled: boolean;
  id: string;
  isPublic: boolean;
  location: string | null;
  name: string;
  recurrenceRule: {
    rrule: string;
    exdates?: string[];
  } | null;
  reminderIntervals: number[] | null;
  seriesId: string | null;
  startTime: number;
  whatsappGroupId: string | null;
}

interface EventFormDialogProps {
  editScope?: EditScope;
  initialValues?: InitialValues;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  originalDate?: string;
  teamId: string;
}

function getDefaultValues(initialValues?: InitialValues): EventFormValues {
  return {
    name: initialValues?.name ?? "",
    description: initialValues?.description ?? "",
    location: initialValues?.location ?? "",
    startTime: initialValues ? new Date(initialValues.startTime) : undefined,
    endTime: initialValues?.endTime
      ? new Date(initialValues.endTime)
      : undefined,
    isPublic: initialValues?.isPublic ?? false,
    rrule: initialValues?.recurrenceRule?.rrule ?? "",
    whatsappGroupId: initialValues?.whatsappGroupId ?? "",
    createWaGroup: false,
    feedbackEnabled: initialValues?.feedbackEnabled ?? false,
    feedbackDeadline: initialValues?.feedbackDeadline
      ? new Date(initialValues.feedbackDeadline)
      : undefined,
    reminderIntervals: initialValues?.reminderIntervals ?? [],
  };
}

function getStartTimeEpoch(value: EventFormValues): number {
  if (!value.startTime) {
    throw new Error("startTime is required");
  }
  return value.startTime.getTime();
}

function buildUpdateMutatorArgs(id: string, value: EventFormValues) {
  return {
    id,
    name: value.name.trim(),
    description: value.description?.trim() || undefined,
    location: value.location?.trim() || undefined,
    now: Date.now(),
    startTime: getStartTimeEpoch(value),
    endTime: value.endTime?.getTime(),
    isPublic: value.isPublic,
    whatsappGroupId: value.whatsappGroupId || undefined,
    feedbackEnabled: value.feedbackEnabled,
    feedbackDeadline: value.feedbackDeadline?.getTime() ?? null,
    reminderIntervals: value.reminderIntervals.length
      ? value.reminderIntervals
      : null,
  };
}

function buildUpdateSeriesArgs(
  id: string,
  value: EventFormValues,
  editScope: EditScope,
  originalDate?: string
) {
  const base = {
    id,
    mode: editScope as "this" | "following" | "all",
    name: value.name.trim(),
    description: value.description?.trim() || undefined,
    location: value.location?.trim() || undefined,
    now: Date.now(),
    startTime: getStartTimeEpoch(value),
    endTime: value.endTime?.getTime(),
    isPublic: value.isPublic,
    whatsappGroupId: value.whatsappGroupId || undefined,
    feedbackEnabled: value.feedbackEnabled,
    feedbackDeadline: value.feedbackDeadline?.getTime() ?? null,
    reminderIntervals: value.reminderIntervals.length
      ? value.reminderIntervals
      : null,
    recurrenceRule: value.rrule ? { rrule: value.rrule } : undefined,
  };
  if (editScope === "this") {
    return { ...base, originalDate, newExceptionId: uuidv7() };
  }
  if (editScope === "following") {
    return { ...base, originalDate, newSeriesId: uuidv7() };
  }
  return base;
}

function buildCreateMutatorArgs(teamId: string, value: EventFormValues) {
  const recurrenceRule = value.rrule ? { rrule: value.rrule } : undefined;

  return {
    id: crypto.randomUUID(),
    teamId,
    name: value.name.trim(),
    description: value.description?.trim() || undefined,
    location: value.location?.trim() || undefined,
    startTime: getStartTimeEpoch(value),
    endTime: value.endTime?.getTime(),
    isPublic: value.isPublic,
    whatsappGroupId: value.whatsappGroupId || undefined,
    createWhatsAppGroup: value.createWaGroup || undefined,
    now: Date.now(),
    recurrenceRule,
    feedbackEnabled: value.feedbackEnabled,
    feedbackDeadline: value.feedbackDeadline?.getTime() ?? null,
    reminderIntervals: value.reminderIntervals.length
      ? value.reminderIntervals
      : null,
  };
}

function getMutation(
  zero: ReturnType<typeof useZero>,
  value: EventFormValues,
  editScope: EditScope | undefined,
  initialValues: InitialValues | undefined,
  originalDate: string | undefined,
  isEdit: boolean,
  teamId: string
) {
  if (editScope && initialValues) {
    // "this" targets the event itself (exception or series parent).
    // "following"/"all" target the series parent.
    const targetId =
      editScope === "this"
        ? initialValues.id
        : (initialValues.seriesId ?? initialValues.id);
    return {
      mutation: zero.mutate(
        mutators.teamEvent.updateSeries(
          buildUpdateSeriesArgs(targetId, value, editScope, originalDate)
        )
      ),
      mutationName: "teamEvent.updateSeries",
    };
  }
  if (isEdit && initialValues) {
    return {
      mutation: zero.mutate(
        mutators.teamEvent.update(
          buildUpdateMutatorArgs(initialValues.id, value)
        )
      ),
      mutationName: "teamEvent.update",
    };
  }
  return {
    mutation: zero.mutate(
      mutators.teamEvent.create(buildCreateMutatorArgs(teamId, value))
    ),
    mutationName: "teamEvent.create",
  };
}

function EventFormContent({
  editScope,
  initialValues,
  isEdit,
  onOpenChange,
  originalDate,
  teamId,
  waGroupOptions,
}: {
  editScope?: EditScope;
  initialValues?: InitialValues;
  isEdit: boolean;
  onOpenChange: (open: boolean) => void;
  originalDate?: string;
  teamId: string;
  waGroupOptions: { label: string; value: string }[];
}) {
  const zero = useZero();
  const { hasPermission } = useApp();
  const canBackdate = hasPermission("events.create_backdated");

  const form = useForm({
    defaultValues: getDefaultValues(initialValues),
    onSubmit: async ({ value }) => {
      const { mutation, mutationName } = getMutation(
        zero,
        value,
        editScope,
        initialValues,
        originalDate,
        isEdit,
        teamId
      );
      const entityId = isEdit && initialValues ? initialValues.id : "new";
      let successMsg = "Event created";
      if (isEdit) {
        successMsg = "Event updated";
      } else if (value.createWaGroup) {
        successMsg = "Event created. WhatsApp group will be created shortly.";
      }
      const res = await mutation.server;
      handleMutationResult(res, {
        mutation: mutationName,
        entityId,
        successMsg,
        errorMsg: isEdit ? "Failed to update event" : "Failed to create event",
      });
      if (res.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: {
      onBlur: eventFormSchema,
      onSubmit: createEventFormSchema(isEdit, canBackdate),
    },
  });

  return (
    <FormLayout form={form}>
      <InputField
        isRequired
        label="Name"
        name="name"
        placeholder="Event name"
      />
      <TextareaField
        label="Description"
        name="description"
        placeholder="Optional description"
        rows={3}
      />
      <InputField
        description="Google Maps, Google Calendar, or Google Meet link"
        label="Location"
        name="location"
        placeholder="https://meet.google.com/..."
      />
      <form.Subscribe selector={(state) => state.values.startTime}>
        {(startTime) => (
          <DateTimeField
            description={
              canBackdate && startTime && startTime < new Date()
                ? "Past dates allowed — team won't be notified"
                : undefined
            }
            isRequired
            label="Start Time"
            name="startTime"
          />
        )}
      </form.Subscribe>
      <DateTimeField label="End Time" name="endTime" />
      <CheckboxField label="Public" name="isPublic" />
      {/* Show recurrence builder: on create, scope edits for "all"/"following", or editing a series parent directly */}
      {(!isEdit ||
        editScope === "all" ||
        editScope === "following" ||
        (!editScope && !!initialValues?.recurrenceRule)) && (
        <form.Field name="rrule">
          {(field) => (
            <RecurrenceBuilder
              onChange={(v) => field.handleChange(v)}
              startTime={form.state.values.startTime}
              value={field.state.value ?? ""}
            />
          )}
        </form.Field>
      )}
      <SelectField
        label="WhatsApp Group"
        name="whatsappGroupId"
        options={waGroupOptions}
        placeholder="None"
      />
      <form.Subscribe
        selector={(state) => ({
          whatsappGroupId: state.values.whatsappGroupId,
        })}
      >
        {({ whatsappGroupId }) =>
          isEdit || whatsappGroupId ? null : (
            <CheckboxField label="Create WhatsApp group" name="createWaGroup" />
          )
        }
      </form.Subscribe>
      <CheckboxField
        description="Participants can share anonymous feedback after the event ends"
        label="Enable anonymous feedback"
        name="feedbackEnabled"
      />
      <form.Subscribe selector={(state) => state.values.feedbackEnabled}>
        {(feedbackEnabled) =>
          feedbackEnabled ? (
            <DateTimeField
              description="Leave empty for no deadline"
              label="Feedback deadline (optional)"
              name="feedbackDeadline"
            />
          ) : null
        }
      </form.Subscribe>
      <form.Field name="reminderIntervals">
        {(field) => (
          <ReminderIntervalsField
            onChange={(v) => field.handleChange(v)}
            value={field.state.value}
          />
        )}
      </form.Field>
      <FormActions
        onCancel={() => onOpenChange(false)}
        submitLabel={isEdit ? "Save" : "Create"}
        submittingLabel={isEdit ? "Saving..." : "Creating..."}
      />
    </FormLayout>
  );
}

export function EventFormDialog({
  editScope,
  teamId,
  initialValues,
  onOpenChange,
  open,
  originalDate,
}: EventFormDialogProps) {
  const isEdit = !!initialValues;
  // Increment key each time dialog opens to remount form with fresh state
  const [formKey, setFormKey] = useState(0);

  const [whatsappGroups] = useQuery(queries.whatsappGroup.all());
  const waGroupOptions = [
    { label: "None", value: "" },
    ...(whatsappGroups ?? []).map((g: WhatsappGroup) => ({
      label: g.name,
      value: g.id,
    })),
  ];

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Event" : "Create Event"}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? "Edit event details" : "Create a new event"}
          </DialogDescription>
        </DialogHeader>
        <EventFormContent
          editScope={editScope}
          initialValues={initialValues}
          isEdit={isEdit}
          key={formKey}
          onOpenChange={onOpenChange}
          originalDate={originalDate}
          teamId={teamId}
          waGroupOptions={waGroupOptions}
        />
      </DialogContent>
    </Dialog>
  );
}
