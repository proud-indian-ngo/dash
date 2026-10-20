import {
  kolkataInstant,
  kolkataParts,
  MEETING_MODE_LABELS,
  MEETING_TITLE_MAX,
  type MeetingMode,
  meetingModeValues,
} from "@pi-dash/shared/meetings";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";

import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { FormModal } from "@/components/form/form-modal";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

import { dateToIso, isoToDate } from "./register-data";

const FUTURE_MONTH = new Date(2100, 11, 1);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface MeetingFormInitial {
  mode: MeetingMode;
  place: string | null;
  startsAt: number | null;
  title: string;
}

/** Creates a meeting, or edits one before it's held. */
export function MeetingFormDialog({
  dateLocked,
  initial,
  meetingId,
  mode,
  onOpenChange,
  onSaved,
  open,
}: {
  /** The notice has gone out: the day and time stay. */
  dateLocked?: boolean;
  initial: MeetingFormInitial;
  meetingId: string;
  mode: "create" | "update";
  onOpenChange: (open: boolean) => void;
  onSaved?: (id: string) => void;
  open: boolean;
}) {
  return (
    <FormModal
      description={
        mode === "create"
          ? "Set the day and place; add the agenda next, then send the notice."
          : undefined
      }
      onOpenChange={onOpenChange}
      open={open}
      size="md"
      title={mode === "create" ? "New meeting" : "Edit meeting"}
    >
      {open ? (
        <MeetingForm
          dateLocked={dateLocked ?? false}
          initial={initial}
          meetingId={meetingId}
          mode={mode}
          onDone={(saved) => {
            onOpenChange(false);
            if (saved) {
              onSaved?.(meetingId);
            }
          }}
        />
      ) : null}
    </FormModal>
  );
}

function MeetingForm({
  dateLocked,
  initial,
  meetingId,
  mode,
  onDone,
}: {
  dateLocked: boolean;
  initial: MeetingFormInitial;
  meetingId: string;
  mode: "create" | "update";
  onDone: (saved: boolean) => void;
}) {
  const zero = useZero();
  const parts = initial.startsAt ? kolkataParts(initial.startsAt) : null;
  const form = useForm({
    defaultValues: {
      date: isoToDate(parts?.date),
      mode: initial.mode as string,
      place: initial.place ?? "",
      time: parts?.time ?? "10:00",
      title: initial.title,
    },
    onSubmit: async ({ value }) => {
      const date = dateToIso(value.date);
      if (!(date && TIME.test(value.time))) {
        return;
      }
      const args = {
        id: meetingId,
        mode: value.mode as MeetingMode,
        place: value.place.trim() || null,
        startsAt: kolkataInstant(date, value.time),
        title: value.title.trim(),
      };
      const result = await zero.mutate(
        mode === "create"
          ? mutators.meeting.create(args)
          : mutators.meeting.update(args)
      ).server;
      handleMutationResult(result, {
        entityId: meetingId,
        errorMsg: `Couldn't save the meeting: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
        mutation: mode === "create" ? "meeting.create" : "meeting.update",
        successMsg: mode === "create" ? "Meeting created" : "Meeting saved",
      });
      if (result.type !== "error") {
        onDone(true);
      }
    },
  });
  return (
    <FormLayout form={form}>
      <InputField
        isRequired
        label="Title"
        maxLength={MEETING_TITLE_MAX}
        name="title"
        placeholder="Board meeting, October 2026"
        validators={{
          onSubmit: ({ value }) =>
            String(value).trim() ? undefined : "Give the meeting a title",
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          disabled={dateLocked}
          endMonth={FUTURE_MONTH}
          isRequired
          label="Day"
          name="date"
          validators={{
            onSubmit: ({ value }) => (value ? undefined : "Choose the day"),
          }}
        />
        <InputField
          description="India time"
          disabled={dateLocked}
          isRequired
          label="Starts at"
          name="time"
          type="time"
          validators={{
            onSubmit: ({ value }) =>
              TIME.test(String(value)) ? undefined : "Give the time as HH:MM",
          }}
        />
      </div>
      <SelectField
        isRequired
        label="Format"
        name="mode"
        options={meetingModeValues.map((value) => ({
          label: MEETING_MODE_LABELS[value],
          value,
        }))}
      />
      <InputField
        description="The address, or the video link's name. Leave the link itself out of the record."
        label="Where"
        name="place"
      />
      <FormActions
        disableWhenInvalid={false}
        onCancel={() => onDone(false)}
        submitLabel={mode === "create" ? "Create meeting" : "Save"}
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}
