import { cityValues, reminderTargetValues } from "@pi-dash/shared/constants";
import {
  DEFAULT_RSVP_POLL_LEAD_MINUTES,
  RSVP_POLL_LEAD_PRESETS,
} from "@pi-dash/shared/event-reminders";
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
import { FormSectionHeading } from "@/components/form/form-section";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { useApp } from "@/context/app-context";
import { cityOptions } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";
import { isTeamLead } from "@/lib/team-utils";
import type { EditScope } from "./edit-scope-dialog";
import { RecurrenceBuilder } from "./recurrence-builder";
import { ReminderIntervalsField } from "./reminder-intervals-field";

const eventFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  location: z.string().optional(),
  city: z.enum(cityValues, { message: "City is required" }),
  startTime: z
    .date()
    .optional()
    .refine((d): d is Date => d != null, "Start time is required"),
  endTime: z.date().optional(),
  isPublic: z.boolean(),
  rrule: z.string().optional(),
  excludeRules: z.array(z.string()).optional(),
  whatsappGroupId: z.string().optional(),
  createWaGroup: z.boolean(),
  feedbackEnabled: z.boolean(),
  feedbackDeadline: z.date().optional(),
  postRsvpPoll: z.boolean(),
  rsvpPollLeadMinutes: z.string().min(1),
  reminderIntervals: z.array(z.number()),
  reminderTarget: z.enum(reminderTargetValues),
  postEventNudgesEnabled: z.boolean(),
  inheritVolunteers: z.boolean(),
});

const rsvpPollLeadOptions = RSVP_POLL_LEAD_PRESETS.map((p) => ({
  label: `${p.label} before`,
  value: String(p.minutes),
}));

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
  city: string | null;
  description: string | null;
  endTime: number | null;
  feedbackDeadline: number | null;
  feedbackEnabled: boolean;
  id: string;
  inheritVolunteers: boolean;
  isPublic: boolean;
  location: string | null;
  name: string;
  postEventNudgesEnabled: boolean;
  postRsvpPoll: boolean;
  recurrenceRule: {
    rrule: string;
    exdates?: string[];
    excludeRules?: string[];
  } | null;
  reminderIntervals: number[] | null;
  reminderTarget: string | null;
  rsvpPollLeadMinutes: number;
  seriesId: string | null;
  startTime: number;
  whatsappGroupId: string | null;
}

interface EventFormDialogProps {
  editScope?: EditScope;
  initialValues?: InitialValues;
  mode?: "create" | "edit";
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
    city: (initialValues?.city as (typeof cityValues)[number]) ?? "bangalore",
    startTime: initialValues ? new Date(initialValues.startTime) : undefined,
    endTime: initialValues?.endTime
      ? new Date(initialValues.endTime)
      : undefined,
    isPublic: initialValues?.isPublic ?? false,
    rrule: initialValues?.recurrenceRule?.rrule ?? "",
    excludeRules: initialValues?.recurrenceRule?.excludeRules ?? [],
    whatsappGroupId: initialValues?.whatsappGroupId ?? "",
    createWaGroup: false,
    feedbackEnabled: initialValues?.feedbackEnabled ?? false,
    feedbackDeadline: initialValues?.feedbackDeadline
      ? new Date(initialValues.feedbackDeadline)
      : undefined,
    postEventNudgesEnabled: initialValues?.postEventNudgesEnabled ?? true,
    postRsvpPoll: initialValues?.postRsvpPoll ?? false,
    rsvpPollLeadMinutes: String(
      initialValues?.rsvpPollLeadMinutes ?? DEFAULT_RSVP_POLL_LEAD_MINUTES
    ),
    reminderIntervals: initialValues?.reminderIntervals ?? [],
    reminderTarget:
      (initialValues?.reminderTarget as
        | (typeof reminderTargetValues)[number]
        | null) ?? "group",
    inheritVolunteers: initialValues?.inheritVolunteers ?? false,
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
    city: value.city,
    now: Date.now(),
    startTime: getStartTimeEpoch(value),
    endTime: value.endTime?.getTime(),
    isPublic: value.isPublic,
    whatsappGroupId: value.whatsappGroupId || undefined,
    feedbackEnabled: value.feedbackEnabled,
    feedbackDeadline: value.feedbackDeadline?.getTime() ?? null,
    postRsvpPoll: value.postRsvpPoll,
    rsvpPollLeadMinutes: Number(value.rsvpPollLeadMinutes),
    reminderIntervals: value.reminderIntervals.length
      ? value.reminderIntervals
      : null,
    reminderTarget: value.reminderTarget,
    postEventNudgesEnabled: value.postEventNudgesEnabled,
    inheritVolunteers: value.inheritVolunteers,
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
    city: value.city,
    now: Date.now(),
    startTime: getStartTimeEpoch(value),
    endTime: value.endTime?.getTime(),
    isPublic: value.isPublic,
    whatsappGroupId: value.whatsappGroupId || undefined,
    feedbackEnabled: value.feedbackEnabled,
    feedbackDeadline: value.feedbackDeadline?.getTime() ?? null,
    postRsvpPoll: value.postRsvpPoll,
    rsvpPollLeadMinutes: Number(value.rsvpPollLeadMinutes),
    reminderIntervals: value.reminderIntervals.length
      ? value.reminderIntervals
      : null,
    reminderTarget: value.reminderTarget,
    postEventNudgesEnabled: value.postEventNudgesEnabled,
    inheritVolunteers: value.inheritVolunteers,
    recurrenceRule: value.rrule
      ? {
          rrule: value.rrule,
          excludeRules: value.excludeRules?.length
            ? value.excludeRules
            : undefined,
        }
      : undefined,
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
  const recurrenceRule = value.rrule
    ? {
        rrule: value.rrule,
        excludeRules: value.excludeRules?.length
          ? value.excludeRules
          : undefined,
      }
    : undefined;

  return {
    id: uuidv7(),
    teamId,
    name: value.name.trim(),
    description: value.description?.trim() || undefined,
    location: value.location?.trim() || undefined,
    city: value.city,
    startTime: getStartTimeEpoch(value),
    endTime: value.endTime?.getTime(),
    isPublic: value.isPublic,
    whatsappGroupId: value.whatsappGroupId || undefined,
    createWhatsAppGroup: value.createWaGroup || undefined,
    now: Date.now(),
    recurrenceRule,
    feedbackEnabled: value.feedbackEnabled,
    feedbackDeadline: value.feedbackDeadline?.getTime() ?? null,
    postRsvpPoll: value.postRsvpPoll,
    rsvpPollLeadMinutes: Number(value.rsvpPollLeadMinutes),
    reminderIntervals: value.reminderIntervals.length
      ? value.reminderIntervals
      : null,
    reminderTarget: value.reminderTarget,
    postEventNudgesEnabled: value.postEventNudgesEnabled,
    inheritVolunteers: value.inheritVolunteers,
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
  teamHasWhatsAppGroup,
  teamId,
  userIsTeamLead,
  waGroupOptions,
}: {
  editScope?: EditScope;
  initialValues?: InitialValues;
  isEdit: boolean;
  onOpenChange: (open: boolean) => void;
  originalDate?: string;
  teamHasWhatsAppGroup: boolean;
  teamId: string;
  userIsTeamLead: boolean;
  waGroupOptions: { label: string; value: string }[];
}) {
  const zero = useZero();
  const { hasPermission } = useApp();
  const canBackdate =
    hasPermission("events.create_backdated") || userIsTeamLead;

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

      <FormSectionHeading>Schedule</FormSectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          description="Google Maps, Google Calendar, or Google Meet link"
          label="Location"
          name="location"
          placeholder="https://meet.google.com/..."
        />
        <SelectField
          isRequired
          label="City"
          name="city"
          options={cityOptions}
          placeholder="Select city"
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
      </div>

      <CheckboxField label="Public" name="isPublic" />

      {(!isEdit ||
        editScope === "all" ||
        editScope === "following" ||
        (!editScope && !!initialValues?.recurrenceRule)) && (
        <form.Field name="rrule">
          {(rruleField) => (
            <form.Field name="excludeRules">
              {(excludeField) => (
                <RecurrenceBuilder
                  excludeRules={excludeField.state.value ?? []}
                  onChange={(v) => rruleField.handleChange(v)}
                  onExcludeRulesChange={(v) => excludeField.handleChange(v)}
                  startTime={form.state.values.startTime}
                  value={rruleField.state.value ?? ""}
                />
              )}
            </form.Field>
          )}
        </form.Field>
      )}

      <form.Subscribe selector={(s) => s.values.rrule}>
        {(rrule) =>
          rrule ? (
            <CheckboxField
              description="Copy volunteers from the series to each occurrence"
              label="Inherit volunteers"
              name="inheritVolunteers"
            />
          ) : null
        }
      </form.Subscribe>

      <FormSectionHeading>Notifications</FormSectionHeading>
      <div className="grid items-end gap-4 sm:grid-cols-2">
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
            isEdit || whatsappGroupId ? (
              <div />
            ) : (
              <CheckboxField
                label="Create WhatsApp group"
                name="createWaGroup"
              />
            )
          }
        </form.Subscribe>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <CheckboxField
          description="Participants can share anonymous feedback after the event ends"
          label="Enable anonymous feedback"
          name="feedbackEnabled"
        />
        <CheckboxField
          description="Photo upload and attendance marking reminders after the event"
          label="Send post-event reminders"
          name="postEventNudgesEnabled"
        />
        <form.Subscribe selector={(state) => state.values.whatsappGroupId}>
          {(whatsappGroupId) => {
            const hasGroup = !!whatsappGroupId || teamHasWhatsAppGroup;
            return (
              <CheckboxField
                description={
                  hasGroup
                    ? "Post a WhatsApp RSVP poll before the event"
                    : "Link a WhatsApp group to the event or team first"
                }
                label="Post RSVP poll on WhatsApp"
                name="postRsvpPoll"
                readonly={!hasGroup}
              />
            );
          }}
        </form.Subscribe>
        <form.Subscribe selector={(state) => state.values.postRsvpPoll}>
          {(postRsvpPoll) =>
            postRsvpPoll ? (
              <SelectField
                label="Post poll"
                name="rsvpPollLeadMinutes"
                options={rsvpPollLeadOptions}
              />
            ) : null
          }
        </form.Subscribe>
      </div>

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

      <form.Subscribe selector={(state) => state.values.whatsappGroupId}>
        {(whatsappGroupId) => (
          <form.Field name="reminderIntervals">
            {(intervalsField) => (
              <form.Field name="reminderTarget">
                {(targetField) => (
                  <ReminderIntervalsField
                    hasWhatsappGroup={!!whatsappGroupId || teamHasWhatsAppGroup}
                    onChange={(v) => intervalsField.handleChange(v)}
                    onTargetChange={(v) => targetField.handleChange(v)}
                    reminderTarget={targetField.state.value}
                    value={intervalsField.state.value}
                  />
                )}
              </form.Field>
            )}
          </form.Field>
        )}
      </form.Subscribe>

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
  mode,
  onOpenChange,
  open,
  originalDate,
}: EventFormDialogProps) {
  const isEdit = mode ? mode === "edit" : !!initialValues;
  const isDuplicate = !isEdit && !!initialValues;
  let dialogTitle = "Create Event";
  if (isEdit) {
    dialogTitle = "Edit Event";
  } else if (isDuplicate) {
    dialogTitle = "Duplicate Event";
  }
  // Increment key each time dialog opens to remount form with fresh state
  const [formKey, setFormKey] = useState(0);

  const [whatsappGroups] = useQuery(queries.whatsappGroup.all());
  const [allTeams] = useQuery(queries.team.all());
  const [allEvents] = useQuery(queries.teamEvent.allAccessible());

  const usedGroupIds = new Set<string>();
  for (const t of allTeams ?? []) {
    if (t.whatsappGroupId) {
      usedGroupIds.add(t.whatsappGroupId);
    }
  }
  for (const e of allEvents ?? []) {
    if (e.whatsappGroupId) {
      usedGroupIds.add(e.whatsappGroupId);
    }
  }
  if (isEdit && initialValues?.whatsappGroupId) {
    usedGroupIds.delete(initialValues.whatsappGroupId);
  }

  const waGroupOptions = [
    { label: "None", value: "" },
    ...(whatsappGroups ?? [])
      .filter((g: WhatsappGroup) => !usedGroupIds.has(g.id))
      .map((g: WhatsappGroup) => ({
        label: g.name,
        value: g.id,
      })),
  ];

  const team = (allTeams ?? []).find((t: { id: string }) => t.id === teamId);
  const teamHasWhatsAppGroup = !!team?.whatsappGroupId;
  const { user } = useApp();
  const userIsTeamLead = isTeamLead(team?.members ?? [], user.id);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto [scrollbar-color:var(--color-muted-foreground)_transparent] [scrollbar-width:thin] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
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
          teamHasWhatsAppGroup={teamHasWhatsAppGroup}
          teamId={teamId}
          userIsTeamLead={userIsTeamLead}
          waGroupOptions={waGroupOptions}
        />
      </DialogContent>
    </Dialog>
  );
}
